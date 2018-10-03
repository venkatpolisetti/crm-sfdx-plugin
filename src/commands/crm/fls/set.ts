import { core, flags, SfdxCommand } from '@salesforce/command';
import * as _ from 'lodash';
import * as xml2js from 'xml2js';
import * as util from 'util';
import * as csvToJson from 'csvtojson';
import chalk from 'chalk';
import { SaveResult } from 'jsforce';

/*
field => visible true, readonly false
Profile => Read Access true, edit access true
field => visible false, readonly true
profile => read Access false, edit access false
field => visible true, readonly true
profile => read Access true, edit access false
*/
core.Messages.importMessagesDirectory(__dirname);
const messages = core.Messages.loadMessages('crm-sfdx-plugin', 'fls');

interface FieldPermission {
	field: string,
	readable: boolean,
	editable: boolean
}

interface ProfileMetadata {
	fullName: string,
	fieldPermissions: FieldPermission[]
}

interface StandardProfile {
	Id: string,
	Name: string,
	MetaName: string
}

export default class set extends SfdxCommand {

	public static description = messages.getMessage('commandDescription');

	public static examples = [
		`$ sfdx crm:fls:set\n` +
		`          -u myalias\n` +
		`          --datafile=./datafile.csv`,
		`$ sfdx crm:fls:set\n` +
		`          -u myalias\n` +
		`          --packagexml=./package.xml\n` +
		`          --profiles="System Administrator,*Read*,Our Custom Profile"`,
		`$ sfdx crm:fls:set\n` +
		`          -u myalias\n` +
		`          --sobjects="Account,MyCustomObject__c"\n` +
		`          --profiles="Standard*"\n` +
		`          --filter="LastModifiedBy.LastName='Doe' AND LastModifiedDate=TODAY"\n` +
		`          --visibleaccess=true --readonlyaccess=false`
	];

	protected static flagsConfig = {
		packagexml: { type: 'filepath', char: 'm', description: messages.getMessage('packagexmlFlagDescription') },
		datafile: { type: 'filepath', char: 'd', description: messages.getMessage('datafileFlagDescription') },
		profiles: flags.string({ char: 'p', description: messages.getMessage('profilesFlagDescription') }),
		sobjects: flags.string({ char: 'o', description: messages.getMessage('objectsFlagDescription') }),
		filter: flags.string({ char: 'f', description: messages.getMessage('filterFlagDescription') }),
		visibleaccess: flags.string({ char: 'h', description: messages.getMessage('visibleaccessFlagDescription') }),
		readonlyaccess: flags.string({ char: 'r', description: messages.getMessage('readonlyaccessFlagDescription') }),
		verbose: flags.boolean({ char: 'v', description: messages.getMessage('verboseFlagDescription') }),
		checkonly: flags.boolean({ char: 'c', description: messages.getMessage('checkonlyFlagDescription') }),
	};

	protected static requiresUsername = true;

	public async run(): Promise<core.AnyJson> {
		let profileMetadata: ProfileMetadata[] = new Array<ProfileMetadata>();
		let packagexml;

		// validate parameters
		// packagexml flag: profiles flag required
		if (this.flags.packagexml && this.flags.profiles == undefined) {
			throw new core.SfdxError('--profiles must be specified when --packagexml is used');
		}

		// sobjects flag: profiles and filter flags required
		if (this.flags.sobjects && (this.flags.profiles == undefined|| this.flags.filter == undefined)) {
			throw new core.SfdxError('--profiles and --filter must be specified when --sobjects is used');
		}

		// set defaults to visibleaccess and readonlyaccess
		if (this.flags.visibleaccess) {
			if (!this.flags.visibleaccess.match(/^true$|^false$/i)) {
				throw new core.SfdxError("Invalid value for --visibleaccess. Valid values true or false");
			}
		} else {
			this.flags.visibleaccess = 'true';
		}

		if (this.flags.readonlyaccess) {
			if (!this.flags.readonlyaccess.match(/^true$|^false$/i)) {
				throw new core.SfdxError("Invalid value for --readonlyaccess. Valid values are true or false");
			}
		} else {
			this.flags.readonlyaccess = 'false';
		}

		if (!this.flags.verbose)
			this.flags.verbose = false;

		if (this.flags.checkonly) {
			this.flags.verbose = true;
		}

		this.ux.startSpinner('Getting Profile data');
		const conn = this.org.getConnection();
		const profileData = await conn.query("SELECT Id, Name FROM Profile WHERE userType = 'Standard' order by Name");
		const standardProfiles: StandardProfile[] = profileData.records.map((v: { Id, Name }) => { return { Id: v.Id, Name: v.Name, MetaName: '' } });
		const metaProfileData = await conn.metadata.list({ type: 'Profile' }, conn.getApiVersion());
		const metaProfiles = metaProfileData.map(m => { return { Id: m.id, Name: decodeURI(m.fullName) } });
		standardProfiles.forEach(s => { s.MetaName = metaProfiles.find(m => m.Id == s.Id).Name; });
		this.ux.stopSpinner('done.')

		// packagexml
		if (this.flags.packagexml) {
			this.ux.startSpinner('Processing package.xml');
			profileMetadata = this.processProfilesFlag(standardProfiles);
			let parser = new xml2js.Parser();
			const xmlfile = await core.fs.readFile(this.flags.packagexml);
			packagexml = await util.promisify(parser.parseString.bind(parser))(xmlfile);
			packagexml.Package.types.forEach(type => {
				if (type.name[0] === 'CustomField') {
					type.members.forEach(field => {
						profileMetadata.forEach(profile => {
							profile.fieldPermissions.push({
								field: field,
								readable: this.flags.visibleaccess,
								editable: this.getEditAccess(this.flags.readonlyaccess, this.flags.visibleaccess)
							});
						});
					});
				}
			});
			this.ux.stopSpinner('done.')

			// datafile csv format
		} else if (this.flags.datafile) {

			this.ux.startSpinner('Processing csv file');
			const fieldRows = await csvToJson({
				trim: true
			}).preFileLine((line, index) => {
				if (index === 0) // header row; convet to lowercase
					return line.toLowerCase();
				return line;
			}).fromFile(this.flags.datafile);

			let profiles = new Map();
			fieldRows.forEach(fieldRow => {
				fieldRow.profiles.split(',').map(p => {
					standardProfiles.map(s => {
						if (this.isParamMatchedStandardProfileName(p, s.Name)) {
							let fields = profiles.get(s.Name) || [];
							fields.push(fieldRow);
							profiles.set(s.Name, fields);
						}
					});
				});
			});

			profiles.forEach((value, key, map) => {
				let profileObj = standardProfiles.find(p => p.Name == key);
				let fieldPermissions = [];
				value.forEach(f => {
					fieldPermissions.push({
						field: f.fieldname,
						readable: f.visible,
						editable: this.getEditAccess(f.readonly, f.visible)
					});
				});
				profileMetadata.push({ fullName: profileObj.MetaName, fieldPermissions: fieldPermissions });
			});
			this.ux.stopSpinner('done.')

			// sobjects flag
		} else if (this.flags.sobjects) {

			this.ux.startSpinner('Processing sobjects');
			profileMetadata = this.processProfilesFlag(standardProfiles);

			const customObjectMap = new Map();

			let sobjectFlag = this.flags.sobjects.replace(/__c/gi, '');
			const sobjectStr = "'" + sobjectFlag.split(',').map(v => v.trim()).join("','") + "'";

			const customObjects = await conn.tooling.query("SELECT Id, DeveloperName FROM CustomObject WHERE DeveloperName IN (" + sobjectStr + ")");

			customObjects.records.map((c: { Id, DeveloperName }) => customObjectMap.set(c.Id, c.DeveloperName));
			const customObjIds = "'" + customObjects.records.map((c: { Id, DeveloperName }) => c.Id).join("','") + "'";

			this.flags.filter = this.flags.filter.replace(/__c/gi, '');

			const customFieldResult = await conn.tooling.query(
				'SELECT DeveloperName, TableEnumOrId ' +
				'FROM CustomField ' +
				'WHERE (TableEnumOrId IN (' + sobjectStr + ') OR TableEnumOrId in (' + customObjIds + ')) ' +
				'  AND ' + this.flags.filter);

			//this.ux.log(customFieldResult.records);

			customFieldResult.records.map((r: { DeveloperName, TableEnumOrId }) => { customObjectMap.set(r.TableEnumOrId, r.TableEnumOrId); });
			const customFields = customFieldResult.records.map((r: { DeveloperName, TableEnumOrId }) => {
				const sobjectName = customObjectMap.get(r.TableEnumOrId);
				if (sobjectName == r.TableEnumOrId) {  // standard object
					return r.TableEnumOrId + '.' + r.DeveloperName + '__c';
				} else { // custom object
					return sobjectName + '__c' + '.' + r.DeveloperName + '__c';
				}
			});

			this.ux.log(this.flags.visibleaccess);
			customFields.forEach(field => {
				profileMetadata.forEach(profile => {
					profile.fieldPermissions.push({
						field: field,
						readable: this.getBoolean(this.flags.visibleaccess),
						editable: this.getEditAccess(this.flags.readonlyaccess, this.flags.visibleaccess)
					});
				});
			});
			this.ux.stopSpinner('done');
		}

		let fieldProfileMap = new Map();

		if (this.flags.verbose) {
			profileMetadata.map(v => {
				v.fieldPermissions.map((f: { field, readable, editable }) => {
					let profilesAndInfo = fieldProfileMap.get(f.field) || {};
					let profiles: Array<string> = profilesAndInfo.profiles || new Array<string>();
					let standardProfile = standardProfiles.find((s: { MetaName }) => v.fullName == s.MetaName);
					if (profiles.find(p => p == standardProfile.Name) == undefined)
						profiles.push(standardProfile.Name);
					profilesAndInfo.readable = f.readable;
					profilesAndInfo.editable = f.editable;
					profilesAndInfo.profiles = profiles;
					fieldProfileMap.set(f.field, profilesAndInfo);
				});
			});

			//this.ux.log(JSON.stringify(profileMetadata, null, 2));

			this.ux.log('fieldname,visible,readonly,profiles');
			fieldProfileMap.forEach((value: { readable, editable, profiles }, key: string) => {
				this.ux.log(`${key},${value.readable},${this.getEditAccess(value.editable.toString(), value.readable.toString())},"${value.profiles}"`);
			});
			if (this.flags.checkonly)
				this.ux.log(chalk.greenBright('Total Profiles to update: ' + profileMetadata.length));
		}

		if (this.flags.checkonly) {
			return JSON.stringify([...fieldProfileMap]);
		}

		this.ux.startSpinner('Setting Field Level Security');

		let meta = _.chunk(profileMetadata, 10);
		this.ux.log(chalk.greenBright('Total Profiles to update: ' + profileMetadata.length));
		this.ux.log(chalk.greenBright('Total batches: ' + meta.length));

		let totalResults: Array<SaveResult> = new Array<SaveResult>();
		const promises = meta.map(async (v: ProfileMetadata[], index: number) => {

			let results = await conn.metadata.update('Profile', v);

			totalResults.concat(results);

			let isSuccess: boolean = true;
			if (Array.isArray(results)) {
				results.forEach(r => {
					if (r.success == false) {
						isSuccess = false;
						this.ux.log(r);
					}
				});
			} else {
				if (results.success == false) {
					isSuccess = false;
					this.ux.log(results);
				}
			}
			if (isSuccess) {
				this.ux.log(chalk.yellowBright(`Batch (${index + 1}) processed Successfully`));
			} else {
				this.ux.log(chalk.redBright('\nBatch failed with errros. See above error messages'));
			}
		});

		await Promise.all(promises);

		this.ux.stopSpinner('done');
		this.ux.log(chalk.greenBright('\nProcess Completed'));
		return JSON.stringify(totalResults, null, 2);
	}

	private processProfilesFlag(stdProfiles: StandardProfile[]): ProfileMetadata[] {

		let meta: ProfileMetadata[] = new Array<ProfileMetadata>();

		this.flags.profiles.split(',').map(p => {
			stdProfiles.map(s => {
				if (this.isParamMatchedStandardProfileName(p, s.Name))
					meta.push({ fullName: s.MetaName, fieldPermissions: [] })
			});
		});
		return meta;
	}

	private isParamMatchedStandardProfileName(param: string, profileName: string): boolean {
		let cleanedStr = param.trim().replace(/[.+?^{}()|[\]\\]/g, '\\$&');
		if (!cleanedStr.startsWith('^'))
			cleanedStr = '^' + cleanedStr;
		if (!cleanedStr.endsWith('$'))
			cleanedStr = cleanedStr + '$';
		cleanedStr = cleanedStr.replace(/\*/g, '.*');
		const regex = new RegExp(cleanedStr, "i");
		return profileName.match(regex) != null;
	}

	private getBoolean(param: string): boolean {
		if (param == 'true')
			return true;
		return false;
	}

	private getEditAccess(readOnlyparam: string, visibilityParam: string): boolean {
		if (visibilityParam == 'false') {
			return false;
		}
		return !this.getBoolean(readOnlyparam);
	}
}
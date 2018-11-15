import { core, flags, SfdxCommand } from '@salesforce/command';
import * as _ from 'lodash';
import chalk from 'chalk';
import { SaveResult } from 'jsforce';
import * as interfaces from '../../../../shared/interfaces';
import * as profileInfo from '../../../../shared/profile';

core.Messages.importMessagesDirectory(__dirname);
const messages = core.Messages.loadMessages('@venkatpolisetti/crm-sfdx-plugin', 'fieldpermissions');

export default class set extends SfdxCommand {

	public static description = messages.getMessage('commandDescription');

	public static examples = [
		`$ sfdx crm:profile:fieldpermissions:set\n` +
		`          -u myalias\n` +
		`          --sobjects="Account,MyCustomObject__c"\n` +
		`          --profiles="Standard*"\n` +
		`          --filter="LastModifiedBy.LastName='Doe' AND LastModifiedDate=TODAY"\n` +
		`          --readaccess=true --editaccess=false`
	];

	protected static flagsConfig = {
		profiles: flags.string({ char: 'p', description: messages.getMessage('profilesFlagDescription') }),
		sobjects: flags.string({ char: 'o', description: messages.getMessage('objectsFlagDescription') }),
		filter: flags.string({ char: 'f', description: messages.getMessage('filterFlagDescription') }),
		readaccess: flags.string({ char: 'r', description: messages.getMessage('readaccessFlagDescription') }),
		editaccess: flags.string({ char: 'e', description: messages.getMessage('editaccessFlagDescription') }),
		verbose: flags.boolean({ char: 'v', description: messages.getMessage('verboseFlagDescription') }),
		checkonly: flags.boolean({ char: 'c', description: messages.getMessage('checkonlyFlagDescription') }),
	};

	protected static requiresUsername = true;

	public async run(): Promise<core.AnyJson> {

		let profileMetadata: interfaces.ProfileMetadata[] = new Array<interfaces.ProfileMetadata>();

		// validate parameters
		this.validateFlags();

		const conn = this.org.getConnection();

		this.ux.startSpinner('Getting Profile data');
		const standardProfiles: interfaces.StandardProfile[] = await profileInfo.getProfileData(conn, this.flags.profiles);
		standardProfiles.map(s => {
			profileMetadata.push({ fullName: s.metaName, fieldPermissions: [] })
		});
		this.ux.stopSpinner('done.')

		this.ux.startSpinner('Processing sobjects');
		const customObjectMap = new Map();

		const customObjectsStr = ("'" + this.flags.sobjects
											.split(',')
											.map(v => v.trim())
											.filter(o => o.toLowerCase().endsWith('__c'))
											.join("','") + "'")
											.replace(/__c/gi, '');

		const allObjectsStr = ("'" + this.flags.sobjects
										.split(',')
										.map(v => v.trim())
										.join("','") + "'")
										.replace(/__c/gi, '');

		const customObjects = await conn.tooling.query("SELECT Id, DeveloperName FROM CustomObject WHERE DeveloperName IN (" + customObjectsStr + ")");

		customObjects.records
			.map((c: { Id, DeveloperName }) => customObjectMap.set(c.Id, c.DeveloperName));

		const customObjIds = "'" + customObjects.records
										.map((c: { Id, DeveloperName }) => c.Id)
										.join("','") + "'";

		this.flags.filter = this.flags.filter.replace(/__c/gi, '');

		const customFieldResult = await conn.tooling.query(
			'SELECT DeveloperName, TableEnumOrId ' +
			'FROM CustomField ' +
			'WHERE (TableEnumOrId IN (' + allObjectsStr + ') OR TableEnumOrId in (' + customObjIds + ')) ' +
			'  AND ' + this.flags.filter
		);

		let nonPermissionableFieldSet = await profileInfo.getNonPermissionableFields(conn, this.flags.sobjects);

		customFieldResult.records.map((r: { DeveloperName, TableEnumOrId }) => { customObjectMap.get(r.TableEnumOrId) || customObjectMap.set(r.TableEnumOrId, r.TableEnumOrId);});

		const customFields = customFieldResult.records
			.filter((r: { DeveloperName, TableEnumOrId }) => !nonPermissionableFieldSet.has(r.DeveloperName + '__c'))
			.map((r: { DeveloperName, TableEnumOrId }) => {
					const sobjectName = customObjectMap.get(r.TableEnumOrId);
					if (sobjectName == r.TableEnumOrId) {  // standard object
						return r.TableEnumOrId + '.' + r.DeveloperName + '__c';
					} else { // custom object
						return sobjectName + '__c' + '.' + r.DeveloperName + '__c';
					}
			});

		customFields.forEach(field => {
			profileMetadata.forEach(profile => {
				profile.fieldPermissions.push({
					field: field,
					readable: this.getBoolean(this.flags.readaccess),
					editable: this.getBoolean(this.flags.editaccess)
				});
			});
		});
		this.ux.stopSpinner('done');

		let fieldProfileMap = new Map();

		if (this.flags.verbose) {
			profileMetadata.map(v => {
				v.fieldPermissions.map((f: { field, readable, editable }) => {
					let profilesAndInfo = fieldProfileMap.get(f.field) || {};
					let profiles: Array<string> = profilesAndInfo.profiles || new Array<string>();
					let standardProfile = standardProfiles.find((s: { metaName }) => v.fullName == s.metaName);
					if (profiles.find(p => p == standardProfile.name) == undefined)
						profiles.push(standardProfile.name);
					profilesAndInfo.readable = f.readable;
					profilesAndInfo.editable = f.editable;
					profilesAndInfo.profiles = profiles;
					fieldProfileMap.set(f.field, profilesAndInfo);
				});
			});

			//this.ux.log(JSON.stringify(profileMetadata, null, 2));

			this.ux.log('fieldname,readaccess,editaccess,profiles');
			fieldProfileMap.forEach((value: { readable, editable, profiles }, key: string) => {
				this.ux.log(`${key},${value.readable},${value.editable},"${value.profiles}"`);
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
		const promises = meta.map(async (v: interfaces.ProfileMetadata[], index: number) => {

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

	private getBoolean(param: string): boolean {
		if (param == 'true')
			return true;
		return false;
	}

	private validateFlags(): void {
		// sobjects flag: profiles and filter flags required
		if (this.flags.sobjects && (this.flags.profiles == undefined || this.flags.filter == undefined)) {
			throw new core.SfdxError('--profiles and --filter must be specified when --sobjects is used');
		}

		// set defaults to readaccess and editaccess
		if (this.flags.readaccess) {
			if (!this.flags.readaccess.match(/^true$|^false$/i)) {
				throw new core.SfdxError("Invalid value for --readaccess. Valid values true or false");
			}
			if (this.flags.readaccess == 'false')
				this.flags.editaccess = 'false';
		} else {
			this.flags.readaccess = 'true';
		}
		if (this.flags.editaccess) {
			if (!this.flags.editaccess.match(/^true$|^false$/i)) {
				throw new core.SfdxError("Invalid value for --editaccess. Valid values are true or false");
			}
			if (this.flags.editaccess == 'true')
				this.flags.readaccess = 'true';
		} else {
			this.flags.editaccess = 'true';
		}

		if (!this.flags.verbose)
			this.flags.verbose = false;

		if (this.flags.checkonly) {
			this.flags.verbose = true;
		}
	}
}
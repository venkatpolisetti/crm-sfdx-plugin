import { core,  SfdxCommand } from '@salesforce/command';
import { flags } from '@salesforce/command/node_modules/@oclif/command/node_modules/@oclif/parser/lib';
import * as _ from 'lodash';
import chalk from 'chalk';
import { SaveResult } from 'jsforce';
import * as interfaces from '../../../../shared/interfaces';
import * as profileInfo from '../../../../shared/profile';
import { ok } from 'assert';

core.Messages.importMessagesDirectory(__dirname);
const messages = core.Messages.loadMessages('@venkat.polisetti/crm-sfdx-plugin', 'fieldpermissions');

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
		profiles: flags.string({ char: 'p', required:true, description: messages.getMessage('profilesFlagDescription') }),
		sobjects: flags.string({ char: 'o', required:true, description: messages.getMessage('objectsFlagDescription') }),
		filter: flags.string({ char: 'f', description: messages.getMessage('filterFlagDescription') }),
		readaccess: flags.string({ char: 'r', description: messages.getMessage('readaccessFlagDescription') }),
		editaccess: flags.string({ char: 'e', description: messages.getMessage('editaccessFlagDescription') }),
		verbose: flags.boolean({ char: 'v', description: messages.getMessage('verboseFlagDescription') }),
		checkonly: flags.boolean({ char: 'c', description: messages.getMessage('checkonlyFlagDescription') }),
	};

	protected static requiresUsername = true;

	public async run(): Promise<core.AnyJson> {

		try {

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

			const customObjectNamespaceStr = ("'" + this.flags.sobjects
												.split(',')
												.map(v => v.trim())
												.filter(o => o.toLowerCase().endsWith('__c'))
												.map(o => o.replace(/__c/i, ''))
												.filter(o => o.includes('__'))
												.map(o => o.substring(0, o.indexOf('__')))
												.join("','") + "'");

			const customObjectsStr = ("'" + this.flags.sobjects
												.split(',')
												.map(v => v.trim())
												.filter(o => o.toLowerCase().endsWith('__c'))
												.map(o => o.replace(/__c/i, ''))
												.map(o => o.includes('__') ? o.substring(o.indexOf('__') + 2) : o)
												.join("','") + "'");

			const allObjectsStr = ("'" + this.flags.sobjects
											.split(',')
											.map(v => v.trim().replace(/__c/i, ''))
											.map(o => o.includes('__') ? o.substring(o.indexOf('__') + 2) : o)
											.join("','") + "'");

			const customObjects = await conn.tooling.query(
				"SELECT Id, NamespacePrefix, DeveloperName " +
				"FROM CustomObject " +
				"WHERE DeveloperName IN (" + customObjectsStr + ") " +
				"AND NamespacePrefix IN (" + customObjectNamespaceStr + ")"
			);

			customObjects.records
				.map((c: { Id, NamespacePrefix, DeveloperName }) => customObjectMap.set(c.Id, (c.NamespacePrefix != null ? c.NamespacePrefix + '__' + c.DeveloperName : c.DeveloperName)));

			const customObjIds = "'" + customObjects.records
											.map((c: { Id, NamespacePrefix, DeveloperName }) => c.Id)
											.join("','") + "'";

			//this.flags.filter = this.flags.filter.replace(/__c/gi, '');

			const customFieldResult = await conn.tooling.query(
				'SELECT NamespacePrefix, DeveloperName, TableEnumOrId ' +
				'FROM CustomField ' +
				'WHERE (TableEnumOrId IN (' + allObjectsStr + ') OR TableEnumOrId in (' + customObjIds + ')) ' +
				(this.flags.filter ? '  AND ' + this.flags.filter.replace(/__c/gi, '') : '')
			);

			let nonPermissionableFieldSet = await profileInfo.getNonPermissionableFields(conn, this.flags.sobjects);

			customFieldResult.records.map((r: { DeveloperName, TableEnumOrId }) => { customObjectMap.get(r.TableEnumOrId) || customObjectMap.set(r.TableEnumOrId, r.TableEnumOrId);});

			const customFields = customFieldResult.records
				.filter((r: { NamespacePrefix, DeveloperName, TableEnumOrId }) => !nonPermissionableFieldSet.has(r.NamespacePrefix != null ? r.NamespacePrefix + '__' + r.DeveloperName + '__c' : r.DeveloperName))
				.map((r: { NamespacePrefix, DeveloperName, TableEnumOrId }) => {
						const sobjectName = customObjectMap.get(r.TableEnumOrId);
						if (sobjectName == r.TableEnumOrId) {  // standard object
							return r.TableEnumOrId + '.' + r.DeveloperName + '__c';
						} else { // custom object
							return sobjectName + '__c' + '.' + (r.NamespacePrefix != null ? r.NamespacePrefix + '__' + r.DeveloperName + '__c' : r.DeveloperName + '__c');
						}
				});

			if (customFields.length == 0) {
				throw new core.SfdxError('No fields found for SObjects: ' + this.flags.sobjects + ', please check your parameters');
			}

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

				const heading = ["fieldname", "readaccess", "editaccess", "profiles"];
				let fieldArray = [];
				fieldProfileMap.forEach((value: { readable, editable, profiles }, key: string) => {
					fieldArray.push({fieldname:key, readaccess:value.readable,editaccess:value.editable,profiles:value.profiles});
				});

				this.ux.table(fieldArray, heading);

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
		} catch (error) {
			this.ux.stopSpinner(); // this is bug; if spinner is not stopped, it is swallowing all exceptions
			throw new core.SfdxError(error);
		}
	}

	private getBoolean(param: string): boolean {
		if (param == 'true')
			return true;
		return false;
	}

	private validateFlags(): void {
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
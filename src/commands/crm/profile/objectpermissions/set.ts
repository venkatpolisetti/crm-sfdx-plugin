import { core, SfdxCommand } from '@salesforce/command';
import { flags } from '@salesforce/command/node_modules/@oclif/command/node_modules/@oclif/parser/lib';
import * as _ from 'lodash';
import chalk from 'chalk';
import { SaveResult } from 'jsforce';
import * as interfaces from '../../../../shared/interfaces';
import * as profileInfo from '../../../../shared/profile';

core.Messages.importMessagesDirectory(__dirname);
const messages = core.Messages.loadMessages('@venkat.polisetti/crm-sfdx-plugin', 'objectpermissions');

export default class set extends SfdxCommand {

	public static description = messages.getMessage('commandDescription');

	public static examples = [
		`$ sfdx crm:profile:objectpermissions:set\n` +
		`          -u myalias\n` +
		`          --sobjects="Account,MyCustomObject__c"\n` +
		`          --profiles="Standard*"\n` +
		`          --readaccess=true --createaccess=false --editaccess=true --deleteaccess=false --viewallaccess=true --modifyallaccess=false`
	];

	protected static flagsConfig = {
		profiles: flags.string({ char: 'p', required:true, description: messages.getMessage('profilesFlagDescription') }),
		sobjects: flags.string({ char: 'o', required:true, description: messages.getMessage('objectsFlagDescription') }),
		readaccess: flags.string({ char: 'r', description: messages.getMessage('readaccessFlagDescription') }),
		createaccess: flags.string({ char: 'a', description: messages.getMessage('createaccessFlagDescription') }),
		editaccess: flags.string({ char: 'e', description: messages.getMessage('editaccessFlagDescription') }),
		deleteaccess: flags.string({ char: 'x', description: messages.getMessage('deleteaccessFlagDescription') }),
		viewallaccess: flags.string({ char: 's', description: messages.getMessage('viewallaccessFlagDescription') }),
		modifyallaccess: flags.string({ char: 'm', description: messages.getMessage('modifyallaccessFlagDescription') }),
		verbose: flags.boolean({ char: 'v', description: messages.getMessage('verboseFlagDescription') }),
		checkonly: flags.boolean({ char: 'c', description: messages.getMessage('checkonlyFlagDescription') }),
	};

	protected static requiresUsername = true;

	public async run(): Promise<core.AnyJson> {

		try {

			let profileMetadata: interfaces.ProfileMetadata[] = new Array<interfaces.ProfileMetadata>();

			this.validateFlags();

			const conn = this.org.getConnection();

			this.ux.startSpinner('Getting Profile data');
			const standardProfiles: interfaces.StandardProfile[] = await profileInfo.getProfileData(conn, this.flags.profiles, 'objectPermissions');
			standardProfiles.map(s => {
				profileMetadata.push({ fullName: s.metaName, objectPermissions: [] })
			});
			this.ux.stopSpinner('done');

			this.ux.startSpinner('Processing sobjects');
			let sobjects:Array<string> = this.flags.sobjects.split(',').map( o => o.trim());
			sobjects.forEach(sobject => {
				profileMetadata.forEach(profile => {
					let currentObjectPermission:interfaces.ObjectPermission = profileInfo.getObjectProfilePermissions(this.flags, sobject,
																			standardProfiles.find(s => s.metaName == profile.fullName).objectPermissions);
					profile.objectPermissions.push(currentObjectPermission);
				});
			});
			this.ux.stopSpinner('done');

			let objectProfileMap = new Map();

			if (this.flags.verbose) {
				profileMetadata.map(v => {
					v.objectPermissions.map((o: {object, allowRead, allowCreate, allowEdit, allowDelete, viewAllRecords, modifyAllRecords}) => {
						let profilesAndInfo = objectProfileMap.get(o.object) || {};
						let profiles: Array<string> = profilesAndInfo.profiles || new Array<string>();
						let standardProfile = standardProfiles.find((s: { metaName }) => v.fullName == s.metaName);
						if (profiles.find(p => p == standardProfile.name) == undefined)
							profiles.push(standardProfile.name);
						profilesAndInfo.read = o.allowRead;
						profilesAndInfo.create = o.allowCreate;
						profilesAndInfo.edit = o.allowEdit;
						profilesAndInfo.delete = o.allowDelete;
						profilesAndInfo.viewall = o.viewAllRecords;
						profilesAndInfo.modifyall = o.modifyAllRecords;
						profilesAndInfo.profiles = profiles;
						objectProfileMap.set(o.object, profilesAndInfo);
					});
				});

				const heading = ["objectname", "read", "create", "edit", "delete", "viewall", "modifyall", "profiles"];
				let objectPermsArray = [];
				objectProfileMap.forEach((value: { read, create, edit, delete, viewall, modifyall, profiles }, key: string) => {
					objectPermsArray.push({objectname:key, read:value.read, create:value.create, edit:value.edit, delete:value.delete, viewall:value.viewall, modifyall:value.modifyall, profiles:value.profiles});
				});

				this.ux.table(objectPermsArray, heading);

				if (this.flags.checkonly)
					this.ux.log(chalk.greenBright('Total Profiles to update: ' + profileMetadata.length));
			}

			if (this.flags.checkonly) {
				return JSON.stringify([...objectProfileMap]);
			}

			this.ux.startSpinner('Setting Object Permissions');

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
			this.ux.stopSpinner();
			throw new core.SfdxError(error);
		}
	}

	private validateFlags() : void {
		// set defaults 
		if (this.flags.readaccess) {
			if (!this.flags.readaccess.match(/^true$|^false$/i)) {
				throw new core.SfdxError("Invalid value for --readaccess. Valid values true or false");
			}
			if (this.flags.readaccess == 'false') {
				this.flags.createaccess = 'false';
				this.flags.editaccess = 'false';
				this.flags.deleteaccess = 'false';
				this.flags.viewallaccess = 'false';
				this.flags.modifyallaccess = 'false';
			}
		}
		if (this.flags.createaccess) {
			if (!this.flags.createaccess.match(/^true$|^false$/i)) {
				throw new core.SfdxError("Invalid value for --createaccess. Valid values are true or false");
			}
			if (this.flags.createaccess == 'true')
				this.flags.readaccess = 'true';
		}

		if (this.flags.editaccess) {
			if (!this.flags.editaccess.match(/^true$|^false$/i)) {
				throw new core.SfdxError("Invalid value for --editaccess. Valid values are true or false");
			}
			if (this.flags.editaccess == 'true')
				this.flags.readaccess = 'true';
			else
				this.flags.deleteaccess = 'false';
		}

		if (this.flags.deleteaccess) {
			if (!this.flags.deleteaccess.match(/^true$|^false$/i)) {
				throw new core.SfdxError("Invalid value for --deleteaccess. Valid values are true or false");
			}
			if (this.flags.deleteaccess == 'true') {
				this.flags.readaccess = 'true';
				this.flags.editaccess = 'true';
			}
		}

		if (this.flags.viewallaccess) {
			if (!this.flags.viewallaccess.match(/^true$|^false$/i)) {
				throw new core.SfdxError("Invalid value for --viewallaccess. Valid values are true or false");
			}
			if (this.flags.viewallaccess == 'true')
				this.flags.readaccess = 'true';
			else
				this.flags.modifyallaccess = 'false';
		}

		if (this.flags.modifyallaccess) {
			if (!this.flags.modifyallaccess.match(/^true$|^false$/i)) {
				throw new core.SfdxError("Invalid value for --modifyallaccess. Valid values are true or false");
			}
			if (this.flags.modifyallaccess == 'true') {
				this.flags.readaccess = 'true';
				this.flags.editaccess = 'true';
				this.flags.deleteaccess = 'true';
				this.flags.viewallaccess = 'true';
			}
		}

		if (!this.flags.verbose)
			this.flags.verbose = false;

		if (this.flags.checkonly) {
			this.flags.verbose = true;
		}

		if (!this.flags.readaccess &&
			!this.flags.createaccess &&
			!this.flags.editaccess &&
			!this.flags.deleteaccess &&
			!this.flags.viewallaccess &&
			!this.flags.modifyallaccess) {

				throw new core.SfdxError("You must speicify atleast one of the access permission flags.");
		}
	}
}
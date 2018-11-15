import { core, flags, SfdxCommand } from '@salesforce/command';
import * as _ from 'lodash';
import chalk from 'chalk';
import { SaveResult } from 'jsforce';
import * as interfaces from '../../../../shared/interfaces';
import * as profileInfo from '../../../../shared/profile';

core.Messages.importMessagesDirectory(__dirname);
const messages = core.Messages.loadMessages('crm-sfdx-plugin', 'recordtypevisibilities');

export default class set extends SfdxCommand {

	public static description = messages.getMessage('commandDescription');

	public static examples = [
		`$ sfdx crm:profile:recordtypevisibilities:set\n` +
		`          -u myalias\n` +
		`          --profiles="Standard*"\n` +
		`          --recordtypes='[{"name":"CustomObj__c.CustomRecType1", "default":true, "visible":true},{"name":"CustomObj__c.CustomRecType2", "visible":false}]'\n`
	];

	protected static flagsConfig = {
		profiles: flags.string({ char: 'p', description: messages.getMessage('profilesFlagDescription') }),
		recordtypes: flags.string({ char: 'r', description: messages.getMessage('recordtypesFlagDescription') }),
		verbose: flags.boolean({ char: 'v', description: messages.getMessage('verboseFlagDescription') }),
		checkonly: flags.boolean({ char: 'c', description: messages.getMessage('checkonlyFlagDescription') }),
	};

	private flagRecordTypeVisibilities = new Map<string, Array<interfaces.RecordTypeVisibility>>();

	protected static requiresUsername = true;

	public async run(): Promise<core.AnyJson> {
		let profileMetadata: interfaces.ProfileMetadata[] = new Array<interfaces.ProfileMetadata>();

		this.validateFlags();

		const conn = this.org.getConnection();

		this.ux.startSpinner('Getting Profile data');
		const standardProfiles: interfaces.StandardProfile[] = await profileInfo.getProfileData(conn, this.flags.profiles, 'recordTypeVisibilities');
		standardProfiles.map(s => {
			profileMetadata.push({ fullName: s.metaName, recordTypeVisibilities: [] })
		});
		this.ux.stopSpinner('done.')

		this.ux.startSpinner('Processing Record Types');
		this.flagRecordTypeVisibilities.forEach((value, key, map)  => {
			profileMetadata.forEach(profile => {
				let sObjRecordTypeVisibilities:interfaces.RecordTypeVisibility[] =
									standardProfiles
										.find(s => s.metaName == profile.fullName).recordTypeVisibilities
										.filter(v => v.recordType.split('.')[0].toLowerCase() == key.toLowerCase());

				let defaultRecType = value.find(v => v.default == true);
				if (defaultRecType != undefined)
					sObjRecordTypeVisibilities.map(s => s.default = false);

				for (let flagRecordTypeVisibility of value) {
					let sObjRecordTypeVisibility:interfaces.RecordTypeVisibility = 
							sObjRecordTypeVisibilities.find(r => r.recordType.toLowerCase() == flagRecordTypeVisibility.recordType.toLowerCase()) || 
														new interfaces.RecordTypeVisibility();
					sObjRecordTypeVisibility.recordType = flagRecordTypeVisibility.recordType;	
					sObjRecordTypeVisibility.default = flagRecordTypeVisibility.default;	
					sObjRecordTypeVisibility.visible = flagRecordTypeVisibility.visible;	

					profile.recordTypeVisibilities.push(sObjRecordTypeVisibility);
				}
			});
		});
		this.ux.stopSpinner('done');

		if (this.flags.verbose) {
			this.ux.log('profile,recordtype,visible,default');
			profileMetadata.forEach(p => {
				p.recordTypeVisibilities.forEach(r => {
					this.ux.log(`${p.fullName},${r.recordType},${r.visible},${r.default}`);
				});
			});
			if (this.flags.checkonly)
				this.ux.log(chalk.greenBright('Total Profiles to update: ' + profileMetadata.length));
		}

		if (this.flags.checkonly) {
			return JSON.stringify([...profileMetadata]);
		}

		this.ux.startSpinner('Setting Profile Record Type Visibilities');

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

	private validateFlags() : void {
		// validate parameters
		// profiles flag required
		if (!this.flags.profiles) {
			throw new core.SfdxError('--profiles must be specified');
		}

		// recordtypes flag required
		if (!this.flags.recordtypes) {
			throw new core.SfdxError('--recordtypes must be specified');
		} else {
			const recordTypesFlag = JSON.parse(this.flags.recordtypes);
			if (!Array.isArray(recordTypesFlag)) {
				throw new core.SfdxError('--recordtypes must be a JSON array');
			}

			for (const rectype of recordTypesFlag) {
				let sob = rectype.name.split('.')[0];
				let recTypeVisibility:interfaces.RecordTypeVisibility = new interfaces.RecordTypeVisibility();

				if (!rectype.hasOwnProperty('name'))
					throw new core.SfdxError('One of the record types is missing name property');
				else
					recTypeVisibility.recordType = rectype.name;
					
				if (!rectype.hasOwnProperty('visible'))
					throw new core.SfdxError('One of the record types is missing visible property');
				else
					recTypeVisibility.visible = rectype.visible;
				
				if (rectype.hasOwnProperty('default'))
					recTypeVisibility.default = rectype.default;
				else
					recTypeVisibility.default = false;
				
				if (rectype.hasOwnProperty('personAccountDefault'))
					recTypeVisibility.personAccountDefault = rectype.personAccountDefault;

				let arr = this.flagRecordTypeVisibilities.get(sob) || [];
				arr.push(recTypeVisibility);
				this.flagRecordTypeVisibilities.set(sob, arr);
			}
		}

		if (!this.flags.verbose)
			this.flags.verbose = false;

		if (this.flags.checkonly) {
			this.flags.verbose = true;
		}
	}
}
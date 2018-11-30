import { core, flags, SfdxCommand } from '@salesforce/command';
import * as _ from 'lodash';
import chalk from 'chalk';

core.Messages.importMessagesDirectory(__dirname);
const messages = core.Messages.loadMessages('@venkat.polisetti/crm-sfdx-plugin', 'assign');

export default class assign extends SfdxCommand {

	public static description = messages.getMessage('commandDescription');

	public static examples = [
		`$ sfdx crm:permset:assign\n` +
		`          -u myalias\n` +
		`          --permsetlabel="Dreamhouse"\n` +
		`          --filter="Profile.Name = 'Lightning Sales'\n` +
		`$ sfdx crm:permset:assign\n` +
		`          -u myalias\n` +
		`          --permsetlabel="Dreamhouse"\n` +
		`          --o='myuser@testorg.com'\n`
	];

	protected static flagsConfig = {
		permsetlabel: flags.string({ char: 'n', required:true, description: messages.getMessage('permsetlabelFlagDescription') }),
		onbehalfof: flags.string({ char: 'o', description: messages.getMessage('onbehalfofFlagDescription') }),
		filter: flags.string({ char: 'f', description: messages.getMessage('filterFlagDescription') }),
		verbose: flags.boolean({ char: 'v', description: messages.getMessage('verboseFlagDescription') }),
		checkonly: flags.boolean({ char: 'c', description: messages.getMessage('checkonlyFlagDescription') }),
	};

	protected static requiresUsername = true;

	public async run(): Promise<core.AnyJson> {

		try {

			this.validateFlags();

			const conn = this.org.getConnection();

			this.ux.startSpinner('Checking Permission Set');

			// get permset id
			let permsetResults = await conn.query("SELECT Id, Label FROM PermissionSet WHERE Label = '" + this.flags.permsetlabel + "' limit 1");

			if (permsetResults.totalSize == 0)
				throw new core.SfdxError('Permission Set with the label "' + this.flags.permsetlabel + '" not found');


			let permsetId = permsetResults.records[0]['Id'];

			let whereClause = undefined;

			if (this.flags.onbehalfof) {
				whereClause = " username IN ('" + this.flags.onbehalfof
													.split(',')
													.map(v => v.trim())
													.join("','") + "')";
			}

			if (this.flags.filter) {
				if (whereClause != undefined)
					whereClause += ' OR ' + this.flags.filter;
				else 
					whereClause = this.flags.filter;
			}

			this.ux.stopSpinner();
			this.ux.startSpinner('Retrieving users');

			const userResults = await conn.query(
					" SELECT Id, Name, Username " +
					" FROM User " + 
					" WHERE IsActive = true " +
					" AND Id NOT IN (SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSetId = '" + permsetId + "')" +
					" AND ( " + whereClause + ")");

			let assignmentUserDetails = [];
			let assignments = [];
		
			if (userResults.totalSize == 0)
				throw new core.SfdxError('No users found matching your arguments OR this Permission set has already been assinged to users matching your arguments.');


			userResults.records.map((u:{Id, Name, Username}) => {
				assignments.push({PermissionSetId:permsetId, AssigneeId: u.Id})
				assignmentUserDetails.push({"Permissionset Name": this.flags.permsetlabel, "Id":permsetId, "User Id": u.Id, "Name": u.Name, "Username": u.Username});
			});

			this.ux.stopSpinner();

			if (this.flags.verbose) {
				const heading = ["Permissionset Name", "Id", "User Id", "Name", "Username"];
				this.ux.table(assignmentUserDetails, heading);
			}

			if (this.flags.checkonly) {
				this.ux.log(chalk.greenBright('Total assignments: ' + assignments.length));
				return JSON.stringify([...assignments]);
			}

			this.ux.startSpinner('Assigning Permission Set');

			let assignChunks = _.chunk(assignments, 10);
			this.ux.log(chalk.greenBright('Total assignments: ' + assignments.length));
			this.ux.log(chalk.greenBright('Total batches: ' + assignChunks.length));

			let totalResults = new Array();
			const promises = assignChunks.map(async (v, index: number) => {

				let results = await conn.sobject('PermissionSetAssignment').create(v);

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
		// onbehalfof flag or filter required, but not both
		if (!this.flags.onbehalfof && !this.flags.filter)
			throw new core.SfdxError('--onbehalfof or --filter must be specified');
		
		if (!this.flags.verbose)
			this.flags.verbose = false;

		if (this.flags.checkonly) {
			this.flags.verbose = true;
		}
	}
}
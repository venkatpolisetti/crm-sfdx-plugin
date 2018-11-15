import { core } from '@salesforce/command';
import { OutputArgs, OutputFlags } from '@oclif/parser';
import * as _ from 'lodash';
import * as Interfaces from './interfaces';
import { MetadataInfo } from 'jsforce';
import { interfaces } from 'mocha';

export async function getProfileData(connection: core.Connection, profilesStr: string, permissionType? : string) : Promise<Interfaces.StandardProfile[]> {

	const profileData = await connection.query("SELECT Id, Name FROM Profile WHERE userType = 'Standard' order by Name");

	let profiles = profilesStr.split(',').map(p => p.trim());

	let profileRecords = profileData.records.filter((p: {Id, Name }) => isParamMatchesStandardProfileName(p.Name, profiles));

	const standardProfiles: Interfaces.StandardProfile[] = profileRecords.map((v: { Id, Name }) => { return { id: v.Id, name: v.Name, metaName: '', objectPermissions: [] } });
	const metaProfileData = await connection.metadata.list({ type: 'Profile' }, connection.getApiVersion());
	standardProfiles.forEach(s => {
		 let profileInfo = metaProfileData.find(m => m.id == s.id); 
		 s.metaName = decodeURIComponent(profileInfo.fullName);
	});

	if (permissionType != undefined) {
		let profileDetailBatches = _.chunk(standardProfiles.map(s => s.metaName), 10);
		const profileDetailPromises = profileDetailBatches.map(async (b: string[]) => {
			const profileDetails = await connection.metadata.read('Profile', b);
			if (Array.isArray(profileDetails)) {
				profileDetails.map(d => {
					standardProfiles.find(s => s.metaName == d.fullName)[permissionType] = getSpecificPermissions(d, permissionType);
				});
			} else {
				standardProfiles.find(s => s.metaName == profileDetails.fullName)[permissionType] = getSpecificPermissions(profileDetails, permissionType);
			}
		});

		await Promise.all(profileDetailPromises);
	}

	return standardProfiles;
}

function getSpecificPermissions(metaInfo: MetadataInfo, permType: string) : any {
	let perms = _.get(metaInfo, permType);
	return (perms ? (Array.isArray(perms) ? perms : [perms]) : []);
}

function isParamMatchesStandardProfileName(param: string, profiles: string[]) : boolean {

	let paramMatches:boolean = false;

	profiles.some(p => {
		let cleanedStr = p.trim().replace(/[.+?{}()|[\]\\]/g, '\\$&');
		if (!cleanedStr.startsWith('^'))
			cleanedStr = '^' + cleanedStr;
		if (!cleanedStr.endsWith('$'))
			cleanedStr = cleanedStr + '$';
		cleanedStr = cleanedStr.replace(/\*/g, '.*');
		const regex = new RegExp(cleanedStr, "i");
		if (param.match(regex) != null) {
			paramMatches = true;
			return true;
		}
	});

	return paramMatches;
}

export function getObjectProfilePermissions(flags: OutputFlags<any>, objectName: string, objPermissions: Interfaces.ObjectPermission[]) : Interfaces.ObjectPermission {

	let perm:Interfaces.ObjectPermission;

	if (objPermissions.length > 0) {
		perm = objPermissions.find(o => o.object.toLowerCase() == objectName.toLowerCase()) || new Interfaces.ObjectPermission(objectName, false, false, false, false, false, false);
	} else {
		perm = new Interfaces.ObjectPermission(objectName, false, false, false, false, false, false);
	}

	if (flags.readaccess != undefined)
		perm.allowRead = flags.readaccess;
	if (flags.createaccess != undefined)
		perm.allowCreate = flags.createaccess;
	if (flags.editaccess != undefined)
		perm.allowEdit = flags.editaccess;
	if (flags.deleteaccess != undefined)
		perm.allowDelete = flags.deleteaccess;
	if (flags.viewallaccess != undefined)
		perm.viewAllRecords = flags.viewallaccess;
	if (flags.modifyallaccess != undefined)
		perm.modifyAllRecords = flags.modifyallaccess;

	for (let prop in perm) {
		if (perm[prop] == undefined)
			perm[prop] = false;
	}
	return perm;
}

// return non-permissionalble set of fields
export async function getNonPermissionableFields(connection: core.Connection, sobjectList: string ) : Promise<Set<string>> {

	let nonPermissionableSet = new Set();

	const sobjectsList = "'" + sobjectList
								.split(',')
								.map(v => v.trim())
								.join("','") + "'";

	const nonPermissionableResult = await connection.tooling.query(
		'SELECT QualifiedApiName ' + 
		'FROM EntityParticle ' +
		'WHERE isPermissionable = false ' + 
		'AND EntityDefinition.QualifiedApiName IN (' + sobjectsList + ') ' +
		'AND QualifiedApiName ' +
		'    NOT IN (\'Id\',\'IsDeleted\', \'Name\', \'RecordTypeId\', \'CreatedDate\',' +
					'\'CreatedById\', \'LastModifiedDate\', \'LastModifiedById\',' +
					'\'SystemModstamp\', \'LastActivityDate\', \'OwnerId\', \'LastViewedDate\',' +
					'\'LastReferencedDate\')' 
	); 

	nonPermissionableResult.records.map((r: { QualifiedApiName}) => nonPermissionableSet.add(r.QualifiedApiName));

	return nonPermissionableSet;
}
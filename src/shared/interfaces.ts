export class FieldPermission {
	constructor(public field:string,
				public readable:boolean,
				public editable:boolean) {}
}
export class  ObjectPermission {
	constructor(public object:string,
				public allowRead? :boolean,
				public allowCreate? : boolean,
				public allowEdit? : boolean,
				public allowDelete? : boolean,
				public viewAllRecords? : boolean,
				public modifyAllRecords? : boolean) {}
}
export class RecordTypeVisibility {
	public recordType:string;
	public default:boolean;
	public visible:boolean;
	public personAccountDefault:boolean;
}

export interface ProfileMetadata {
	fullName: string,
	fieldPermissions? : FieldPermission[],
	objectPermissions? : ObjectPermission[],
	recordTypeVisibilities? : RecordTypeVisibility[]
}

export interface StandardProfile {
	id: string;
	name: string;
	metaName: string;
	objectPermissions? : ObjectPermission[];
	recordTypeVisibilities? : RecordTypeVisibility[];
}

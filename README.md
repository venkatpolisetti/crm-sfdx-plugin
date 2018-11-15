crm-sfdx-plugin
===============



[![Version](https://img.shields.io/npm/v/crm-sfdx-plugin.svg)](https://npmjs.org/package/crm-sfdx-plugin)
[![Downloads/week](https://img.shields.io/npm/dw/crm-sfdx-plugin.svg)](https://npmjs.org/package/crm-sfdx-plugin)
[![License](https://img.shields.io/npm/l/crm-sfdx-plugin.svg)](https://github.com/ecrm-plugins/crm-sfdx-plugin/blob/master/package.json)

<!-- install -->
```sh-session
$ sfdx plugins:install crm-sfdx-plugin
```
<!-- commands -->
* [`sfdx crm:profile:fieldpermissions:set`](#sfdx-crmprofilefieldpermissionsset)
* [`sfdx crm:profile:objectpermissions:set`](#sfdx-crmprofileobjectpermissionsset)
* [`sfdx crm:profile:recordtypevisibilities:set`](#sfdx-crmprofilerecordtypevisibilitiesset)

## `sfdx crm:profile:fieldpermissions:set`

Sets Field Level Security of fields for a list of profiles.

```
USAGE
  $ sfdx crm:profile:fieldpermissions:set

OPTIONS
  -c, --checkonly
      Just display details, no updates are made to profiles, defaults to false.

  -e, --editaccess=editaccess
      edit permission, defaults to 'true'. Valid values are 'true' or 'false'.

  -f, --filter=filter
      Analogous to SOQL where clause to pull fields from SObjects. Allowed fields: CreatedDate, CreatedBy, 
      LastModifiedDate, LastModifiedBy and DeveloperName. DeveloperName here referes to the SObject custom field.

      Examples:

      LastModifiedBy.LastName='Doe' AND lastModifiedDate = TODAY AND DeveloperName like 'MyCustom%'

  -o, --sobjects=sobjects
      List of SObjects separated by commas.

  -p, --profiles=profiles
      List of profiles separated by commas. You can also use wildcards as part of this parameter to match on profile names 
      (only ^,$,* are supported, ^ matches start of the profile name, $ matches end of the profile name and * matches one 
      of more characters of profile name).

  -r, --readaccess=readaccess
      read permission, defaults to 'true'. Valid values are 'true' or 'false'.

  -u, --targetusername=targetusername
      username or alias for the target org; overrides default target org

  -v, --verbose
      Output to screen in csv format, defaults to false unless --checkonly flag is set

  --apiversion=apiversion
      override the api version used for api requests made by this command

  --json
      format output as json

  --loglevel=(trace|debug|info|warn|error|fatal)
      logging level for this command invocation

EXAMPLE
  $ sfdx crm:profile:fieldpermissions:set
             -u myalias
             --sobjects="Account,MyCustomObject__c"
             --profiles="Standard*"
             --filter="LastModifiedBy.LastName='Doe' AND LastModifiedDate=TODAY"
             --readaccess=true --editaccess=false
```

_See code: [src\commands\crm\profile\fieldpermissions\set.ts](https://github.com/venkatpolisetti/crm-sfdx-plugin/blob/v1.0.1/src\commands\crm\profile\fieldpermissions\set.ts)_

## `sfdx crm:profile:objectpermissions:set`

Sets SObject Level Security for a list of profiles.

```
USAGE
  $ sfdx crm:profile:objectpermissions:set

OPTIONS
  -a, --createaccess=createaccess                 Create SObject permission, defaults to 'true'. Valid values are 'true'
                                                  or 'false'.

  -c, --checkonly                                 Just display details, no updates are made to profiles, defaults to
                                                  false.

  -e, --editaccess=editaccess                     Edit SObject permission, defaults to 'true'. Valid values are 'true'
                                                  or 'false'.

  -o, --sobjects=sobjects                         List of SObjects separated by commas.

  -p, --profiles=profiles                         List of profiles separated by commas. You can also use wildcards as
                                                  part of this parameter to match on profile names (only ^,$,* are
                                                  supported, ^ matches start of the profile name, $ matches end of the
                                                  profile name and * matches one of more characters of profile name).

  -r, --readaccess=readaccess                     Read SObject permission, defaults to 'true'. Valid values are 'true'
                                                  or 'false'.

  -s, --viewallaccess=viewallaccess               View All SObject permission, defaults to 'true'. Valid values are
                                                  'true' or 'false'.

  -u, --targetusername=targetusername             username or alias for the target org; overrides default target org

  -v, --verbose                                   Output to screen in csv format, defaults to false unless --checkonly
                                                  flag is set

  -w, --modifyallaccess=modifyallaccess           Modify All SObject permission, defaults to 'false'. Valid values are
                                                  'true' or 'false'.

  -x, --deleteaccess=deleteaccess                 Delete SObject permission, defaults to 'false'. Valid values are
                                                  'true' or 'false'.

  --apiversion=apiversion                         override the api version used for api requests made by this command

  --json                                          format output as json

  --loglevel=(trace|debug|info|warn|error|fatal)  logging level for this command invocation

EXAMPLE
  $ sfdx crm:profile:objectpermissions:set
             -u myalias
             --sobjects="Account,MyCustomObject__c"
             --profiles="Standard*"
             --readaccess=true --createaccess=false --editaccess=true --deleteaccess=false --viewallaccess=true 
  --modifyallaccess=false
```

_See code: [src\commands\crm\profile\objectpermissions\set.ts](https://github.com/venkatpolisetti/crm-sfdx-plugin/blob/v1.0.1/src\commands\crm\profile\objectpermissions\set.ts)_

## `sfdx crm:profile:recordtypevisibilities:set`

Sets Record Type Visibilities for a list of profiles.

```
USAGE
  $ sfdx crm:profile:recordtypevisibilities:set

OPTIONS
  -c, --checkonly                                 Just display details, no updates are made to profiles, defaults to
                                                  false.

  -p, --profiles=profiles                         List of profiles separated by commas. You can also use wildcards as
                                                  part of this parameter to match on profile names (only ^,$,* are
                                                  supported, ^ matches start of the profile name, $ matches end of the
                                                  profile name and * matches one of more characters of profile name).

  -r, --recordtypes=recordtypes                   JSON Array of Record Type visibility details. Example:
                                                  [{"name":"CustomObj__c.DevelperName_of_RecordType1", "default":true",
                                                  "visible":true}, {"name":"CustomObj__c.DeveloperName_of_RecordType2",
                                                  "visible":false},...]

  -u, --targetusername=targetusername             username or alias for the target org; overrides default target org

  -v, --verbose                                   Output to screen in csv format, defaults to false unless --checkonly
                                                  flag is set

  --apiversion=apiversion                         override the api version used for api requests made by this command

  --json                                          format output as json

  --loglevel=(trace|debug|info|warn|error|fatal)  logging level for this command invocation

EXAMPLE
  $ sfdx crm:profile:recordtypevisibilities:set
             -u myalias
             --profiles="Standard*"
             --recordtypes='[{"name":"CustomObj__c.CustomRecType1", "default":true, 
  "visible":true},{"name":"CustomObj__c.CustomRecType2", "visible":false}]'
```

_See code: [src\commands\crm\profile\recordtypevisibilities\set.ts](https://github.com/venkatpolisetti/crm-sfdx-plugin/blob/v1.0.1/src\commands\crm\profile\recordtypevisibilities\set.ts)_
<!-- commandsstop -->

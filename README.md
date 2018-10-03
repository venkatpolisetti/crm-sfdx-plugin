crm-sfdx-plugin
================================

Sfdx CLI plugins for automating mundane tasks such as setting FLS etc.,

[![Version](https://img.shields.io/npm/v/crm-sfdx-plugin.svg)](https://npmjs.org/package/crm-sfdx-plugin)
[![License](https://img.shields.io/npm/l/crm-sfdx-plugin.svg)](https://github.com/venkatpolisetti/crm-sfdx-plugin/blob/master/package.json)

<!-- install -->
```sh-session
$ sfdx plugins:install crm-sfdx-plugin
```
* [`sfdx crm:fls:set`](#sfdx crm:fls:set)

## `sfdx crm:fls:set`

Sets Field Level Security of fields for a list of profiles.

```
USAGE
  $ sfdx crm:fls:set

OPTIONS
  -c, --checkonly
      Just display details, do not change profiles, defaults to false.

  -d, --datafile=datafile
      File path to a csv file. All other flags are ignored. Make sure to enclose 'profiles' column in double quotes if you 
      have more that one profile. File foramt as follows:

      fieldname,visible,readonly,profiles
      Account.My_Custom_Field_1__c,true,false,"Admin,Integration*"
      Account.My_Custom_Field_2__c,true,false,"ecrm*"

  -f, --filter=filter
      Analogous to SOQL where clause to pull fields from SObjects and required with --sobjects. Allowed fields: 
      CreatedDate, CreatedBy, LastModifiedDate, LastModifiedBy, DeveloperName. DeveloperName here referes to the SObject 
      custom field. Do not include '__c' as part of the search value for DevelperName.

      Examples:

      LastModifiedBy.LastName='Doe' AND lastModifiedDate = TODAY AND DeveloperName like 'MyCustom%'

  -h, --visibleaccess=visibleaccess
      Visible FLS permission, defaults to 'true'. Valid values are 'true' or 'false'.

  -m, --packagexml=packagexml
      File path to package.xml. If this flag is set, --profiles must also be set. 
      Defaults permissions to visibleaccess='true', readonlyaccess='false' unless --visibleaccess and --readonlyaccess are 
      specified.

  -o, --sobjects=sobjects
      List of SObjects separated by commas(FLS can only be set for custom fields via this flag). --filter and --profiles 
      must also be set. 
      Defaults permissions to visibleaccess='true', readonlyaccess='false' unless --visibleaccess and --readonlyaccess are 
      specified. All other flags are ignored.

  -p, --profiles=profiles
      List of profiles separated by commas and is required with --pacakgexml or --sobjects. You can also pass wildcards as 
      a value to match on profile names (only ^,$,* are supported, ^ matches start of the parameter value, $ matches end 
      of the parameter value and * matches one of more character).

  -r, --readonlyaccess=readonlyaccess
      Read Only FLS permission, defaults to 'false'. Valid values are 'true' or 'false'.

  -u, --targetusername=targetusername
      username or alias for the target org; overrides default target org

  -v, --verbose
      Output to screen in datafile format, defaults to false unless --checkonly flag is set

  --apiversion=apiversion
      override the api version used for api requests made by this command

  --json
      format output as json

  --loglevel=(trace|debug|info|warn|error|fatal)
      logging level for this command invocation

EXAMPLES
  $ sfdx crm:fls:set
             -u myalias
             --datafile=./datafile.csv
  $ sfdx crm:fls:set
             -u myalias
             --packagexml=./package.xml
             --profiles="System Administrator,*Read*,Our Custom Profile"
  $ sfdx crm:fls:set
             -u myalias
             --sobjects="Account,MyCustomObject__c"
             --profiles="Standard*"
             --filter="LastModifiedBy.LastName='Doe' AND LastModifiedDate=TODAY"
             --visibleaccess=true --readonlyaccess=false
```

_See code: [src\commands\crm\fls\set.ts](https://github.com/venkatpolisetti/crm-sfdx-plugin/blob/v1.0.0/src\commands\crm\fls\set.ts)_

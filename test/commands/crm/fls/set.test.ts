import { expect, test } from '@salesforce/command/dist/test';

describe('crm:fls:set', () => {
  test
    .withOrg({ username: 'test@org.com' }, true)
    .withConnectionRequest(request => {
      if (request.url.match(/Profile/)) {
        return Promise.resolve({ records: [ { Name: 'Admin', Id: ''}] });
      }
      return Promise.resolve({ records: [] });
    })
    .stdout()
    .command(['crm:fls:set', '--targetusername', 'test@org.com'])
    .it('runs crm:fls:set--targetusername test@org.com', ctx => {
      expect(ctx.stdout).to.contain('');
    });
});

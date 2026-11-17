const test = require('brittle')
const { open } = require('hypergraph/testing')
const { createDNS, createAuthority, HyperDNS } = require('../../src')

test('factory creates working instance', async (t) => {
  const hg = await open(t)
  const { space } = await createAuthority('a', { hg })
  const dns = createDNS({ space })
  t.ok(dns instanceof HyperDNS)
  await dns.publish('example', { type: 'A', value: '1.2.3.4' })
  t.alike(await dns.resolve('example'), [{ type: 'A', value: '1.2.3.4' }])
  t.exception(() => createDNS({}), /space is required/)
})

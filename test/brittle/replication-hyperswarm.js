// The public DHT, not the test's local one: run alone (`npm run test:network`),
// it is left out of `npm test` (scripts/test-with-timeout.js).
process.env.HG_TEST_PUBLIC_DHT = '1'

const test = require('brittle')
const { open, eventually } = require('hypergraph/testing')
const { createAuthority, resolveAddress } = require('../../src')

test('network: publish on the authority owner, resolve on a visitor, over the public DHT', async (t) => {
  const owner = await open(t)
  const visitor = await open(t)
  const a = await createAuthority('test-authority', { hg: owner })
  await a.dns.publish('example', { type: 'A', value: '1.2.3.4' })

  const out = await resolveAddress(`example@${a.link}`, { hg: visitor, timeout: 60000 })
  t.alike(out.records, [{ type: 'A', value: '1.2.3.4' }])

  await a.dns.publish('later', { type: 'A', value: '5.6.7.8' })
  t.ok(await eventually(async () => (await a.dns.resolve('later')).length && (await resolveAddress('later@test-authority', { hg: visitor }).catch(() => null)), 60000))
})

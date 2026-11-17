const test = require('brittle')
const { open, codeOf } = require('hypergraph/testing')
const { createAuthority } = require('../../src')

test('hyperdns: publish then resolve', async (t) => {
  const hg = await open(t)
  const { dns } = await createAuthority('a', { hg })
  const out = await dns.publish('example', { type: 'A', value: '1.2.3.4' })
  t.ok(out.id, 'the record id, for moderation')
  t.alike({ ...out, id: null }, { name: 'example', type: 'A', value: '1.2.3.4', id: null })
  t.alike(await dns.resolve('example'), [{ type: 'A', value: '1.2.3.4' }])
  t.alike(await dns.resolve('other'), [])
})

test('publish validates the record', async (t) => {
  const hg = await open(t)
  const { dns } = await createAuthority('a', { hg })
  t.is(await codeOf(dns.publish('', { type: 'A', value: 'x' })), 'name is required')
  t.is(await codeOf(dns.publish('n', { value: 'x' })), 'record.type is required')
  t.is(await codeOf(dns.publish('n', { type: 'A', value: ' ' })), 'record.value is required')
  t.is(await codeOf(dns.publish('n', { type: 'A', value: 'x', ttl: -1 })), 'INVALID_RECORD')
})

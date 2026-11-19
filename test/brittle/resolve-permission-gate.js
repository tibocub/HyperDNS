const test = require('brittle')
const { open, eventually, codeOf } = require('hypergraph/testing')
const { createAuthority, joinAuthority, PUBLISH_PERMISSION } = require('../../src')

// Only members holding dns.publish publish: the record type's put rule, so
// every member's app refuses others' records and every reader ignores them.
test('publishing needs dns.publish: refused before it is given, counted once it is', async (t) => {
  const owner = await open(t)
  const bob = await open(t)
  const a = await createAuthority('bobsDNS', { hg: owner })
  const j = await joinAuthority(a.link, { hg: bob })

  t.is(await codeOf(j.dns.publish('blog', { type: 'A', value: '6.6.6.6' })), 'NOT_ALLOWED')

  await a.space.defineRole('publisher', ['post', PUBLISH_PERMISSION])
  await a.space.setRole(bob.identity.publicKey, 'publisher')
  t.ok(await eventually(async () => (await j.space.getRole(bob.identity.publicKey)) === 'publisher', 15000))

  await j.dns.publish('blog', { type: 'A', value: '1.2.3.4' })
  t.ok(await eventually(async () => (await a.dns.resolve('blog')).length === 1, 15000), 'the owner sees it')
  t.alike(await a.dns.resolve('blog'), [{ type: 'A', value: '1.2.3.4' }])
})

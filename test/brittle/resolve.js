const test = require('brittle')
const { open, eventually } = require('hypergraph/testing')
const { createAuthority, joinAuthority, PUBLISH_PERMISSION } = require('../../src')

// v1's trustedModerators option is gone: the space's own moderators decide
// (moderateAction), and every member applies their decisions.
test('hyperdns: resolve is deterministic and supports multi-claim + moderation', async (t) => {
  const owner = await open(t)
  const bob = await open(t)
  const a = await createAuthority('bobsDNS', { hg: owner })
  const j = await joinAuthority(a.link, { hg: bob })
  await a.space.defineRole('publisher', ['post', PUBLISH_PERMISSION])
  await a.space.setRole(bob.identity.publicKey, 'publisher')
  t.ok(await eventually(async () => (await j.space.getRole(bob.identity.publicKey)) === 'publisher', 15000))

  // two claims on one name, one of them a duplicate
  await a.dns.publish('blog', { type: 'A', value: '2.2.2.2' })
  const spam = await j.dns.publish('blog', { type: 'A', value: '1.1.1.1' })
  await j.dns.publish('blog', { type: 'A', value: '2.2.2.2' })
  await a.dns.publish('blog', { type: 'TXT', value: 'hello', ttl: 30 })

  const expected = [{ type: 'A', value: '1.1.1.1' }, { type: 'A', value: '2.2.2.2' }, { type: 'TXT', value: 'hello', ttl: 30 }]
  t.ok(await eventually(async () => (await a.dns.resolve('blog')).length === 3, 15000))
  t.alike(await a.dns.resolve('blog'), expected, 'merged, deduplicated, sorted by type then value')
  t.alike(await a.dns.resolve('blog'), expected, 'the same again')
  t.ok(await eventually(async () => JSON.stringify(await j.dns.resolve('blog')) === JSON.stringify(expected), 15000), 'the same on the other member')

  await a.space.moderateAction('hide', spam.id, { reason: 'spam' })
  t.alike(await a.dns.resolve('blog'), expected.slice(1), 'a hidden record is out')
  t.ok(await eventually(async () => (await j.dns.resolve('blog')).length === 2, 15000), 'for every member')
})

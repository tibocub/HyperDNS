const test = require('brittle')
const { open, eventually, codeOf } = require('hypergraph/testing')
const { createAuthority, joinAuthority, resolveAddress } = require('../../src')

// Private authorities are the core's private spaces: sealed records, members
// let in by invite links (v1's grantAccess(pubkey, encKey) is gone, D1).
// v1's topic tests are gone too: the core meets on topics derived from keys.

test('private authority: no public link, and the owner publishes and resolves normally', async (t) => {
  const hg = await open(t)
  const a = await createAuthority('secretDNS', { hg, private: true })
  t.is(a.link, null)
  t.ok(a.space.private)
  t.absent(a.space.isPublic)
  await a.dns.publish('blog', { type: 'hyper', value: 'hg:abc' })
  t.alike(await a.dns.resolve('blog'), [{ type: 'hyper', value: 'hg:abc' }])
})

test('private authority: someone with only its key cannot get in', async (t) => {
  const owner = await open(t)
  const stranger = await open(t)
  const a = await createAuthority('secretDNS', { hg: owner, private: true })
  await a.dns.publish('blog', { type: 'hyper', value: 'hg:abc' })
  // its holders don't answer a stranger at all: it looks like nobody is online
  t.is(await codeOf(resolveAddress(`blog@hg:${a.space.key}`, { hg: stranger, timeout: 3000 })), 'UNAVAILABLE')
  t.alike(stranger.spaces(), [], 'nothing of it kept')
})

test('private authority: an invite link lets a member in, who then resolves records', async (t) => {
  const owner = await open(t)
  const member = await open(t)
  const a = await createAuthority('secretDNS', { hg: owner, private: true })
  await a.dns.publish('blog', { type: 'hyper', value: 'hg:abc' })

  const j = await joinAuthority(await a.space.createInvite(), { hg: member })
  t.ok(await eventually(async () => (await j.dns.resolve('blog')).length === 1, 15000))
  t.alike((await resolveAddress('blog@secretDNS', { hg: member })).records, [{ type: 'hyper', value: 'hg:abc' }])
})

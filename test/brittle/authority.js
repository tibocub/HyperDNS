const test = require('brittle')
const { open, eventually, codeOf } = require('hypergraph/testing')
const { createAuthority, joinAuthority } = require('../../src')

test('createAuthority() bootstraps a working, public DNS authority in one call', async (t) => {
  const hg = await open(t)
  const a = await createAuthority('bobsDNS', { hg })
  t.is(a.space.name, 'bobsDNS')
  t.ok(a.space.isPublic, 'public by default: anyone with the link may read it')
  t.is(a.link, a.space.publicLink())
  await a.dns.publish('blog', { type: 'A', value: '1.2.3.4', ttl: 60 })
  t.alike(await a.dns.resolve('blog'), [{ type: 'A', value: '1.2.3.4', ttl: 60 }])
})

test('joinAuthority(link) gives a peer that resolves the owner\'s records', async (t) => {
  const owner = await open(t)
  const peer = await open(t)
  const a = await createAuthority('bobsDNS', { hg: owner })
  await a.dns.publish('blog', { type: 'A', value: '1.2.3.4' })

  const j = await joinAuthority(a.link, { hg: peer })
  t.is(j.space.key, a.space.key)
  t.ok(await eventually(async () => (await j.dns.resolve('blog')).length === 1, 15000))
  t.alike(await j.dns.resolve('blog'), [{ type: 'A', value: '1.2.3.4' }])

  // published later, replicated later, with nothing to update by hand
  await a.dns.publish('wiki', { type: 'A', value: '5.6.7.8' })
  t.ok(await eventually(async () => (await j.dns.resolve('wiki')).length === 1, 15000))

  t.is((await joinAuthority(a.link, { hg: peer })).space.key, a.space.key, 'joining a held authority again reuses it')
})

test('createAuthority()/joinAuthority() validate their input', async (t) => {
  const hg = await open(t)
  t.is(await codeOf(createAuthority('x', {})), 'opts.hg is required')
  t.is(await codeOf(createAuthority('', { hg })), 'name is required')
  t.is(await codeOf(joinAuthority('hg:abc', {})), 'opts.hg is required')
  t.is(await codeOf(joinAuthority('', { hg })), 'link is required')
})

test('joinAuthority timeout: 0 does not wait (regression: 0 was read as hypergraph\'s 30 s default)', async (t) => {
  const hg = await open(t)
  const gone = await open(t)
  const { link } = await createAuthority('goneDNS', { hg: gone })
  await gone.close()
  const start = Date.now()
  t.is(await codeOf(joinAuthority(link, { hg, timeout: 0 })), 'INVITE_INVALID')
  t.ok(Date.now() - start < 5000, `answered in ${Date.now() - start} ms`)
})

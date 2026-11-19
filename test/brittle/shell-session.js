const test = require('brittle')
const { tmpDir, bootstrap, eventually } = require('hypergraph/testing')
const { createSession } = require('../../shell/lib/session')

async function session (t, baseDir = tmpDir(t)) {
  const s = createSession({ baseDir, hgOpts: { bootstrap: await bootstrap(t) } })
  t.teardown(() => s.shutdown(), { order: 0 })
  return s
}

test('session: create() again for the same name resumes the same authority and identity, owner role included', async (t) => {
  const baseDir = tmpDir(t)
  const a = await session(t, baseDir)
  const first = await a.create('bobsDNS')
  const identity = first.hg.identity.publicKey
  const key = first.space.key
  t.absent(first.resumed)
  await a.shutdown()

  const b = await session(t, baseDir)
  const second = await b.create('bobsDNS')
  t.ok(second.resumed)
  t.is(second.space.key, key)
  t.is(second.hg.identity.publicKey, identity)
  t.is(await second.space.getRole(identity), 'owner')
})

test('session: publish/resolve persist across a full close and resume', async (t) => {
  const baseDir = tmpDir(t)
  const a = await session(t, baseDir)
  await a.create('bobsDNS')
  await a.get().dns.publish('blog', { type: 'A', value: '1.2.3.4' })
  await a.shutdown()

  const b = await session(t, baseDir)
  await b.create('bobsDNS')
  t.alike(await b.get().dns.resolve('blog'), [{ type: 'A', value: '1.2.3.4' }])
})

test('session: a joined authority comes back with use() after a restart, same identity', async (t) => {
  const owner = await session(t)
  const created = await owner.create('bobsDNS')
  await owner.get().dns.publish('blog', { type: 'A', value: '1.2.3.4' })
  await owner.connect()

  const baseDir = tmpDir(t)
  const peer = await session(t, baseDir)
  const joined = await peer.join(created.link)
  const identity = joined.hg.identity.publicKey
  t.ok(await eventually(async () => (await peer.get().dns.resolve('blog')).length === 1, 15000))
  await peer.shutdown()

  const again = await session(t, baseDir)
  const used = await again.use('bobsDNS')
  t.is(used.space.key, created.space.key)
  t.is(used.hg.identity.publicKey, identity)
  t.alike(await used.dns.resolve('blog'), [{ type: 'A', value: '1.2.3.4' }], 'held offline too')
})

test('session: get() returns the object create() returned; connect() shows in promptLabel()', async (t) => {
  const s = await session(t)
  t.is(s.promptLabel(), 'hyperdns')
  const created = await s.create('bobsDNS')
  t.is(s.get(), created)
  t.is(s.promptLabel(), 'hyperdns:bobsDNS (offline)')
  await s.connect()
  t.is(s.promptLabel(), 'hyperdns:bobsDNS (online)')
  await s.disconnect()
  t.is(s.promptLabel(), 'hyperdns:bobsDNS (offline)')
})

test('session: requireCurrent() throws a clear error when nothing has been loaded', async (t) => {
  const s = await session(t)
  t.exception(() => s.requireCurrent(), /no authority loaded/)
})

test('session: create() rejects a path where a name was expected, join() a non-link', async (t) => {
  const s = await session(t)
  await t.exception(s.create('.hyperdns/test2/descriptor.json'), /looks like a path/)
  await t.exception(s.create('my dns'), /looks like a path/)
  await t.exception(s.join('descriptor.json'), /expects a link/)
  await t.exception(s.use('nobody'), /No authority "nobody"/)
})

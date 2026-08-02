const test = require('brittle')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { createSession } = require('../../shell/lib/session')

function makeTmpBaseDir () {
  const dir = path.join(os.tmpdir(), `hyperdns-shell-session-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

test('session: create() then create() again for the same name resumes the SAME identity, not a fresh one', async (t) => {
  // This is a regression test for a real bug: new Hypergraph(store) with no
  // explicit seed generates a fresh random identity every time - nothing is
  // automatically derived from the store's own on-disk state. A first
  // attempt at fixing this passed only { seed }, which turned out to be
  // insufficient on its own: graph.key (what a RoleBase registry actually
  // checks permissions against) comes from deviceKeyPair, which defaults to
  // a fresh random keypair regardless of seed unless passed explicitly.
  const baseDir = makeTmpBaseDir()
  t.teardown(() => fs.rmSync(baseDir, { recursive: true, force: true }))

  const sessionA = createSession({ baseDir })
  const first = await sessionA.create('bobsDNS')
  const firstIdentity = first.graph.key.toString('hex')
  await sessionA.shutdown()

  const sessionB = createSession({ baseDir })
  const second = await sessionB.create('bobsDNS')
  const secondIdentity = second.graph.key.toString('hex')

  t.ok(second.resumed, 'the second create() call recognizes this as a resume, not a fresh authority')
  t.is(secondIdentity, firstIdentity, 'resuming produces the exact same identity, not a new random one')

  await sessionB.shutdown()
})

test('session: the resumed identity actually holds the owner role in the registry, not just a matching key', async (t) => {
  // A matching graph.key alone doesn't prove much if the RoleBase registry
  // itself doesn't recognize it - this checks the thing that actually
  // matters: graph.can()/the registry's own record of who the owner is.
  const baseDir = makeTmpBaseDir()
  t.teardown(() => fs.rmSync(baseDir, { recursive: true, force: true }))

  const session = createSession({ baseDir })
  await session.create('bobsDNS')
  await session.shutdown()

  const session2 = createSession({ baseDir })
  const resumed = await session2.create('bobsDNS')
  t.ok(resumed.resumed, 'resumed, not recreated')

  await resumed.graph.roleBase.update()
  const registry = await resumed.graph.roleBase.getRegistry()
  const myKey = resumed.graph.key.toString('hex')

  t.ok(registry, 'the registry is readable after resuming')
  t.is(registry.members[myKey], 'owner', 'the resumed identity is recognized as the actual owner in the registry')

  await session2.shutdown()
})

test('session: publish/resolve persist correctly across a full close and resume', async (t) => {
  const baseDir = makeTmpBaseDir()
  t.teardown(() => fs.rmSync(baseDir, { recursive: true, force: true }))

  const session1 = createSession({ baseDir })
  const first = await session1.create('bobsDNS')
  await first.dns.publish('example', { type: 'A', value: '1.2.3.4' })
  await session1.shutdown()

  const session2 = createSession({ baseDir })
  const second = await session2.create('bobsDNS')
  const result = await second.dns.resolve('example')

  t.alike(result, [{ type: 'A', value: '1.2.3.4' }], 'the published record survives a full session close and resume')

  await session2.shutdown()
})

test('session: join() resumes the SAME joining identity across restarts too, not just the owner side', async (t) => {
  const ownerBaseDir = makeTmpBaseDir()
  const peerBaseDir = makeTmpBaseDir()
  t.teardown(() => {
    fs.rmSync(ownerBaseDir, { recursive: true, force: true })
    fs.rmSync(peerBaseDir, { recursive: true, force: true })
  })

  const ownerSession = createSession({ baseDir: ownerBaseDir })
  const owner = await ownerSession.create('bobsDNS')

  const peerSession1 = createSession({ baseDir: peerBaseDir })
  const peerFirst = await peerSession1.join(JSON.stringify(owner.descriptor))
  const peerFirstIdentity = peerFirst.graph.key.toString('hex')
  await peerSession1.shutdown()

  const peerSession2 = createSession({ baseDir: peerBaseDir })
  const peerSecond = await peerSession2.join(JSON.stringify(owner.descriptor))
  const peerSecondIdentity = peerSecond.graph.key.toString('hex')

  t.is(peerSecondIdentity, peerFirstIdentity, "the joining peer's identity is also stable across restarts")

  await ownerSession.shutdown()
  await peerSession2.shutdown()
})

test('session: get() returns the exact same object create()/join() returned, so connect()\'s mutation of .network is actually visible', async (t) => {
  // Regression test for a real bug: create()/join() used to do
  // `current = { ...result, store, name, dir, resumed }` - spreading
  // result into a brand new object. attachConnect()'s `.connect()` method
  // is a closure that mutates the ORIGINAL result object's `.network`
  // property - the spread-copied `current` object has no relationship to
  // that closure at all, so calling connect() correctly set network on the
  // object connect() itself was defined on, while everything the shell
  // actually reads (the prompt, `status`, a second `connect()` call's
  // "already connected" check) kept reading the spread copy, which never
  // updated - .network stayed null forever, so the shell always showed
  // "offline" even after a real, successful connect(), and a second
  // "connect" command never short-circuited, attempting a second
  // concurrent connectToSwarm() on the same graph.
  //
  // This checks the actual invariant directly - no need to wait on a real,
  // possibly slow network call to prove it.
  const baseDir = makeTmpBaseDir()
  t.teardown(() => fs.rmSync(baseDir, { recursive: true, force: true }))

  const session = createSession({ baseDir })
  const authority = await session.create('bobsDNS')

  t.is(session.get(), authority, 'session.get() is reference-equal to what create() returned, not a copy')

  // Simulates exactly what connect()'s attachConnect closure does,
  // without waiting on a real (possibly very slow) network call.
  authority.network = { fakeMarker: true }
  t.is(session.get().network, authority.network, "mutating .network on the object create() returned is immediately visible via session.get() - this is what the shell's prompt/status/'already connected' check all rely on")

  await session.shutdown()
})

test('session: the same invariant holds for join(), not just create()', async (t) => {
  const ownerBaseDir = makeTmpBaseDir()
  const peerBaseDir = makeTmpBaseDir()
  t.teardown(() => {
    fs.rmSync(ownerBaseDir, { recursive: true, force: true })
    fs.rmSync(peerBaseDir, { recursive: true, force: true })
  })

  const ownerSession = createSession({ baseDir: ownerBaseDir })
  const owner = await ownerSession.create('bobsDNS')

  const peerSession = createSession({ baseDir: peerBaseDir })
  const peer = await peerSession.join(JSON.stringify(owner.descriptor))

  t.is(peerSession.get(), peer, 'session.get() is reference-equal to what join() returned')
  peer.network = { fakeMarker: true }
  t.is(peerSession.get().network, peer.network, "mutating .network on join()'s returned object is immediately visible via session.get()")

  await ownerSession.shutdown()
  await peerSession.shutdown()
})

test('session: create() and join() for the same authority name do not collide on disk, even while both are open at once', async (t) => {
  // Regression test: create() and join() used to both key their storage
  // directory purely by authority name (.hyperdns/<name>/) - an owner
  // running "create test2" and a local peer running "join .../test2/
  // descriptor.json" on the same machine would try to open the exact same
  // Corestore at once, which fails outright (the storage engine locks its
  // files per-process, so this isn't just a slow-to-converge race - it's a
  // hard failure every time).
  const baseDir = makeTmpBaseDir()
  t.teardown(() => fs.rmSync(baseDir, { recursive: true, force: true }))

  const ownerSession = createSession({ baseDir })
  const owner = await ownerSession.create('test2')
  // Deliberately NOT shut down - simulates the owner's session still being
  // open (holding its lock) while a local peer tries to join.

  const peerSession = createSession({ baseDir })
  const peer = await peerSession.join(JSON.stringify(owner.descriptor))

  t.not(owner.dir, peer.dir, "the owner's and the peer's local storage directories are different")
  t.ok(fs.existsSync(owner.dir), "the owner's directory exists")
  t.ok(fs.existsSync(peer.dir), "the peer's directory exists")

  await ownerSession.shutdown()
  await peerSession.shutdown()
})

test('session: join() refuses to reuse local data for a different authority that happens to share a name', async (t) => {
  const baseDir = makeTmpBaseDir()
  t.teardown(() => fs.rmSync(baseDir, { recursive: true, force: true }))

  const ownerSession = createSession({ baseDir })
  const authorityA = await ownerSession.create('sharedname')
  await ownerSession.shutdown()

  const peerSession1 = createSession({ baseDir })
  await peerSession1.join(JSON.stringify(authorityA.descriptor))
  await peerSession1.shutdown()

  const peerSession2 = createSession({ baseDir })
  const differentAuthority = { ...authorityA.descriptor, roleBaseKey: 'f'.repeat(65) }
  await t.exception(
    () => peerSession2.join(JSON.stringify(differentAuthority)),
    /name collision/,
    'joining a different authority with a colliding name is refused, not silently mixed with the first'
  )
})

test('session: requireCurrent() throws a clear error when nothing has been created or joined yet', async (t) => {
  const baseDir = makeTmpBaseDir()
  t.teardown(() => fs.rmSync(baseDir, { recursive: true, force: true }))

  const session = createSession({ baseDir })
  t.exception(() => session.requireCurrent(), /no authority loaded/)
})

test('session: create() rejects a path where a name was expected, instead of silently mangling it into a confusing directory name', async (t) => {
  const baseDir = makeTmpBaseDir()
  t.teardown(() => fs.rmSync(baseDir, { recursive: true, force: true }))

  const session = createSession({ baseDir })
  await t.exception(
    () => session.create('.hyperdns/test2/descriptor.json'),
    /doesn't look like an authority name/,
    'a path-like name is rejected with a clear error'
  )
  await t.exception(() => session.create(''), 'an empty name is rejected')
  await t.exception(() => session.create('has spaces'), 'a name containing whitespace is rejected')
})

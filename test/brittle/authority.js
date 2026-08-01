const test = require('brittle')
const Corestore = require('corestore')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { createAuthority, joinAuthority } = require('../../src')

function makeTmp (prefix) {
  const dir = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Direct Corestore-to-Corestore stream replication - no DHT/Hyperswarm - the
// same fast, reliable pattern used elsewhere for testing real cross-peer
// behavior without real-network flakiness. The dedicated (slower, real
// Hyperswarm) end-to-end proof lives in replication-hyperswarm.js; this
// file is about the bootstrap API itself.
function replicatePair (storeA, storeB) {
  const s1 = storeA.replicate(true, { live: true })
  const s2 = storeB.replicate(false, { live: true })
  s1.pipe(s2).pipe(s1)
  return { close: () => { try { s1.destroy() } catch {} try { s2.destroy() } catch {} } }
}

async function waitFor (fn, { timeoutMs = 8000, intervalMs = 100 } = {}) {
  const start = Date.now()
  for (;;) {
    const val = await fn()
    if (val) return val
    if (Date.now() - start > timeoutMs) return null
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}

test('createAuthority() bootstraps a fully working, ready-to-use DNS instance in one call', async (t) => {
  const dir = makeTmp('hyperdns-authority-create')
  const store = new Corestore(dir)

  const authority = await createAuthority('bobsDNS', { store })

  t.teardown(async () => {
    await authority.graph.close()
    await store.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  t.absent(authority.network, 'no network connection is made unless opts.connect is set')
  t.ok(authority.descriptor.authority === 'bobsDNS', 'the descriptor carries the authority name')
  t.ok(authority.descriptor.roleBaseKey, 'the descriptor carries a RoleBase key')
  t.ok(Array.isArray(authority.descriptor.contexts) && authority.descriptor.contexts.length === 1, 'the descriptor carries exactly one context')

  await authority.dns.publish('example', { type: 'A', value: '1.2.3.4' })
  const result = await authority.dns.resolve('example')
  t.alike(result, [{ type: 'A', value: '1.2.3.4' }], 'publish/resolve work immediately with zero further setup')
})

test('createAuthority()\'s descriptor is plain and JSON-serializable, and joinAuthority() can rebuild a working peer from it', async (t) => {
  const dirOwner = makeTmp('hyperdns-authority-owner')
  const dirMember = makeTmp('hyperdns-authority-member')

  const storeOwner = new Corestore(dirOwner)
  const storeMember = new Corestore(dirMember)

  const owner = await createAuthority('bobsDNS', { store: storeOwner })

  const repl = replicatePair(storeOwner, storeMember)

  t.teardown(async () => {
    repl.close()
    await Promise.allSettled([
      owner.graph.close(),
      storeOwner.close(),
      storeMember.close()
    ])
    fs.rmSync(dirOwner, { recursive: true, force: true })
    fs.rmSync(dirMember, { recursive: true, force: true })
  })

  // Simulates however a real app would actually pass this along - printed,
  // sent to a friend, embedded in an address.
  const wireDescriptor = JSON.parse(JSON.stringify(owner.descriptor))

  const member = await joinAuthority(wireDescriptor, { store: storeMember })
  t.teardown(async () => { await member.graph.close() })

  t.absent(member.network, 'no network connection is made unless opts.connect is set')

  await owner.dns.publish('example', { type: 'A', value: '9.9.9.9' })
  await owner.graph.update()

  const replicated = await waitFor(async () => {
    await member.graph.update()
    await member.graph.roleBase.update()
    const r = await member.dns.resolve('example')
    return Array.isArray(r) && r.length === 1 ? r : null
  })

  t.alike(replicated, [{ type: 'A', value: '9.9.9.9' }], "joinAuthority()'s peer resolves the owner's published record correctly")
})

test('createAuthority()/joinAuthority() require opts.store', async (t) => {
  await t.exception(() => createAuthority('bobsDNS'), 'createAuthority throws without opts.store')
  await t.exception(() => joinAuthority({ authority: 'bobsDNS', roleBaseKey: 'a'.repeat(64), contexts: [{ key: 'b'.repeat(64) }] }), 'joinAuthority throws without opts.store')
})

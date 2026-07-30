const test = require('brittle')
const Corestore = require('corestore')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { Hypergraph } = require('hypergraph')
const publish = require('../../src/publish')
const resolve = require('../../src/resolve')

function makeTmp (prefix) {
  const dir = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Corestore.replicate() returns a protocol stream; pipe two peers' streams
// together directly. No DHT/Hyperswarm involved - this is the same pattern
// hypergraph's own multi-peer test suite uses for fast, reliable local
// replication (see test/brittle/forum/harness.js in the hypergraph repo).
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
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

// This is the actual regression test for the fix: resolve() must not honor
// a domain claim from an author who doesn't currently hold the required
// permission in the context's own RoleBase registry (graph.can()), even
// though that author is a real, admitted writer of the context - and must
// start honoring it the moment that permission is granted, with no other
// change. Two genuinely separate Hypergraph identities are used (not two
// entities from the same instance) since authorship can't be faked from a
// single identity.
test('resolve() excludes a domain claim until its author holds the claim permission, includes it once granted', async (t) => {
  const dirOwner = makeTmp('hyperdns-test-permgate-owner')
  const dirMember = makeTmp('hyperdns-test-permgate-member')

  const storeOwner = new Corestore(dirOwner)
  const storeMember = new Corestore(dirMember)

  const graphOwner = new Hypergraph(storeOwner)
  const graphMember = new Hypergraph(storeMember)
  await graphOwner.ready()
  await graphMember.ready()

  const repl = replicatePair(storeOwner, storeMember)

  t.teardown(async () => {
    repl.close()
    await Promise.allSettled([
      graphOwner.close(),
      graphMember.close(),
      storeOwner.close(),
      storeMember.close()
    ])
    fs.rmSync(dirOwner, { recursive: true, force: true })
    fs.rmSync(dirMember, { recursive: true, force: true })
  })

  const ownerPubkey = graphOwner.key.toString('hex')

  await graphOwner.createRoleBase()
  await graphOwner.roleBase.init(ownerPubkey)
  await graphMember.openRoleBase(graphOwner.roleBase.key)

  const ctxKey = await graphOwner.createContext()
  const ownerCtx = await graphOwner.openContext(ctxKey)
  const memberCtx = await graphMember.openContext(ctxKey)

  // Each side needs the other author's UserCore opened to see their
  // entities/content once replicated.
  await graphOwner.openUserCore(graphMember.key)
  await graphMember.openUserCore(graphOwner.key)

  // Admit the member as a writer of the (open-mode) context. Unrestricted
  // in open mode - this is the same underlying primitive a networking
  // layer's writer-grant handshake would call.
  await ownerCtx.addWriter(memberCtx.localKey)

  const admitted = await waitFor(async () => {
    await memberCtx.update()
    return memberCtx.writable
  })
  t.ok(admitted, 'member became a writer of the shared context')

  // The member publishes with only the default `member` role, which starts
  // with zero permissions (see hypergraph's roles-registry.js initRegistry).
  await publish('example', { type: 'A', value: '9.9.9.9' }, { graph: graphMember, context: ctxKey })
  await graphMember.update()

  const replicated = await waitFor(async () => {
    await graphOwner.update()
    const domains = []
    for await (const node of graphOwner.getByTag('name:example', {})) domains.push(node)
    return domains.length > 0
  })
  t.ok(replicated, "the member's claim replicated to the owner's copy of the graph")

  const before = await resolve('example', { graph: graphOwner, context: ctxKey })
  t.alike(before, [], 'a claim from an author without dns.publish is excluded by default, even though it fully replicated')

  // Grant the `member` role the claim permission.
  await graphOwner.roleBase.append({
    type: 'roles/setRolePermissions',
    role: 'member',
    permissions: ['dns.publish'],
    author: ownerPubkey,
    timestamp: Date.now()
  })
  await graphOwner.update()

  const permissionSynced = await waitFor(async () => {
    await graphOwner.roleBase.update()
    return graphOwner.can(graphMember.key.toString('hex'), 'dns.publish')
  })
  t.ok(permissionSynced, 'the permission grant is visible on the owner side')

  const after = await resolve('example', { graph: graphOwner, context: ctxKey })
  t.alike(after, [{ type: 'A', value: '9.9.9.9' }], 'the exact same claim now resolves once its author holds dns.publish - nothing else changed')
})

// relate() (unlike tag()) does not check ownership of `from`/`to` - any
// writer can attach a `has_record` edge from an entity they don't own to an
// entity they do. This confirms resolve() does not fall for it: an
// unprivileged writer attaching their own record to SOMEONE ELSE'S
// (permitted) domain node must not cause that record to resolve, since the
// edge itself is authored by the unprivileged writer.
test('resolve() ignores a record relate()-attached to someone else\'s domain by an unprivileged author', async (t) => {
  const dirOwner = makeTmp('hyperdns-test-permgate-spoof-owner')
  const dirAttacker = makeTmp('hyperdns-test-permgate-spoof-attacker')

  const storeOwner = new Corestore(dirOwner)
  const storeAttacker = new Corestore(dirAttacker)

  const graphOwner = new Hypergraph(storeOwner)
  const graphAttacker = new Hypergraph(storeAttacker)
  await graphOwner.ready()
  await graphAttacker.ready()

  const repl = replicatePair(storeOwner, storeAttacker)

  t.teardown(async () => {
    repl.close()
    await Promise.allSettled([
      graphOwner.close(),
      graphAttacker.close(),
      storeOwner.close(),
      storeAttacker.close()
    ])
    fs.rmSync(dirOwner, { recursive: true, force: true })
    fs.rmSync(dirAttacker, { recursive: true, force: true })
  })

  const ownerPubkey = graphOwner.key.toString('hex')

  await graphOwner.createRoleBase()
  await graphOwner.roleBase.init(ownerPubkey)
  await graphAttacker.openRoleBase(graphOwner.roleBase.key)

  const ctxKey = await graphOwner.createContext()
  const ownerCtx = await graphOwner.openContext(ctxKey)
  const attackerCtx = await graphAttacker.openContext(ctxKey)

  await graphOwner.openUserCore(graphAttacker.key)
  await graphAttacker.openUserCore(graphOwner.key)

  await ownerCtx.addWriter(attackerCtx.localKey)
  const admitted = await waitFor(async () => {
    await attackerCtx.update()
    return attackerCtx.writable
  })
  t.ok(admitted, 'attacker became a writer of the shared context (open mode, unrestricted)')

  // Owner legitimately publishes "example".
  await publish('example', { type: 'A', value: '1.2.3.4' }, { graph: graphOwner, context: ctxKey })
  await graphOwner.update()

  const ownerDomain = await (async () => {
    for await (const node of graphOwner.getByTag('name:example', {})) return node
    return null
  })()
  t.ok(ownerDomain, 'owner domain claim exists')

  const attackerSeesOwner = await waitFor(async () => {
    await graphAttacker.update()
    for await (const node of graphAttacker.getByTag('name:example', {})) return true
    return false
  })
  t.ok(attackerSeesOwner, "owner's claim replicated to the attacker's side")

  // Attacker (default `member` role, no dns.publish) creates their own
  // record, then relates it FROM the owner's domain node - not their own.
  const spoofRecord = await graphAttacker.put({ type: 'record' })
  await graphAttacker.putContent(spoofRecord.id, JSON.stringify({ name: 'example', type: 'A', value: '6.6.6.6' }), 'application/json')
  await graphAttacker.relate({ from: ownerDomain.id, to: spoofRecord.id, type: 'has_record', context: ctxKey })
  await graphAttacker.update()

  const spoofReplicated = await waitFor(async () => {
    await graphOwner.update()
    for await (const edge of graphOwner.edges(ownerDomain.id, { direction: 'out', type: 'has_record' })) {
      if (edge.to === spoofRecord.id) return true
    }
    return false
  })
  t.ok(spoofReplicated, 'the spoofed edge itself did replicate and attach at the raw graph level (relate() really does allow this)')

  const result = await resolve('example', { graph: graphOwner, context: ctxKey })
  t.alike(result, [{ type: 'A', value: '1.2.3.4' }], 'only the legitimate record resolves - the spoofed relate() is ignored')
})

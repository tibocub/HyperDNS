const test = require('brittle')
const Corestore = require('corestore')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { createAuthority, joinAuthority } = require('../../src')
const { deriveAuthorityTopic } = require('../../network/topic')

function makeTmp (prefix) {
  const dir = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Same fast, deterministic direct-replication pattern used in authority.js's
// own tests - no DHT/Hyperswarm needed to prove the actual crypto/protocol
// logic works.
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

test('private authority: uses a random topic, not one derivable from its name', async (t) => {
  const dir = makeTmp('hyperdns-private-topic')
  const store = new Corestore(dir)
  t.teardown(async () => { await store.close(); fs.rmSync(dir, { recursive: true, force: true }) })

  const authority = await createAuthority('secretDNS', { store, private: true })

  t.ok(authority.descriptor.private, 'the descriptor records that this authority is private')
  t.ok(authority.descriptor.topic, 'a topic is present in the descriptor')
  t.not(
    authority.descriptor.topic,
    deriveAuthorityTopic('secretDNS').toString('hex'),
    'the topic is NOT the one anyone could derive just from knowing the authority name - reaching it requires the descriptor'
  )
})

test('non-private authority: topic derivation is unchanged - still derivable from the name, as before this feature existed', async (t) => {
  const dir = makeTmp('hyperdns-public-topic')
  const store = new Corestore(dir)
  t.teardown(async () => { await store.close(); fs.rmSync(dir, { recursive: true, force: true }) })

  const authority = await createAuthority('publicDNS', { store })

  t.absent(authority.descriptor.private, 'private is falsy for a normal authority')
  t.is(
    authority.descriptor.topic,
    deriveAuthorityTopic('publicDNS').toString('hex'),
    'a non-private authority still uses the name-derived topic, exactly as before'
  )
})

test('private authority: the owner can publish and resolve their own records normally', async (t) => {
  const dir = makeTmp('hyperdns-private-owner-resolve')
  const store = new Corestore(dir)
  t.teardown(async () => { await store.close(); fs.rmSync(dir, { recursive: true, force: true }) })

  const authority = await createAuthority('secretDNS', { store, private: true })
  await authority.dns.publish('testrec', { type: 'hyper', value: 'hyper://123abc' })
  await authority.graph.update()

  const result = await authority.dns.resolve('testrec')
  t.alike(result, [{ type: 'hyper', value: 'hyper://123abc' }], "the owner (auto-granted the scope's key on creation) resolves their own record normally")
})

test('private authority: a joined peer WITHOUT a grant cannot resolve record values, even though everything has genuinely replicated', async (t) => {
  const dirOwner = makeTmp('hyperdns-private-nogrant-owner')
  const dirPeer = makeTmp('hyperdns-private-nogrant-peer')
  const storeOwner = new Corestore(dirOwner)
  const storePeer = new Corestore(dirPeer)

  const owner = await createAuthority('secretDNS', { store: storeOwner, private: true })
  const repl = replicatePair(storeOwner, storePeer)

  let peer = null
  t.teardown(async () => {
    repl.close()
    // graphs before their stores (Autobase 7.28.2 throws on a base closed after its storage)
    await Promise.allSettled([owner.graph.close(), peer && peer.graph.close()])
    await Promise.allSettled([storeOwner.close(), storePeer.close()])
    fs.rmSync(dirOwner, { recursive: true, force: true })
    fs.rmSync(dirPeer, { recursive: true, force: true })
  })

  await owner.dns.publish('testrec', { type: 'hyper', value: 'hyper://123abc' })
  await owner.graph.update()

  const wireDescriptor = JSON.parse(JSON.stringify(owner.descriptor))
  peer = await joinAuthority(wireDescriptor, { store: storePeer })

  // Confirm this is a genuine replication, not a connectivity failure: the
  // domain/name IS visible to the peer, since names/tags are never
  // encrypted (see docs/PRIVACY.md) - only the record's own content is.
  const domainSeen = await waitFor(async () => {
    await peer.graph.update()
    const found = []
    for await (const node of peer.graph.getByTag('name:testrec', { context: peer.context })) found.push(node)
    return found.length > 0 ? found : null
  })
  t.ok(domainSeen, "the domain claim (and its name) genuinely replicated to the peer - names are never hidden, even in a private authority")

  const result = await peer.dns.resolve('testrec')
  t.alike(result, [], 'but the record VALUE is not resolvable at all without an explicit grant, despite full replication')
})

test('private authority: grantAccess() lets a specific, already-identified peer resolve record values', async (t) => {
  const dirOwner = makeTmp('hyperdns-private-grant-owner')
  const dirPeer = makeTmp('hyperdns-private-grant-peer')
  const storeOwner = new Corestore(dirOwner)
  const storePeer = new Corestore(dirPeer)

  const owner = await createAuthority('secretDNS', { store: storeOwner, private: true })
  const repl = replicatePair(storeOwner, storePeer)

  let peer = null
  t.teardown(async () => {
    repl.close()
    // graphs before their stores (Autobase 7.28.2 throws on a base closed after its storage)
    await Promise.allSettled([owner.graph.close(), peer && peer.graph.close()])
    await Promise.allSettled([storeOwner.close(), storePeer.close()])
    fs.rmSync(dirOwner, { recursive: true, force: true })
    fs.rmSync(dirPeer, { recursive: true, force: true })
  })

  await owner.dns.publish('testrec', { type: 'hyper', value: 'hyper://123abc' })
  await owner.graph.update()

  const wireDescriptor = JSON.parse(JSON.stringify(owner.descriptor))
  peer = await joinAuthority(wireDescriptor, { store: storePeer })

  // The recipient's public keys have to be known to the granter in advance
  // (exchanged out-of-band) - there's no invite-code flow yet, see
  // docs/PRIVACY.md.
  const peerPubkeyHex = peer.graph.key.toString('hex')
  const peerEncryptionPubkeyHex = peer.graph.identity.encryptionKeyPair.publicKey.toString('hex')

  await owner.grantAccess(peerPubkeyHex, peerEncryptionPubkeyHex)
  await owner.graph.update()

  const result = await waitFor(async () => {
    await peer.graph.update()
    const r = await peer.dns.resolve('testrec')
    return Array.isArray(r) && r.length === 1 ? r : null
  })

  t.alike(result, [{ type: 'hyper', value: 'hyper://123abc' }], 'once granted, the same peer now resolves the record correctly')
})

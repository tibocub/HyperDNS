const path = require('path')
const fs = require('fs')
const Corestore = require('corestore')
const hypercoreCrypto = require('hypercore-crypto')
const { Hypergraph } = require('hypergraph')
const { createAuthority, joinAuthority, attachConnect } = require('../../src/authority')
const createDNS = require('../../src/createDNS')


function sanitizeName (name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function descriptorPath (dir) {
  return path.join(dir, 'descriptor.json')
}

function identitySeedPath (dir) {
  return path.join(dir, 'identity-secret.json')
}

function loadDescriptor (dir) {
  const file = descriptorPath(dir)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function saveDescriptor (dir, descriptor) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(descriptorPath(dir), JSON.stringify(descriptor, null, 2))
}

// This identity's own seed - NEVER written into descriptor.json, which is
// meant to be shared (printed, sent to someone else, used with "join").
// Without persisting and reusing this, every "resumed" session would
// silently be a brand new, unrecognized identity - not actually the
// original owner (or the original joining member) at all, since
// `new Hypergraph(store)` with no seed generates a fresh random one every
// time rather than deriving anything from the store's own on-disk state.
//
// Passing just { seed } to Hypergraph is NOT enough on its own: seed only
// recovers the higher-level identity concept (keet-identity-key, meant for
// mnemonic-based multi-device recovery) - graph.key (what actually
// determines this device's own userCore/authorship identity, and what a
// RoleBase registry actually checks permissions against) comes from
// deviceKeyPair, which defaults to a fresh random keypair regardless of
// seed unless passed explicitly. hypercoreCrypto.keyPair(seed) derives a
// keypair deterministically, so persisting one seed and deriving both from
// it keeps everything stable across restarts.
function loadOrCreateIdentitySeed (dir) {
  const file = identitySeedPath(dir)
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Buffer.from(saved.seed, 'hex')
  }
  const seed = hypercoreCrypto.randomBytes(32)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ seed: seed.toString('hex') }, null, 2))
  return seed
}

function graphOptsForSeed (seed) {
  return { seed, deviceKeyPair: hypercoreCrypto.keyPair(seed) }
}

/**
 * Manages the shell's single "current authority" for the lifetime of one
 * shell process - create/resume one, join one, publish/resolve against it,
 * connect it, and shut it down cleanly on exit. Every authority the shell
 * creates or joins is saved under `.hyperdns/<name>/` (Corestore data plus
 * the descriptor needed to reopen it), so relaunching the shell and running
 * `create <name>` or `join` again for the same authority resumes it rather
 * than starting over.
 */
function createSession (opts = {}) {
  const baseDir = opts.baseDir || path.join(process.cwd(), '.hyperdns')
  let current = null

  function requireCurrent () {
    if (!current) throw new Error('no authority loaded - use "create <name>" or "join <path-to-descriptor.json>" first')
    return current
  }

  async function closeCurrent () {
    if (!current) return
    if (current.network) {
      try { await current.network.disconnect() } catch { /* best-effort */ }
      try { await current.network.destroy() } catch { /* best-effort */ }
    }
    try { await current.graph.close() } catch { /* best-effort */ }
    try { await current.store.close() } catch { /* best-effort */ }
    current = null
  }

  async function create (name, opts = {}) {
    await closeCurrent()

    const dir = path.join(baseDir, sanitizeName(name))
    const store = new Corestore(path.join(dir, 'store'))
    const seed = loadOrCreateIdentitySeed(dir)
    const existing = loadDescriptor(dir)

    if (existing) {
      // Resuming an authority this same shell already created: same store,
      // same identity, same RoleBase/context - reopen rather than
      // recreating, since createAuthority() always bootstraps fresh state.
      const graph = new Hypergraph(store, graphOptsForSeed(seed))
      await graph.ready()
      await graph.openRoleBase(existing.roleBaseKey)
      const contextKey = existing.contexts[0].key
      await graph.openContext(contextKey, opts.contextOpts || { writeMode: 'open' })

      const dns = createDNS({ graph, context: contextKey })
      current = attachConnect(
        { graph, store, context: contextKey, dns, network: null, descriptor: existing },
        { role: 'owner', name }
      )
      current.name = name
      current.dir = dir
      current.resumed = true
      return current
    }

    const result = await createAuthority(name, { store, contextOpts: opts.contextOpts, graphOpts: graphOptsForSeed(seed) })
    saveDescriptor(dir, result.descriptor)
    current = { ...result, store, name, dir, resumed: false }
    return current
  }

  async function join (descriptorArg) {
    await closeCurrent()

    let descriptor
    if (fs.existsSync(descriptorArg)) {
      descriptor = JSON.parse(fs.readFileSync(descriptorArg, 'utf8'))
    } else {
      descriptor = JSON.parse(descriptorArg)
    }

    const name = descriptor.authority
    const dir = path.join(baseDir, sanitizeName(name))
    const store = new Corestore(path.join(dir, 'store'))
    const seed = loadOrCreateIdentitySeed(dir)

    const result = await joinAuthority(descriptor, { store, graphOpts: graphOptsForSeed(seed) })
    saveDescriptor(dir, result.descriptor)
    current = { ...result, store, name, dir, resumed: false }
    return current
  }

  async function connect (networkOpts) {
    const session = requireCurrent()
    if (session.network) return session.network
    return session.connect(networkOpts)
  }

  function get () {
    return current
  }

  function promptLabel () {
    if (!current) return 'hyperdns'
    const connected = current.network ? 'online' : 'offline'
    return `hyperdns:${current.name} (${connected})`
  }

  async function shutdown () {
    await closeCurrent()
  }

  return { create, join, connect, get, requireCurrent, promptLabel, shutdown }
}

module.exports = { createSession }

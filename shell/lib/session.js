const path = require('path')
const { Hypergraph } = require('hypergraph/next')
const { createAuthority, joinAuthority, findAuthority } = require('../../src/authority')
const createDNS = require('../../src/createDNS')

// Catches the most common real mistake: passing a path (or anything with
// slashes/whitespace) where a short, human-chosen name was expected.
function validateAuthorityName (name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('authority name is required')
  }
  if (/[/\\@]/.test(name) || /\s/.test(name)) {
    throw new Error(
      `"${name}" doesn't look like an authority name - it looks like a path or an address. ` +
      'create takes a short, human-chosen name (e.g. "bobsDNS"). ' +
      'To join an existing authority, use "join <link>" instead.'
    )
  }
}

/**
 * The shell's one hypergraph instance (identity and every authority it
 * created or joined, under `.hyperdns/hg/`) and its "current" authority.
 * Relaunching and running `create <name>` or `use <name>` again picks up
 * the same authority: the instance keeps identity and spaces on disk.
 * `opts.hgOpts`: passed to Hypergraph.open (tests: a local DHT).
 */
function createSession (opts = {}) {
  const baseDir = opts.baseDir || path.join(process.cwd(), '.hyperdns')
  let hg = null
  let current = null
  let online = false

  async function instance () {
    if (!hg) hg = await Hypergraph.open(path.join(baseDir, 'hg'), opts.hgOpts || {})
    return hg
  }

  function requireCurrent () {
    if (!current) throw new Error('no authority loaded - use "create <name>", "join <link>" or "use <name>" first')
    return current
  }

  function select (space, resumed) {
    current = { name: space.name, space, dns: createDNS({ space }), hg, dir: baseDir, resumed, private: space.private, link: space.isPublic ? space.publicLink() : null }
    return current
  }

  async function ownedNamed (name) {
    for (const s of (await instance()).spaces()) {
      if (!s.parent && s.own && s.name === name) {
        const space = hg.space(s.key)
        await space.ready()
        return space
      }
    }
    return null
  }

  async function create (name, { private: priv = false } = {}) {
    validateAuthorityName(name)
    const existing = await ownedNamed(name)
    if (existing) return select(existing, true)
    const { space } = await createAuthority(name, { hg: await instance(), private: priv })
    return select(space, false)
  }

  async function join (link) {
    if (!link || !link.startsWith('hg:')) throw new Error('join expects a link (hg:...) - ask the authority\'s owner for theirs ("link" or "invite")')
    const { space } = await joinAuthority(link, { hg: await instance() })
    return select(space, false)
  }

  async function use (name) {
    return select(await findAuthority(await instance(), name), true)
  }

  async function connect () {
    const h = await instance()
    if (h.suspended) await h.resume()
    await h.connectToSwarm()
    online = true
  }

  async function disconnect () {
    if (!hg) return
    await hg.suspend()
    online = false
  }

  function get () {
    return current
  }

  function isOnline () {
    return online
  }

  function promptLabel () {
    if (!current) return 'hyperdns'
    return `hyperdns:${current.name} (${online ? 'online' : 'offline'})`
  }

  async function shutdown () {
    current = null
    online = false
    if (hg) await hg.close()
    hg = null
  }

  return { create, join, use, connect, disconnect, instance, get, isOnline, requireCurrent, promptLabel, shutdown }
}

module.exports = { createSession }

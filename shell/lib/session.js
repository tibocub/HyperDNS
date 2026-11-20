const path = require('path')
const { Hypergraph } = require('hypergraph/next')
const { createAuthority, joinAuthority, findAuthority } = require('../../src/authority')
const createDNS = require('../../src/createDNS')

/**
 * @typedef {import('../../src/schema').Space} Space
 * @typedef {ReturnType<typeof createSession>} Session
 */

/**
 * The authority the shell works on.
 * @typedef {object} Current
 * @property {string} name
 * @property {Space} space
 * @property {import('../../src/HyperDNS')} dns
 * @property {Hypergraph} hg
 * @property {string} dir - the shell's data folder
 * @property {boolean} resumed - created or joined before, not by this command
 * @property {boolean} private
 * @property {string | null} link - its public link, null if it isn't public
 */

/** @param {string} name */
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
 * The shell's one hypergraph instance (identity and every authority, under
 * `<baseDir>/hg/`) and its current authority.
 *
 * @param {object} [opts]
 * @param {string} [opts.baseDir] - default `./.hyperdns`
 * @param {import('hypergraph/next').OpenOptions} [opts.hgOpts] - passed to Hypergraph.open (tests: a local DHT)
 */
function createSession (opts = {}) {
  const baseDir = opts.baseDir || path.join(process.cwd(), '.hyperdns')
  /** @type {Hypergraph | null} */
  let hg = null
  /** @type {Current | null} */
  let current = null
  let online = false

  /** @returns {Promise<Hypergraph>} */
  async function instance () {
    if (!hg) hg = await Hypergraph.open(path.join(baseDir, 'hg'), opts.hgOpts || {})
    return hg
  }

  function requireCurrent () {
    if (!current) throw new Error('no authority loaded - use "create <name>", "join <link>" or "use <name>" first')
    return current
  }

  /**
   * @param {Space} space
   * @param {boolean} resumed
   */
  function select (space, resumed) {
    current = { name: space.name, space, dns: createDNS({ space }), hg: /** @type {Hypergraph} */ (hg), dir: baseDir, resumed, private: space.private, link: space.isPublic ? space.publicLink() : null }
    return current
  }

  /** @param {string} name */
  async function ownedNamed (name) {
    const h = await instance()
    for (const s of h.spaces()) {
      if (!s.parent && s.own && s.name === name) {
        const space = h.space(s.key)
        await space.ready()
        return space
      }
    }
    return null
  }

  /**
   * @param {string} name
   * @param {{ private?: boolean }} [opts]
   */
  async function create (name, { private: priv = false } = {}) {
    validateAuthorityName(name)
    const existing = await ownedNamed(name)
    if (existing) return select(existing, true)
    const { space } = await createAuthority(name, { hg: await instance(), private: priv })
    return select(space, false)
  }

  /** @param {string} link */
  async function join (link) {
    if (!link || !link.startsWith('hg:')) throw new Error('join expects a link (hg:...) - ask the authority\'s owner for theirs ("link" or "invite")')
    const { space } = await joinAuthority(link, { hg: await instance() })
    return select(space, false)
  }

  /** @param {string} name */
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

  /** @returns {Current | null} */
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

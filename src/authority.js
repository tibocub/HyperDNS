const createDNS = require('./createDNS')
const { TYPES, RECORD_TYPE } = require('./schema')

const LINK_PREFIX = 'hg:'

function dnsError (code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

// Whether a held, open space is a HyperDNS authority (has the record type).
function isAuthority (space) {
  try { return !!space.types()[RECORD_TYPE] } catch { return false }
}

/**
 * Creates an authority: a new space of `opts.hg` holding DNS records, owned
 * by `hg`'s identity. Public by default: anyone with `link` reads it; only
 * roles with dns.publish publish.
 *
 * @param {string} name - human label, not unique
 * @param {Object} opts
 * @param {Object} opts.hg - the caller's `hypergraph/next` instance
 * @param {boolean} [opts.private=false] - a private space instead: sealed
 *   records, members let in by `space.createInvite()`, `link` null
 * @returns {Promise<{ space: Object, dns: HyperDNS, link: string|null }>}
 */
async function createAuthority (name, opts = {}) {
  if (!name || typeof name !== 'string') throw new Error('name is required')
  if (!opts.hg) throw new Error('opts.hg is required')

  const space = await opts.hg.createSpace({ name, private: !!opts.private, types: TYPES })
  if (!opts.private) await space.makePublic()
  return { space, dns: createDNS({ space }), link: opts.private ? null : space.publicLink() }
}

/**
 * Joins an authority by its public link (writes nothing; publishing still
 * needs dns.publish) or an invite link. A link to an authority already held
 * reuses it.
 *
 * @param {string} link - `hg:...`
 * @param {Object} opts
 * @param {Object} opts.hg - the caller's `hypergraph/next` instance
 * @param {number} [opts.timeout] - ms, passed to `hg.redeemInvite`
 * @returns {Promise<{ space: Object, dns: HyperDNS }>}
 * @throws {Error} hypergraph's (`INVITE_INVALID`, `INVITE_USED_UP`...)
 */
async function joinAuthority (link, opts = {}) {
  if (!link || typeof link !== 'string') throw new Error('link is required')
  if (!opts.hg) throw new Error('opts.hg is required')
  const space = heldByLink(opts.hg, link) || await opts.hg.redeemInvite(link, opts.timeout ? { timeout: opts.timeout } : undefined)
  return { space, dns: createDNS({ space }) }
}

// A public link is the space's key in link form: the held space, or null.
function heldByLink (hg, link) {
  if (!link.startsWith(LINK_PREFIX)) return null
  try { return hg.space(link.slice(LINK_PREFIX.length)) } catch { return null }
}

/**
 * The authority space `authority` names for `hg`: a link (joined if not
 * held yet; left again if it isn't an authority), or the name of a
 * top-level authority `hg` holds.
 *
 * @param {Object} hg
 * @param {string} authority - `hg:...` or a name
 * @param {{ timeout?: number }} [opts] - ms to wait when joining
 * @returns {Promise<Object>} the ready space
 * @throws {Error} with `code` UNKNOWN_AUTHORITY, AMBIGUOUS_AUTHORITY or UNAVAILABLE
 */
async function findAuthority (hg, authority, { timeout } = {}) {
  if (authority.startsWith(LINK_PREFIX)) {
    let space = heldByLink(hg, authority)
    let joined = false
    if (!space) {
      try {
        space = await hg.redeemInvite(authority, { timeout })
        joined = true
      } catch (err) {
        if (err.code !== 'INVITE_INVALID') throw err
        // shortcut: hypergraph has one code for "not public" and "unreachable";
        // tell them apart by message until it has a code of its own.
        if (/isn't public|Not a hypergraph invite link/.test(err.message)) throw dnsError('UNKNOWN_AUTHORITY', `${authority} is not an authority you can read (ask its owner for an invite)`)
        throw dnsError('UNAVAILABLE', `Nobody holding ${authority} is online: try again later`)
      }
    }
    await space.ready()
    if (!isAuthority(space)) {
      if (joined) await hg.leaveSpace(space.key)
      throw dnsError('UNKNOWN_AUTHORITY', `${authority} is not a HyperDNS authority`)
    }
    return space
  }

  const found = []
  for (const s of hg.spaces()) {
    if (s.parent || s.name !== authority) continue
    const space = hg.space(s.key)
    await space.ready()
    if (isAuthority(space)) found.push(space)
  }
  if (found.length > 1) throw dnsError('AMBIGUOUS_AUTHORITY', `${found.length} authorities are named "${authority}": use its link instead`)
  if (!found.length) throw dnsError('UNKNOWN_AUTHORITY', `No authority "${authority}" here: open it once by its link`)
  return found[0]
}

module.exports = { createAuthority, joinAuthority, findAuthority, dnsError, LINK_PREFIX }

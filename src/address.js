const { lookup } = require('./resolve')
const { findAuthority, dnsError } = require('./authority')

const SCHEME_PREFIX = /^hyperdns:\/\//i

/**
 * Parse a HyperDNS address: `[hyperdns://]<name>@<authority>[/<path>]`.
 *
 * - `name@authority` is the only part HyperDNS itself resolves - settled to
 *   match real email convention (mailbox-first, domain-second) and the
 *   already-shipped, tested behavior of this function, over an earlier,
 *   inconsistent "authority@name" convention that had drifted into some
 *   docs but was never actually implemented that way.
 * - `hyperdns://` is an optional, ignorable scheme prefix - useful for a
 *   browser/link context, never required.
 * - `path` (everything after the first `/` following the authority) is
 *   deliberately opaque to HyperDNS: it's returned as-is, never parsed or
 *   given meaning here. It exists for exactly two compatible reasons that
 *   both need it to mean nothing in particular at this layer:
 *     - hypergraph's own entity addressing (`type/author/seq`) can appear
 *       there directly, e.g. resolving "forum" to a graph/context and then
 *       addressing a specific post within it:
 *       `forum@my-dns/post/1a0e0f168ab42de514f92cb95bd640ac599c43af9efbde0a14c81faa16bb0fe8/8`
 *     - an application's own dynamic routing (e.g. HyperBBS listing all of
 *       a forum's posts at `forum@my-dns/posts`) can use it just as
 *       validly, with a completely different structure
 *   HyperDNS resolving `name@authority` to a record, and leaving whatever
 *   comes after it for the record's own value/type (or the consuming app)
 *   to interpret, is what keeps both of those compatible with each other
 *   and with HyperDNS at once - trying to standardize path meaning here
 *   would break whichever of the two didn't match.
 *
 * @param {string} address
 * @returns {{ name: string, dns: string, path: string|null }}
 */
function parseAddress (address) {
  if (!address || typeof address !== 'string') throw new Error('Invalid address format')

  let rest = address.trim()
  rest = rest.replace(SCHEME_PREFIX, '')

  const atIndex = rest.indexOf('@')
  if (atIndex === -1) throw new Error('Invalid address format')

  const name = rest.slice(0, atIndex).trim()
  const afterAt = rest.slice(atIndex + 1)

  // A second '@' anywhere means malformed input (e.g. "a@b@c") - reject
  // outright rather than silently using only the first split.
  if (afterAt.includes('@')) throw new Error('Invalid address format')

  const slashIndex = afterAt.indexOf('/')
  const dnsRaw = slashIndex === -1 ? afterAt : afterAt.slice(0, slashIndex)
  const rawPath = slashIndex === -1 ? null : afterAt.slice(slashIndex + 1).trim()
  const path = rawPath ? rawPath : null

  const dns = dnsRaw.trim()

  if (!name || !dns) throw new Error('Invalid address format')
  // name may not itself contain a path separator or whitespace - only the
  // trailing path can. Matches the same constraint already enforced on
  // authority names in the shell (shell/lib/session.js). dns can never
  // contain a '/' by construction (one always ends it, starting the path),
  // but whitespace inside it (e.g. "forum@my dns") is still rejected.
  if (/[/\s]/.test(name)) throw new Error('Invalid address format')
  if (/\s/.test(dns)) throw new Error('Invalid address format')

  return { name, dns, path }
}

/**
 * Resolves a full HyperDNS address with the caller's hypergraph instance
 * (`opts.hg`, a `hypergraph/next` instance). The authority is a link
 * (`blog@hg:…`: joined read-only if not held yet) or the name of an
 * authority `hg` holds. Only `name@authority` is resolved; `path` is
 * returned as-is (see parseAddress() above for why).
 *
 * Errors carry a `code`: UNKNOWN_AUTHORITY, AMBIGUOUS_AUTHORITY,
 * UNKNOWN_NAME, UNAVAILABLE (nobody online holds what is needed).
 *
 * @param {string} address
 * @param {Object} opts
 * @param {Object} opts.hg
 * @param {number} [opts.timeout=10000] - ms to wait for the authority's
 *   holders (joining, records known but not arrived yet)
 * @returns {Promise<{ records: Array, path: string|null, authority: string }>}
 *   `authority`: the space key of the authority that answered
 */
async function resolveAddress (address, opts = {}) {
  const { name, dns, path } = parseAddress(address)
  if (!opts.hg) throw new Error('hg is required')
  const timeout = opts.timeout || 10000

  const space = await findAuthority(opts.hg, dns, { timeout })
  const { records, complete } = await lookup(name, { space, timeout })
  if (!records.length) {
    if (complete) throw dnsError('UNKNOWN_NAME', `No name "${name}" in ${dns}`)
    throw dnsError('UNAVAILABLE', `"${name}" may be in ${dns}, but nobody who has it is online: try again later`)
  }
  return { records, path, authority: space.key }
}

module.exports = {
  parseAddress,
  resolveAddress
}

const resolve = require('./resolve')

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
 * Resolve a full HyperDNS address. Only the `name@authority` part is ever
 * resolved here - `path`, if present, is returned alongside the records
 * as-is, for the caller to interpret (see parseAddress() above for why).
 *
 * @param {string} address
 * @param {Object} opts
 * @param {Function} opts.getAuthorityClient - `(authorityName) => client`,
 *   where client is either a HyperDNS instance (has `.resolve()`) or a
 *   plain `{ graph, context, trustedModerators? }`
 * @returns {Promise<{ records: Array, path: string|null }>}
 */
async function resolveAddress (address, opts = {}) {
  const { name, dns, path } = parseAddress(address)

  if (!opts.getAuthorityClient) throw new Error('getAuthorityClient is required')

  const client = await opts.getAuthorityClient(dns)

  let records
  if (client && typeof client.resolve === 'function') {
    records = await client.resolve(name)
  } else if (client && client.graph && client.context) {
    records = await resolve(name, {
      graph: client.graph,
      context: client.context,
      trustedModerators: client.trustedModerators || []
    })
  } else {
    throw new Error('Invalid authority client')
  }

  return { records, path }
}

module.exports = {
  parseAddress,
  resolveAddress
}

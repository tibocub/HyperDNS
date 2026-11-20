const { lookup } = require('./resolve')
const { findAuthority, dnsError } = require('./authority')

const SCHEME_PREFIX = /^hyperdns:\/\//i

/**
 * Parses `[hyperdns://]<name>@<authority>[/<path>]`.
 *
 * `path` is returned unparsed: hypergraph entity ids and apps' own routes
 * both live there, so HyperDNS must not give it a meaning (docs/ADDRESSING.md).
 *
 * @param {string} address
 * @returns {{ name: string, dns: string, path: string|null }} `dns` is the authority part
 * @throws {Error} `Invalid address format`
 */
function parseAddress (address) {
  if (!address || typeof address !== 'string') throw new Error('Invalid address format')

  let rest = address.trim()
  rest = rest.replace(SCHEME_PREFIX, '')

  const atIndex = rest.indexOf('@')
  if (atIndex === -1) throw new Error('Invalid address format')

  const name = rest.slice(0, atIndex).trim()
  const afterAt = rest.slice(atIndex + 1)

  if (afterAt.includes('@')) throw new Error('Invalid address format')

  const slashIndex = afterAt.indexOf('/')
  const dnsRaw = slashIndex === -1 ? afterAt : afterAt.slice(0, slashIndex)
  const rawPath = slashIndex === -1 ? null : afterAt.slice(slashIndex + 1).trim()
  const path = rawPath ? rawPath : null

  const dns = dnsRaw.trim()

  if (!name || !dns) throw new Error('Invalid address format')
  if (/[/\s]/.test(name)) throw new Error('Invalid address format')
  if (/\s/.test(dns)) throw new Error('Invalid address format')

  return { name, dns, path }
}

/**
 * Resolves a full address. The authority is a link (`blog@hg:...`, joined
 * read-only if `hg` doesn't hold it yet) or the name of an authority `hg`
 * holds. `path` is returned unparsed.
 *
 * @param {string} address
 * @param {object} opts
 * @param {import('./schema').Hypergraph} opts.hg - the caller's `hypergraph/next` instance
 * @param {number} [opts.timeout=10000] - ms to wait for the authority's
 *   holders (joining, records known but not arrived yet); 0: don't wait
 * @returns {Promise<{ records: import('./schema').DnsRecord[], path: string|null, authority: string }>}
 *   `authority`: the key of the space that answered
 * @throws {Error} with `code` UNKNOWN_AUTHORITY, AMBIGUOUS_AUTHORITY,
 *   UNKNOWN_NAME or UNAVAILABLE (nobody online holds what is needed)
 */
async function resolveAddress (address, opts = /** @type {{ hg: import('./schema').Hypergraph, timeout?: number }} */ ({})) {
  const { name, dns, path } = parseAddress(address)
  if (!opts.hg) throw new Error('hg is required')
  const timeout = opts.timeout ?? 10000

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

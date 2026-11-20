const { RECORD_TYPE } = require('./schema')

const PAGE = 100

/**
 * @typedef {import('./schema').Space} Space
 * @typedef {import('./schema').DnsRecord} DnsRecord
 * @typedef {{ space: Space, timeout?: number }} ResolveOptions `timeout`: ms to wait while incomplete; none: answer at once
 */

/**
 * Every record named `name` in `opts.space`, and whether the answer is
 * complete (`false`: a record known to exist hasn't arrived yet).
 *
 * @param {string} name
 * @param {ResolveOptions} opts
 * @returns {Promise<{ records: DnsRecord[], complete: boolean }>}
 *   deduplicated by type and value, sorted by type then value
 */
async function lookup (name, opts = /** @type {ResolveOptions} */ ({})) {
  if (!name || typeof name !== 'string') throw new Error('name is required')
  if (!opts.space) throw new Error('opts.space is required')

  const query = { ...(opts.timeout ? { timeout: opts.timeout } : {}) }
  /** @type {DnsRecord[]} */
  const records = []
  const seen = new Set()
  let complete = true
  for (let after = null; ;) {
    /** @type {Awaited<ReturnType<ReturnType<Space['query']>['latest']>>} */
    const page = await opts.space.query(RECORD_TYPE).where({ name }).latest(PAGE, after ? { ...query, after } : query)
    complete = complete && page.complete
    for (const r of page.items) {
      if (r.name !== name) continue
      const key = `${r.kind}:${r.value}`
      if (seen.has(key)) continue
      seen.add(key)
      // the fields TYPES declares, checked by hypergraph on put
      const out = /** @type {DnsRecord} */ ({ type: r.kind, value: r.value })
      if (r.ttl !== null && r.ttl !== undefined) out.ttl = /** @type {number} */ (r.ttl)
      records.push(out)
    }
    if (page.items.length < PAGE) break
    after = page.items[page.items.length - 1]
  }

  // every peer must give the same answer whatever order records arrived in
  records.sort((a, b) => a.type.localeCompare(b.type) || a.value.localeCompare(b.value))
  return { records, complete }
}

/**
 * Resolves `name` within the one space given: never joins or reads any
 * other (constitution I). Publish rights and moderation are the space's,
 * applied by hypergraph.
 *
 * @param {string} name
 * @param {ResolveOptions} opts - see lookup()
 * @returns {Promise<DnsRecord[]>}
 */
async function resolve (name, opts = /** @type {ResolveOptions} */ ({})) {
  return (await lookup(name, opts)).records
}

module.exports = resolve
module.exports.lookup = lookup

const { RECORD_TYPE } = require('./schema')

const PAGE = 100

// Every record named `name` in `space`, with whether the answer is complete
// (`complete: false`: a record known to exist hasn't arrived yet).
// `timeout` (ms) waits up to that while incomplete; none: answers at once.
async function lookup (name, opts = {}) {
  if (!name || typeof name !== 'string') throw new Error('name is required')
  if (!opts.space) throw new Error('opts.space is required')

  const query = { ...(opts.timeout ? { timeout: opts.timeout } : {}) }
  const records = []
  const seen = new Set()
  let complete = true
  for (let after = null; ;) {
    const page = await opts.space.query(RECORD_TYPE).where({ name }).latest(PAGE, after ? { ...query, after } : query)
    complete = complete && page.complete
    for (const r of page.items) {
      if (r.name !== name) continue
      const key = `${r.kind}:${r.value}`
      if (seen.has(key)) continue
      seen.add(key)
      const out = { type: r.kind, value: r.value }
      if (r.ttl !== null && r.ttl !== undefined) out.ttl = r.ttl
      records.push(out)
    }
    if (page.items.length < PAGE) break
    after = page.items[page.items.length - 1]
  }

  // Deterministic output, whatever order records arrived or were written in
  records.sort((a, b) => a.type.localeCompare(b.type) || a.value.localeCompare(b.value))
  return { records, complete }
}

// Resolves `name` within the one authority space the caller gives: never
// joins or reaches any other (constitution I). Who may publish and what
// moderators took down are the space's own rules, applied by hypergraph.
async function resolve (name, opts = {}) {
  return (await lookup(name, opts)).records
}

module.exports = resolve
module.exports.lookup = lookup

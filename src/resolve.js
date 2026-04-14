async function resolve (name, opts = {}) {
  if (!name || typeof name !== 'string') throw new Error('name is required')
  if (!opts.graph) throw new Error('opts.graph is required')
  if (!opts.context) throw new Error('opts.context is required')

  const graph = opts.graph
  const context = opts.context
  const trustedModerators = Array.isArray(opts.trustedModerators) ? opts.trustedModerators : []
  const authors = Array.isArray(opts.authors) ? opts.authors : null

  const parseJsonBody = (content) => {
    if (!content) return null
    if (content.contentType !== 'application/json') return null
    if (typeof content.body !== 'string') return null
    try {
      return JSON.parse(content.body)
    } catch {
      return null
    }
  }

  // Caller is responsible for ensuring the graph instance is context-scoped.
  // (Hypergraph iterators aggregate across all opened contexts.)
  await graph.update()

  const tag = `name:${name}`

  const candidateDomains = []

  for await (const node of graph.getByTag(tag, authors ? { authors } : {})) {
    candidateDomains.push(node)
  }

  // Deterministic domain selection: sort by id so output does not depend on iterator order.
  candidateDomains.sort((a, b) => String(a.id).localeCompare(String(b.id)))

  const records = []
  const seen = new Set()

  for (const domainNode of candidateDomains) {
    const domainContent = await graph.getContent(domainNode.id)
    const domainBody = parseJsonBody(domainContent)
    if (!domainBody || domainBody.name !== name) continue

    const edges = []
    for await (const edge of graph.edges(domainNode.id, { direction: 'out', type: 'has_record' })) {
      edges.push(edge)
    }

    // Deterministic traversal
    edges.sort((a, b) => String(a.to).localeCompare(String(b.to)))

    for (const edge of edges) {
      const recordNode = await graph.get(edge.to)
      if (!recordNode) continue

      const recordContent = await graph.getContent(recordNode.id)
      const recordBody = parseJsonBody(recordContent)
      if (!recordBody) continue
      if (recordBody.name !== name) continue
      if (typeof recordBody.type !== 'string' || typeof recordBody.value !== 'string') continue
      if (!recordBody.type.trim() || !recordBody.value.trim()) continue

      if (trustedModerators.length) {
        const events = []
        for await (const ev of graph.queryContext({
          type: 'moderation',
          context,
          target: recordNode.id,
          authors: trustedModerators
        })) {
          events.push(ev)
        }

        if (events.length) {
          events.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          const last = events[0]
          if (last && (last.action === 'content.hide' || last.action === 'content.remove')) continue
        }
      }

      const out = {
        type: recordBody.type,
        value: recordBody.value
      }
      if (recordBody.ttl !== undefined) out.ttl = recordBody.ttl

      const key = `${out.type}:${out.value}`
      if (seen.has(key)) continue
      seen.add(key)
      records.push(out)
    }
  }

  // Deterministic output
  records.sort((a, b) => {
    const t = String(a.type).localeCompare(String(b.type))
    if (t) return t
    return String(a.value).localeCompare(String(b.value))
  })

  return records
}

module.exports = resolve

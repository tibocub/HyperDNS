async function publish (name, record, opts = {}) {
  if (!name || typeof name !== 'string') throw new Error('name is required')
  if (!record || typeof record !== 'object') throw new Error('record is required')
  if (typeof record.type !== 'string' || !record.type.trim()) throw new Error('record.type is required')
  if (typeof record.value !== 'string' || !record.value.trim()) throw new Error('record.value is required')

  if (!opts.graph) throw new Error('opts.graph is required')
  if (!opts.context) throw new Error('opts.context is required')

  const graph = opts.graph
  const context = opts.context

  // NOTE: authorship is NOT set here. `graph.put`/`tag`/`relate` derive the
  // author from the graph instance's own signing identity - there is no way
  // (and should be no way) for a caller to author as anyone else. Records
  // published through this `graph` are always authored by whichever identity
  // that graph instance holds.

  const domain = await graph.put({ type: 'domain' })
  // Deliberately never encrypted: {name} here is entirely redundant with
  // the name:<name> tag below, which can never be encrypted either (tag
  // strings are the context view's own index keys - see docs/ADDRESSING.md
  // and hypergraph's own docs/read-permission.md on what a scope can and
  // can't hide). Encrypting this copy would protect nothing already visible
  // via the tag.
  await graph.putContent(domain.id, JSON.stringify({ name }), 'application/json')
  await graph.tag(domain.id, `name:${name}`, { context })

  const rec = await graph.put({ type: 'record' })
  const body = {
    name,
    type: record.type,
    value: record.value
  }
  if (record.ttl !== undefined) body.ttl = record.ttl
  // opts.scope, when present, is a ScopeBase scope id (see src/authority.js
  // - only set for a private authority). putContent() encrypts the whole
  // body as one unit; resolve() needs no changes to handle this correctly -
  // getContent() already returns { body: null } for a caller without the
  // scope's current key, and resolve()'s existing parseJsonBody() already
  // treats that the same as "no valid record body", silently excluding it.
  await graph.putContent(rec.id, JSON.stringify(body), 'application/json', opts.scope ? { scope: opts.scope } : undefined)

  await graph.relate({
    from: domain.id,
    to: rec.id,
    type: 'has_record',
    context
  })

  const out = {
    name,
    type: record.type,
    value: record.value
  }
  if (record.ttl !== undefined) out.ttl = record.ttl
  return out
}

module.exports = publish

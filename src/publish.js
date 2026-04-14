async function publish (name, record, opts = {}) {
  if (!name || typeof name !== 'string') throw new Error('name is required')
  if (!record || typeof record !== 'object') throw new Error('record is required')
  if (typeof record.type !== 'string' || !record.type.trim()) throw new Error('record.type is required')
  if (typeof record.value !== 'string' || !record.value.trim()) throw new Error('record.value is required')

  if (!opts.graph) throw new Error('opts.graph is required')
  if (!opts.context) throw new Error('opts.context is required')
  if (!opts.author || typeof opts.author !== 'string') throw new Error('opts.author is required')

  const graph = opts.graph
  const context = opts.context
  const author = opts.author

  const domain = await graph.put({ type: 'domain', author })
  await graph.putContent(domain.id, JSON.stringify({ name }), 'application/json')
  await graph.tag(domain.id, `name:${name}`, { author, context })

  const rec = await graph.put({ type: 'record', author })
  const body = {
    name,
    type: record.type,
    value: record.value
  }
  if (record.ttl !== undefined) body.ttl = record.ttl
  await graph.putContent(rec.id, JSON.stringify(body), 'application/json')

  await graph.relate({
    from: domain.id,
    to: rec.id,
    type: 'has_record',
    author,
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

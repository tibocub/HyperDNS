const { RECORD_TYPE } = require('./schema')

// Publishes a record into the authority space `opts.space`. The author is
// always that hypergraph instance's own identity (no author option), and
// only members whose role has dns.publish may: anyone else gets NOT_ALLOWED
// from hypergraph, and every reader ignores such a record anyway.
async function publish (name, record, opts = {}) {
  if (!name || typeof name !== 'string') throw new Error('name is required')
  if (!record || typeof record !== 'object') throw new Error('record is required')
  if (typeof record.type !== 'string' || !record.type.trim()) throw new Error('record.type is required')
  if (typeof record.value !== 'string' || !record.value.trim()) throw new Error('record.value is required')
  if (!opts.space) throw new Error('opts.space is required')

  const put = await opts.space.put(RECORD_TYPE, { name, kind: record.type, value: record.value, ttl: record.ttl })

  const out = { name, type: record.type, value: record.value, id: put.id }
  if (record.ttl !== undefined) out.ttl = record.ttl
  return out
}

module.exports = publish

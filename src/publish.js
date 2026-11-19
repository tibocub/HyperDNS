const { RECORD_TYPE } = require('./schema')

/**
 * Publishes a record into an authority space, signed by the instance's own
 * identity (there is no author option). Only roles with dns.publish may;
 * hypergraph refuses anyone else (`NOT_ALLOWED`).
 *
 * @param {string} name
 * @param {Object} record
 * @param {string} record.type - DNS record type (`A`, `TXT`, `hyper`...), non-blank
 * @param {string} record.value - non-blank
 * @param {number} [record.ttl] - unsigned integer, stored only
 * @param {Object} opts
 * @param {Object} opts.space
 * @returns {Promise<{ name: string, type: string, value: string, ttl?: number, id: string }>}
 */
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

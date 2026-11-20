// An authority's one record type. Hypergraph reserves `type`, so a DNS
// record's type is stored as `kind`.
const RECORD_TYPE = 'hyperdns/record'
const PUBLISH_PERMISSION = 'dns.publish'

/** @type {NonNullable<import('hypergraph/next').OpenOptions['types']>} */
const TYPES = {
  [RECORD_TYPE]: {
    fields: { name: 'string', kind: 'string', value: 'string', ttl: 'uint' },
    index: [['name']],
    put: { permission: PUBLISH_PERMISSION } // owner always; others via a role with it
  }
}

/**
 * @typedef {import('hypergraph/next').Hypergraph} Hypergraph The caller's `hypergraph/next` instance.
 * @typedef {ReturnType<Hypergraph['space']>} Space A `hypergraph/next` space.
 * @typedef {Error & { code: string }} DnsError An error with a HyperDNS or hypergraph `code`.
 */

/**
 * A DNS record as resolve() returns it and publish() takes it.
 * @typedef {object} DnsRecord
 * @property {string} type DNS record type (`A`, `TXT`, `hyper`...)
 * @property {string} value
 * @property {number} [ttl] unsigned integer, stored only
 */

/**
 * What publish() returns: the record, its name, and its hypergraph id (for moderation).
 * @typedef {DnsRecord & { name: string, id: string }} PublishedRecord
 */

module.exports = { RECORD_TYPE, PUBLISH_PERMISSION, TYPES }

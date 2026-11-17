// An authority's one record type. `type` is a field name hypergraph keeps
// for the record itself, so a DNS record's type is stored as `kind`.
const RECORD_TYPE = 'hyperdns/record'
const PUBLISH_PERMISSION = 'dns.publish'

const TYPES = {
  [RECORD_TYPE]: {
    fields: { name: 'string', kind: 'string', value: 'string', ttl: 'uint' },
    index: [['name']],
    put: { permission: PUBLISH_PERMISSION } // owner always; others via a role with it
  }
}

module.exports = { RECORD_TYPE, PUBLISH_PERMISSION, TYPES }

const crypto = require('crypto')

// Deriving a topic from a human-chosen authority name is genuinely
// DNS-specific logic hypergraph has no reason to know about - it's the one
// piece of networking HyperDNS still owns. Everything else (replication,
// writer-request/grant, context discovery) is delegated entirely to
// hypergraph's own graph.connectToSwarm() - see src/authority.js. There is
// no separate control topic/channel anymore: connectToSwarm() multiplexes
// its writer-auth protocol over the same connection as data replication
// (protomux), rather than a second swarm - the same design hypergraph
// itself moved to after finding a dual-swarm split unreliable in practice.
function deriveAuthorityTopic (authority) {
  if (!authority || typeof authority !== 'string') throw new Error('authority must be a non-empty string')

  return crypto
    .createHash('sha256')
    .update('hyperdns:v1:' + authority)
    .digest()
}

module.exports = {
  deriveAuthorityTopic
}

const HyperDNS = require('./HyperDNS')

function createDNS (opts = {}) {
  if (!opts.graph) throw new Error('graph is required')
  if (!opts.context) throw new Error('context is required')

  return new HyperDNS({
    graph: opts.graph,
    context: opts.context,
    author: opts.author || null,
    trustedModerators: opts.trustedModerators || []
  })
}

module.exports = createDNS

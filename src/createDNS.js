const HyperDNS = require('./HyperDNS')

function createDNS (opts = {}) {
  if (!opts.space) throw new Error('space is required')
  return new HyperDNS({ space: opts.space })
}

module.exports = createDNS

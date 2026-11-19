const HyperDNS = require('./HyperDNS')

/**
 * Same as `new HyperDNS({ space })`.
 * @param {{ space: Object }} opts
 * @returns {HyperDNS}
 */
function createDNS (opts = {}) {
  if (!opts.space) throw new Error('space is required')
  return new HyperDNS({ space: opts.space })
}

module.exports = createDNS

const HyperDNS = require('./HyperDNS')

/**
 * Same as `new HyperDNS({ space })`.
 * @param {{ space: import('./schema').Space }} opts
 * @returns {HyperDNS}
 */
function createDNS (opts = /** @type {{ space: import('./schema').Space }} */ ({})) {
  if (!opts.space) throw new Error('space is required')
  return new HyperDNS({ space: opts.space })
}

module.exports = createDNS

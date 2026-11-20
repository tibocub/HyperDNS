const resolve = require('./resolve')
const publish = require('./publish')

/** A handle on one authority space, opened by the caller. */
module.exports = class HyperDNS {
  /**
   * @param {object} opts
   * @param {import('./schema').Space} opts.space - a `hypergraph/next` space; HyperDNS never opens, connects or closes it
   */
  constructor (opts = /** @type {{ space: import('./schema').Space }} */ ({})) {
    if (!opts.space) throw new Error('space is required')
    /** @type {import('./schema').Space} */
    this.space = opts.space
  }

  /**
   * `resolve()` on this space.
   * @param {string} name
   * @param {object} [opts]
   * @param {number} [opts.timeout] - ms to wait for records known but not yet arrived
   * @returns {Promise<import('./schema').DnsRecord[]>}
   */
  async resolve (name, opts = {}) {
    return resolve(name, { ...opts, space: this.space })
  }

  /**
   * `publish()` on this space.
   * @param {string} name
   * @param {import('./schema').DnsRecord} record
   * @param {object} [opts] - none yet
   * @returns {Promise<import('./schema').PublishedRecord>}
   */
  async publish (name, record, opts = {}) {
    return publish(name, record, { ...opts, space: this.space })
  }
}

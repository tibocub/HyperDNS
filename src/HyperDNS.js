const resolve = require('./resolve')
const publish = require('./publish')

/** A handle on one authority space, opened by the caller. */
module.exports = class HyperDNS {
  /**
   * @param {Object} opts
   * @param {Object} opts.space - a `hypergraph/next` space; HyperDNS never opens, connects or closes it
   */
  constructor (opts = {}) {
    if (!opts.space) throw new Error('space is required')
    this.space = opts.space
  }

  /**
   * `resolve()` on this space.
   * @param {string} name
   * @param {Object} [opts]
   * @param {number} [opts.timeout] - ms to wait for records known but not yet arrived
   * @returns {Promise<Array<{ type: string, value: string, ttl?: number }>>}
   */
  async resolve (name, opts = {}) {
    return resolve(name, { ...opts, space: this.space })
  }

  /**
   * `publish()` on this space.
   * @param {string} name
   * @param {{ type: string, value: string, ttl?: number }} record
   * @returns {Promise<{ name: string, type: string, value: string, ttl?: number, id: string }>}
   */
  async publish (name, record, opts = {}) {
    return publish(name, record, { ...opts, space: this.space })
  }
}

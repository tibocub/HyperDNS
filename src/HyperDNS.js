const resolve = require('./resolve')
const publish = require('./publish')

module.exports = class HyperDNS {
  constructor (opts = {}) {
    // One authority space, opened by the caller. HyperDNS never manages a
    // hypergraph instance's lifecycle or networking: a protocol layer only.
    if (!opts.space) throw new Error('space is required')
    this.space = opts.space
  }

  async resolve (name, opts = {}) {
    return resolve(name, { ...opts, space: this.space })
  }

  async publish (name, record, opts = {}) {
    return publish(name, record, { ...opts, space: this.space })
  }
}

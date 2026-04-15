const resolve = require('./resolve')
const publish = require('./publish')

module.exports = class HyperDNS {
  constructor (opts = {}) {
    // NOTE:
    // HyperDNS assumes a SINGLE context-scoped graph instance.
    // It MUST NOT manage graph lifecycle or networking.
    // It is purely a protocol execution layer.
    if (!opts.graph) throw new Error('graph is required')
    if (!opts.context) throw new Error('context is required')

    this.graph = opts.graph
    this.context = opts.context
    this.author = opts.author || null
    this.trustedModerators = Array.isArray(opts.trustedModerators) ? opts.trustedModerators : []
  }

  async resolve (name, opts = {}) {
    return resolve(name, {
      ...opts,
      graph: this.graph,
      context: this.context,
      trustedModerators: this.trustedModerators
    })
  }

  async publish (name, record, opts = {}) {
    const author = opts.author || this.author
    if (!author) throw new Error('author is required')

    return publish(name, record, {
      ...opts,
      graph: this.graph,
      context: this.context,
      author
    })
  }
}

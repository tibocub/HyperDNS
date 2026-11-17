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
    this.trustedModerators = Array.isArray(opts.trustedModerators) ? opts.trustedModerators : []
    // A ScopeBase scope id - only set for a private authority (see
    // src/authority.js). resolve() never needs this passed in: getContent()
    // transparently decrypts (or returns null) based on whether the calling
    // identity already holds a grant, with no scope id required from the
    // caller at read time.
    this.scope = typeof opts.scope === 'string' ? opts.scope : null
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
    return publish(name, record, {
      scope: this.scope,
      ...opts,
      graph: this.graph,
      context: this.context
    })
  }
}

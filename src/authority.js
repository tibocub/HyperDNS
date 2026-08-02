const { Hypergraph } = require('hypergraph')
const createDNS = require('./createDNS')
const { deriveAuthorityTopic } = require('../network/topic')

// The single named context every HyperDNS authority manages. Only relevant
// to graph.connectToSwarm()'s { name: contextKey } contexts option (see
// hypergraph's networking.js) - it never leaves this process, so it has no
// bearing on the wire protocol or on what a joining peer needs to know.
const CONTEXT_LABEL = 'domains'

function attachConnect (result, { role, name }) {
  result.connect = async (networkOpts = {}) => {
    result.network = await result.graph.connectToSwarm(deriveAuthorityTopic(name), {
      role,
      contexts: { [CONTEXT_LABEL]: result.context },
      ...networkOpts
    })
    return result.network
  }
  return result
}

/**
 * Create a new DNS authority: a fresh Hypergraph identity, owning its own
 * RoleBase (with this identity as owner) and a single context that holds
 * every domain claim published into it.
 *
 * This is the bootstrap ceremony every test and example previously wrote by
 * hand - Hypergraph + RoleBase + context + (optionally) network - collapsed
 * into one call. Networking is handled entirely by hypergraph's own
 * graph.connectToSwarm(), never anything HyperDNS-specific: see
 * network/topic.js for why. This means nothing in HyperDNS's own code ever
 * touches a P2P networking library directly - not hyperswarm, not anything
 * else. Swap hypergraph's own transport later, and HyperDNS doesn't change.
 *
 * IMPORTANT: connecting to the network is never done as a side effect of
 * *creating* local state - it's always a separate, explicit step (either
 * `opts.connect: true` for the common "connect immediately" case, or the
 * returned `.connect()` method for anything more deliberate). This matters
 * because graph.connectToSwarm() fully awaits its own connection attempt
 * before returning - if two peers each call createAuthority()/
 * joinAuthority() with `connect: true` one after the other rather than
 * concurrently, the first one's discovery window can fully close (hyperswarm
 * normally finds a peer within a second or two, but only when both sides are
 * actually listening/connecting at the same time) before the second one ever
 * starts trying, and they may not find each other for a long time, if at
 * all. Use the returned `.connect()` method with `Promise.all()` (or
 * similar) whenever both sides are being set up together, in the same
 * process or in a test - see test/brittle/authority.js.
 *
 * @param {string} name - The authority's human-readable name (e.g. "bobsDNS")
 * @param {Object} opts
 * @param {Object} opts.store - A Corestore instance (required - HyperDNS
 *   never constructs its own storage; the caller already needs one for
 *   hypergraph regardless)
 * @param {Object} [opts.graphOpts] - Passed through to `new Hypergraph()`
 * @param {Object} [opts.contextOpts] - Passed through to createContext()/
 *   openContext() - e.g. `{ writeMode: 'closed' }` for an invite-only
 *   authority. Defaults to `{ writeMode: 'open' }`.
 * @param {boolean} [opts.connect=false] - Connect to the network immediately,
 *   awaiting it before returning. Off by default - this never happens as a
 *   surprising side effect of calling createAuthority(). Prefer calling the
 *   returned `.connect()` yourself if anything else is also connecting
 *   around the same time (see above).
 * @param {Object} [opts.networkOpts] - Passed through to connectToSwarm()
 *   (e.g. `{ swarm }` to reuse an existing Hyperswarm instance)
 * @param {string[]} [opts.trustedModerators] - Passed through to createDNS()
 * @returns {Promise<{
 *   graph: Object, context: string, roleBase: Object, dns: Object,
 *   network: Object|null, descriptor: Object, connect: Function
 * }>} `descriptor` is a plain, JSON-serializable object - share it (however
 *   you like: print it, send it to a friend, embed it in a "hyper://"
 *   address) so others can joinAuthority() into the same authority.
 *   `connect(networkOpts?)` connects to the network (idempotently settable
 *   whenever you're ready) and also sets `.network` on this same object.
 */
async function createAuthority (name, opts = {}) {
  if (!name || typeof name !== 'string') throw new Error('name is required')
  if (!opts.store) throw new Error('opts.store is required')

  const contextOpts = opts.contextOpts || { writeMode: 'open' }

  const graph = new Hypergraph(opts.store, opts.graphOpts || {})
  await graph.ready()

  const owner = graph.key.toString('hex')

  await graph.createRoleBase()
  await graph.roleBase.init(owner)

  const contextKey = await graph.createContext(contextOpts)
  await graph.openContext(contextKey, contextOpts)

  // export() covers userCoreKey + contexts; it doesn't know about RoleBase
  // or the authority's name, so those are added directly onto the same
  // descriptor object rather than nested - joinAuthority() (via
  // Hypergraph.join()) only ever reads the fields it recognizes, so this
  // round-trips cleanly either way.
  const descriptor = {
    ...(await graph.export()),
    authority: name,
    roleBaseKey: graph.roleBase.key.toString('hex')
  }

  const dns = createDNS({ graph, context: contextKey, trustedModerators: opts.trustedModerators || [] })

  const result = attachConnect(
    { graph, context: contextKey, roleBase: graph.roleBase, dns, network: null, descriptor },
    { role: 'owner', name }
  )

  if (opts.connect) await result.connect(opts.networkOpts || {})

  return result
}

/**
 * Join an existing DNS authority from a descriptor produced by
 * createAuthority() (or by another peer's own createAuthority()/
 * joinAuthority() call - the descriptor is authority-wide, not tied to
 * whoever first created it).
 *
 * See createAuthority() above for why connecting is always a separate,
 * explicit step from joining locally - the same reasoning applies here.
 *
 * @param {Object} descriptor - A descriptor from createAuthority()/
 *   joinAuthority()
 * @param {Object} opts
 * @param {Object} opts.store - A Corestore instance (required)
 * @param {Object} [opts.graphOpts] - Passed through to `new Hypergraph()`
 * @param {boolean} [opts.connect=false] - Connect to the network immediately,
 *   awaiting it before returning. Prefer the returned `.connect()` if
 *   anything else is also connecting around the same time.
 * @param {Object} [opts.networkOpts] - Passed through to connectToSwarm()
 * @param {string[]} [opts.trustedModerators] - Passed through to createDNS()
 * @returns {Promise<{graph: Object, context: string, dns: Object, network: Object|null, descriptor: Object, connect: Function}>}
 */
async function joinAuthority (descriptor, opts = {}) {
  if (!descriptor || typeof descriptor !== 'object') throw new Error('descriptor is required')
  if (!descriptor.authority || typeof descriptor.authority !== 'string') throw new Error('descriptor.authority is required')
  if (!descriptor.roleBaseKey) throw new Error('descriptor.roleBaseKey is required')
  if (!Array.isArray(descriptor.contexts) || descriptor.contexts.length === 0) throw new Error('descriptor has no contexts to join')
  if (!opts.store) throw new Error('opts.store is required')

  const graph = await Hypergraph.join(opts.store, descriptor, opts.graphOpts || {})

  // Hypergraph.join() only reopens contexts - the RoleBase and the
  // publishing author's own UserCore (needed to read the content behind
  // any domain/record entity, not just the tags/edges pointing at it) are
  // HyperDNS-descriptor-specific and need opening explicitly.
  await graph.openRoleBase(descriptor.roleBaseKey)
  await graph.openUserCore(descriptor.userCoreKey)

  const contextKey = descriptor.contexts[0].key

  const dns = createDNS({ graph, context: contextKey, trustedModerators: opts.trustedModerators || [] })

  const result = attachConnect(
    { graph, context: contextKey, dns, network: null, descriptor },
    { role: 'peer', name: descriptor.authority }
  )

  if (opts.connect) await result.connect(opts.networkOpts || {})

  return result
}

module.exports = { createAuthority, joinAuthority, attachConnect, CONTEXT_LABEL }

const { Hypergraph } = require('hypergraph')
const hypercoreCrypto = require('hypercore-crypto')
const createDNS = require('./createDNS')
const { deriveAuthorityTopic } = require('../network/topic')

// The single named context every HyperDNS authority manages. Only relevant
// to graph.connectToSwarm()'s { name: contextKey } contexts option (see
// hypergraph's networking.js) - it never leaves this process, so it has no
// bearing on the wire protocol or on what a joining peer needs to know.
const CONTEXT_LABEL = 'domains'

// The single ScopeBase scope every private authority encrypts its records
// under. See docs/PRIVACY.md for why one scope is enough for now (a single
// symmetric key, rotated wholesale on membership change - the same
// deliberately simple design ScopeBase itself uses, not something HyperDNS
// invents on top of it).
const RECORDS_SCOPE_ID = 'records'

function attachConnect (result, { role, topic }) {
  result.connect = async (networkOpts = {}) => {
    result.network = await result.graph.connectToSwarm(topic, {
      role,
      contexts: { [CONTEXT_LABEL]: result.context },
      ...networkOpts
    })
    return result.network
  }
  return result
}

// Attaches a grantAccess() method for a private authority's owner (or
// anyone else who holds scope.grant) to give a specific, already-identified
// peer the ability to decrypt records. Deliberately requires both of the
// recipient's public keys up front, exchanged out-of-band by the caller -
// there is no invite-code flow yet (see docs/PRIVACY.md's "Known
// limitation" section for why, and what would replace this).
function attachGrantAccess (result, scopeId) {
  result.grantAccess = async (recipientPubkeyHex, recipientEncryptionPublicKeyHex) => {
    if (!recipientPubkeyHex) throw new Error('recipientPubkeyHex is required')
    if (!recipientEncryptionPublicKeyHex) throw new Error('recipientEncryptionPublicKeyHex is required')
    const recipientEncryptionPublicKey = Buffer.isBuffer(recipientEncryptionPublicKeyHex)
      ? recipientEncryptionPublicKeyHex
      : Buffer.from(recipientEncryptionPublicKeyHex, 'hex')
    return result.graph.scopeBase.grantKey(scopeId, recipientPubkeyHex, recipientEncryptionPublicKey)
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
 * @param {boolean} [opts.private=false] - See docs/PRIVACY.md. Two
 *   independent protections, not one: (1) the network topic is randomly
 *   generated instead of derived from `name`, so the authority cannot be
 *   discovered/connected to by anyone who only knows its name - reaching it
 *   at all requires the descriptor; (2) every published record's content is
 *   automatically encrypted via a ScopeBase scope, so even someone who does
 *   obtain the descriptor (a leak, a careless share) still cannot read
 *   record values without an explicit grantAccess() grant. Record *names*
 *   (and who published them, and when) remain visible to anyone with the
 *   descriptor regardless - see docs/PRIVACY.md for why that's a hard limit,
 *   not an oversight.
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
 *   network: Object|null, descriptor: Object, connect: Function,
 *   grantAccess: Function|undefined
 * }>} `descriptor` is a plain, JSON-serializable object - share it (however
 *   you like: print it, send it to a friend, embed it in a "hyper://"
 *   address) so others can joinAuthority() into the same authority. For a
 *   private authority, sharing it is what actually matters for reachability
 *   (see opts.private above) - treat it accordingly.
 *   `connect(networkOpts?)` connects to the network (idempotently settable
 *   whenever you're ready) and also sets `.network` on this same object.
 *   `grantAccess(pubkeyHex, encryptionPubkeyHex)` is only present for a
 *   private authority - see attachGrantAccess() above.
 */
async function createAuthority (name, opts = {}) {
  if (!name || typeof name !== 'string') throw new Error('name is required')
  if (!opts.store) throw new Error('opts.store is required')

  const isPrivate = !!opts.private
  // An authority's roles live in its RoleBase (moderators, dns.publish), shared
  // with graph.can() — so its context takes roles from the RoleBase too
  // (hypergraph's `roles: 'rolebase'`, a version 2 context). Hypergraph's
  // default since its spec 005 keeps roles inside each context instead.
  const contextOpts = { roles: 'rolebase', ...(opts.contextOpts || { writeMode: 'open' }) }
  const topic = isPrivate ? hypercoreCrypto.randomBytes(32) : deriveAuthorityTopic(name)

  const graph = new Hypergraph(opts.store, opts.graphOpts || {})
  await graph.ready()

  const owner = graph.key.toString('hex')

  await graph.createRoleBase()
  await graph.roleBase.init(owner)

  const contextKey = await graph.createContext(contextOpts)
  await graph.openContext(contextKey, contextOpts)

  let scopeId = null
  if (isPrivate) {
    // The owner role already holds '*' (every permission, including
    // scope.create/scope.grant/scope.revoke) via roleBase.init() above -
    // no separate grant needed here, the same way it doesn't need one for
    // dns.publish either.
    await graph.createScopeBase()
    const created = await graph.scopeBase.createScope(RECORDS_SCOPE_ID)
    scopeId = created.scopeId
  }

  // export() covers userCoreKey + contexts; it doesn't know about RoleBase,
  // ScopeBase, the authority's name, or the network topic, so those are
  // added directly onto the same descriptor object rather than nested -
  // joinAuthority() (via Hypergraph.join()) only ever reads the fields it
  // recognizes, so this round-trips cleanly either way.
  const descriptor = {
    ...(await graph.export()),
    authority: name,
    roleBaseKey: graph.roleBase.key.toString('hex'),
    private: isPrivate,
    topic: topic.toString('hex'),
    ...(isPrivate ? { scopeBaseKey: graph.scopeBase.key.toString('hex'), scopeId } : {})
  }

  const dns = createDNS({ graph, context: contextKey, trustedModerators: opts.trustedModerators || [], scope: scopeId })

  let result = attachConnect(
    { graph, context: contextKey, roleBase: graph.roleBase, dns, network: null, descriptor },
    { role: 'owner', topic }
  )
  if (isPrivate) result = attachGrantAccess(result, scopeId)

  if (opts.connect) await result.connect(opts.networkOpts || {})

  return result
}

/**
 * Join an existing DNS authority from a descriptor produced by
 * createAuthority() (or by another peer's own createAuthority()/
 * joinAuthority() call - the descriptor is authority-wide, not tied to
 * whoever first created it).
 *
 * For a private authority (descriptor.private), the returned dns instance
 * can only decrypt records if this identity has already been granted access
 * via grantAccess() on the owner's side (or another already-granted
 * member's, if they hold scope.grant) - joining alone never grants that,
 * the same way joining alone never grants write access to a closed context.
 * resolve() handles a not-yet-granted read gracefully either way (silently
 * excludes what it can't decrypt, same as any other permission gate here),
 * so there's nothing extra to check before calling it.
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
 * @returns {Promise<{graph: Object, context: string, dns: Object, network: Object|null, descriptor: Object, connect: Function, grantAccess: Function|undefined}>}
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

  const isPrivate = !!descriptor.private
  if (isPrivate && descriptor.scopeBaseKey) {
    // Attaches the SAME ScopeBase the owner created, so this identity can
    // resolve a key once (if ever) granted one. Opening it here does not by
    // itself grant anything - see the doc comment above.
    await graph.openScopeBase(descriptor.scopeBaseKey)
  }

  const contextKey = descriptor.contexts[0].key
  const topic = isPrivate && descriptor.topic
    ? Buffer.from(descriptor.topic, 'hex')
    : deriveAuthorityTopic(descriptor.authority)

  const dns = createDNS({ graph, context: contextKey, trustedModerators: opts.trustedModerators || [], scope: isPrivate ? descriptor.scopeId : null })

  let result = attachConnect(
    { graph, context: contextKey, dns, network: null, descriptor },
    { role: 'peer', topic }
  )
  if (isPrivate && descriptor.scopeId) result = attachGrantAccess(result, descriptor.scopeId)

  if (opts.connect) await result.connect(opts.networkOpts || {})

  return result
}

module.exports = { createAuthority, joinAuthority, attachConnect, attachGrantAccess, CONTEXT_LABEL, RECORDS_SCOPE_ID }

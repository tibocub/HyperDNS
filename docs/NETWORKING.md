# Networking Model (HyperDNS)

This document defines the networking model for HyperDNS.

HyperDNS networking MUST be implemented as a layer outside the protocol (`publish`/`resolve`)
and SDK (`HyperDNS`/`createDNS`). As of the bootstrap layer (`src/authority.js`), that layer is
`createAuthority()`/`joinAuthority()`, and it is built entirely on **hypergraph's own**
`graph.connectToSwarm()` — HyperDNS's own code never touches a P2P networking library
(Hyperswarm or otherwise) directly, not even as a lazy `require()`. This mirrors how hypergraph
itself relates to Hyperswarm: full support for it, zero hard dependency on it (`hyperswarm` is
a devDependency of both projects, used only by the test suite and by whichever app actually
wants networking).

The practical effect: if hypergraph's transport is ever swapped or extended to another P2P
library, HyperDNS does not need to change at all — it only ever calls `graph.connectToSwarm()`.

## Canonical addressing (authority-scoped)

HyperDNS resolution is authority-scoped.

An authority is selected explicitly by the caller. Names and records are resolved within that
authority. The address grammar itself (`name@authority`, plus an optional opaque trailing path)
is settled in **`docs/ADDRESSING.md`** — this doc only needs the fact that a stable `authority`
string exists, since that's what topic derivation below is keyed on.

An earlier draft of this section proposed a different, slash-based scheme
(`hyper://<authority>/<namespace>/<path>`, no `@` at all). It's gone — it would have collided
with hypergraph's own `type/author/seq` entity-addressing shape instead of being able to embed
it directly. See `docs/ADDRESSING.md` for the reasoning.

## Authority discovery

### Deterministic topic derivation (v1)

Authorities are discoverable without a central registry by deterministically deriving a
Hyperswarm topic from the authority name (`network/topic.js`).

- Input: `authority` (string)
- Topic derivation: `topic = sha256("hyperdns:v1:" + authority)`

Requirements:

- The prefix MUST include a version namespace (`v1`) to allow future migrations.
- The topic MUST be derived deterministically and identically by all implementations.

This is the one piece of networking logic HyperDNS still owns — it's genuinely DNS-specific
(mapping a human-chosen name to a topic), and hypergraph has no reason to know about it.
Everything past this point (replication, writer-request/grant, context discovery) is
hypergraph's responsibility via `connectToSwarm()`.

## What `connectToSwarm()` already provides

`graph.connectToSwarm(topic, { role, contexts })` — a single swarm, with the writer-auth
protocol multiplexed over the same connection as data replication via protomux — already
provides, correctly and with test coverage in hypergraph's own suite:

- **Replication**: the entire store (user core, view core, every open context core) over one
  connection per peer.
- **Writer-request / grant**: a `role: 'peer'` connection automatically requests writer status
  for whichever named contexts it declares; a `role: 'owner'` connection evaluates and grants
  or denies those requests according to the context's own `writeMode` and the RoleBase
  registry (enforced at apply time — see hypergraph's `context-base.js`, not just as a
  courtesy on the requesting side).
- **Context announce**: an owner can advertise additional contexts to already-connected peers.

`createAuthority()`/`joinAuthority()` (`src/authority.js`) wire this up with one fixed context
label (`'domains'`, internal — it never appears on the wire or in a descriptor) since a
HyperDNS authority manages exactly one context. An app embedding HyperDNS never constructs a
swarm, a topic, or a writer-request by hand.

## Replication modes

### Mode A: Full join mode (current)

Goal:

- Join an authority and replicate its full registry locally.

Behavior:

- `joinAuthority(descriptor, { connect: true })` derives the authority's topic and calls
  `graph.connectToSwarm()` with `role: 'peer'`.
- The entire authority (RoleBase + context + every author's UserCore content that's been
  opened) replicates over that connection.

Result:

- A local Hypergraph instance can serve `publish`/`resolve` within that authority.

### Mode B: Query mode (future, unchanged in spirit)

Goal:

- Resolve a name within an authority without replicating the entire authority registry.

High-level requirements:

- Connect to the authority topic.
- Fetch only the minimum subset required to answer a query.
- Avoid full replication.

Non-goals (for now):

- Defining the full selective-replication protocol.
- Implementing blind peering.

This remains genuinely future work — nothing about delegating full-join networking to
hypergraph forecloses it, but it isn't designed yet.

## Replication unit

The unit of replication for Mode A is:

- an authority's Corestore + Hypergraph view cores (whatever `connectToSwarm()`'s auto-replicate
  covers — the entire store, not scoped per-context or per-author)

Future work for Mode B will need to define smaller units (e.g. per-domain claims, per-record
content) without changing protocol semantics.

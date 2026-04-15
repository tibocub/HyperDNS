# Networking Model (HyperDNS)

This document defines the Hyperswarm networking model for HyperDNS.

HyperDNS networking MUST be implemented as a layer outside the protocol (`publish`/`resolve`) and SDK (`HyperDNS`/`createDNS`).

## Canonical addressing (authority-scoped)

HyperDNS resolution is authority-scoped.

An authority is selected explicitly by the caller. Names and records are resolved within that authority.

This project assumes an authority-addressed scheme like:

- `hyper://<authority>/<namespace>/<path>`

Examples:

- `hyper://myDNS/my-blog/post/23`

Notes:

- The concrete URL grammar is an application concern (browser/CLI), but the networking model below assumes the existence of a stable `authority` string.

## Authority discovery

### Deterministic topic derivation (v1)

Authorities are discoverable without a central registry by deterministically deriving a Hyperswarm topic from the authority name.

- Input: `authority` (string)
- Topic derivation: `topic = sha256("hyperdns:v1:" + authority)`

Requirements:

- The prefix MUST include a version namespace (`v1`) to allow future migrations.
- The topic MUST be derived deterministically and identically by all implementations.

## Data plane vs control plane

HyperDNS reuses the forum demo’s separation of concerns:

- Data plane: replication (Corestore)
- Control plane: coordination messages (JSON)

### Data plane (replication)

- A data-plane connection exists to replicate cores via `store.replicate(conn)`.
- The data plane MUST NOT carry application-level policy; it carries logs/cores only.

### Control plane (coordination)

- A control-plane connection exists to exchange JSON messages.
- Control messages MUST be treated as hints; the authoritative state remains the replicated Hypergraph logs.

## Replication modes

### Mode A: Full join mode (MVP)

Goal:

- Join an authority and replicate its full registry locally.

Behavior:

- Join the authority’s topic.
- Replicate all cores reachable via Corestore replication.

Result:

- A local Hypergraph instance can serve `publish`/`resolve` within that authority.

### Mode B: Query mode (future)

Goal:

- Resolve a name within an authority without replicating the entire authority registry.

High-level requirements:

- Connect to the authority topic.
- Fetch only the minimum subset required to answer a query.
- Avoid full replication by using an explicit request/response protocol on the control plane.

Non-goals (for now):

- Defining the full selective replication protocol.
- Implementing blind peering.

## Control-plane message types (v1 sketch)

All control messages MUST be JSON objects with a version field.

- `hello`
  - `{ v: 1, type: "hello", authority: <string> }`

- `announce_contexts`
  - `{ v: 1, type: "announce_contexts", contexts: [<contextKeyHex>...] }`

- `announce_policy` (optional)
  - `{ v: 1, type: "announce_policy", trustedModerators: [<pubkeyHex>...], writers: [<pubkeyHex>...] }`

Rules:

- Control messages MUST NOT change `resolve()` semantics directly.
- Policies MUST only take effect when reflected in replicated data or explicitly configured by the local user.

## Replication unit

The unit of replication for Mode A is:

- an authority’s Corestore + Hypergraph view cores

Future work for Mode B will need to define smaller units (e.g. per-domain claims, per-record content) without changing protocol semantics.

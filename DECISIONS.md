# DECISIONS

## 2026-04-14 — Use Hypergraph as-is (no changes)

### Decision

HyperDNS is implemented as a protocol layer on top of Hypergraph without modifying Hypergraph internals.

### Rationale

- Avoid expanding surface area and risk in the shared foundation
- Preserve existing Hypergraph invariants (moderation, indexing, event encoding)
- Keep the mental model simple for contributors and LLMs

### Consequences

- Entity IDs are assigned by Hypergraph (`<type>/<author>/<seq>`)
- Name resolution cannot rely on deterministic entity IDs
- Name lookup is done via content + tag indexes

---

## 2026-04-14 — Path 1 schema: multi-claim naming (names are not unique)

### Decision

A name resolves to a set of domain claims; resolution is a deterministic query + filtering process.

### Rationale

- No global uniqueness assumption is required
- Naturally supports multiple competing claims
- Aligns with moderation/trust-based selection

### Consequences

- Domains store `{ name }` in content (`application/json`)
- Optional tag index `name:<name>` is used for efficient lookup
- Resolver aggregates records across all matching domain claims

---

## 2026-04-14 — Context isolation is enforced by contract

### Decision

`resolve()` does not open contexts. The caller must pass a graph instance that is already scoped to the intended context.

### Rationale

- Hypergraph iterators (`edges`, `getByTag`) aggregate across all opened contexts
- `resolve()` cannot reliably detect or close other open contexts via public API

### Consequences

- Mis-scoped graph instances can cause cross-authority mixing
- Higher-level APIs should construct/own context-scoped graph instances

---

## 2026-04-14 — Record content encoding uses JSON strings

### Decision

`application/json` content is stored as a string (JSON-encoded) and parsed on read.

### Rationale

- Hypergraph event encoding stores `content/append` body as a string

### Consequences

- Writers must use `JSON.stringify()` for JSON content
- Resolver parses JSON only when `contentType === 'application/json'`

---

## 2026-07-26 — Drop the `author` option from `createDNS`/`publish`/`HyperDNS`

### Decision

Callers no longer pass (or are required to pass) an `author` string to `createDNS()`, `HyperDNS#publish()`, or `publish()`. Authorship is entirely the graph instance's own concern.

### Rationale

- Hypergraph derives the author of every write (`put`, `tag`, `relate`) from the graph instance's own signing identity (`graph.identity.deviceKeyPair`); it never reads a caller-supplied author field
- A required `author` option therefore controlled nothing — it could not make a write "authored by" anyone other than the graph's own identity, no matter what string was passed
- Requiring it implied a capability (asserting authorship) that would be a security hole if it actually worked, and was actively misleading since it didn't
- Not accepting an override here is intentional and correct on Hypergraph's side — forgeable authorship would defeat the point of a signed append-only log

### Consequences

- `createDNS({ graph, context })` and `publish(name, record, { graph, context })` no longer require `author`
- Passing `author` is still accepted (silently ignored) for backward compatibility with any external callers, but should not be relied on
- See `test/brittle/author-not-required.js` for the regression coverage, including a test that an impersonated author string has no effect on the signed data

---

## 2026-07-27 — `resolve()` only honors domain claims from authors holding `dns.publish`

### Decision

`resolve()` now uses `graph.can(author, 'dns.publish')` — Hypergraph's own RoleBase permission check — as the primary trust gate for which domain claims are aggregated, instead of merging every replicated claim for a name unconditionally.

### Rationale

- Contexts default to `writeMode: 'open'`, meaning any peer that replicates in can become a writer with no admission control at all — so without a further trust gate, resolution had nothing standing between "anyone who joins the topic" and polluting a name's results
- `graph.can()` is an existing Hypergraph primitive backed by the context's own RoleBase registry; no custom trust logic was written to make this work
- The context owner always has this permission implicitly (`owner` role is granted `*`); an operator wanting open community registration grants `dns.publish` to another role (typically `member`) explicitly
- `relate()` (unlike `tag()`) does not check that the caller owns `from`/`to`, so a writer can attach a `has_record` edge from a domain they don't own to a record they do — the edge's own author needs the same permission check as the domain claim itself, not just the domain node
- This is unrelated to (and does not replace) the existing `trustedModerators` + `queryContext` moderation check, which handles retroactively hiding a *specific* claim from an author who does hold the permission; the new check handles authors who never had standing to claim a name at all

### Consequences

- A domain claim, and the edge attaching a record to it, are now dropped unless `graph.can(domainNode.author, 'dns.publish')` and `graph.can(edge.author, 'dns.publish')` both hold at resolve time
- `resolve(name, { claimPermission })` can override the permission string if an application wants a different convention
- Revoking a role's `dns.publish` permission takes effect on the next `resolve()` call, with no need to touch or hide the underlying claims
- See `test/brittle/resolve-permission-gate.js` for regression coverage, using two real Hypergraph identities and direct Corestore replication (not Hyperswarm) — one test for the permission gate itself, one demonstrating the `relate()` ownership gap is real and that the edge-author check closes it

---

## 2026-07-28 — `resolve()` passes `context` through to `getByTag()`/`edges()`

### Decision

`resolve()` now explicitly passes its `context` argument into both `graph.getByTag()` and `graph.edges()`, instead of relying on hypergraph inferring "the" context from whatever's open on the graph instance.

### Rationale

- Upstream hypergraph fix: `getByTag()`/`edges()` used to silently aggregate across *every* context a graph instance had open, with no way to scope to one. That's now fixed there — a single open context is still used implicitly (unambiguous), but 2+ open contexts require the caller to say which one, or it throws (see hypergraph's `resolveOpenContexts`)
- Before this change, HyperDNS's `resolve()` only ever worked correctly by accident: every existing test only ever opened one context per graph instance. A daemon that's a member of more than one DNS authority at once (one context each, on the same graph instance) would have hit hypergraph's new throw immediately, since `resolve()` never told it which context to use despite already receiving `context` as its own argument
- This isn't just "stop throwing" — `resolve(name, { graph, context: ctxA })` must actually return ctxA's answer even when ctxB (a different authority, with its own possibly-identically-named domain claim) is also open on the same graph instance

### Consequences

- `resolve()` scoped to one authority now works correctly on a graph instance that's simultaneously a member of others, instead of only working when it happens to be the only context open
- See `test/brittle/resolve-multi-context.js`: publishes two different answers for the exact same name into two different contexts on one graph instance, and confirms resolving against each context returns only that context's answer

---

## 2026-07-28 — Fixed `replication-hyperswarm.js`: it was never actually testing replication

### Decision

Rewrote the test so peer B opens the SAME context and RoleBase peer A owns, instead of each creating its own separate ones.

### Rationale

- The test's whole point is proving `HyperswarmNetwork` correctly replicates a real publish from A to a real resolve on B. As originally written, A and B each called `createContext()`/`createRoleBase()` independently — different keys, different registries — so B could never see or trust A's data no matter how well the network layer worked
- The test still always passed, silently, via its own `!connected`/`!ok` soft-pass fallback branches (meant for genuine DHT/NAT failures) — it could not fail even if `HyperswarmNetwork` were completely broken
- Verified the fix is real, not another accidental pass: ran with `HYPERDNS_STRICT_NETWORK_TEST=1` (which removes both soft-pass fallbacks entirely) and it still passes — this is the first version of this test that has actually exercised a real cross-peer publish-then-resolve

### Consequences

- B now: opens A's RoleBase via `openRoleBase(roleA)` (needed for B's own `graph.can()` checks in `resolve()`'s permission gate to see A's actual permissions, not an empty registry B owns itself), opens A's context via the same key, and calls `openUserCore(graphA.key)` to read A's entity content
- This is the only test in the suite that now genuinely proves the network transport layer works end-to-end; everything else either uses direct Corestore stream replication (fast, deterministic, but not exercising `HyperswarmNetwork` itself) or doesn't touch the network at all

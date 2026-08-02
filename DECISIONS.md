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

---

## 2026-07-30 — Retire HyperDNS's own `HyperswarmNetwork`; delegate all networking to hypergraph's `connectToSwarm()`; add `createAuthority()`/`joinAuthority()` bootstrap

### Decision

`network/HyperswarmNetwork.js` is removed. All networking now goes through `graph.connectToSwarm()` (hypergraph's own). A new `src/authority.js` provides `createAuthority()`/`joinAuthority()`, bundling the Hypergraph + RoleBase + context + (optional) network setup every test and example previously did by hand. `corestore`/`hypercore-crypto`/`hyperswarm` moved from `dependencies` to `devDependencies` — none of HyperDNS's own `src/` code ever required them at runtime to begin with (`graph`/`store` are always dependency-injected), so this just makes the manifest honest.

### Rationale

- HyperDNS's own dual-swarm design (a data swarm plus a separate hand-rolled JSON control swarm) is exactly the design hypergraph's own networking layer already tried and moved away from, for reliability reasons. `graph.connectToSwarm()` uses a single swarm with the writer-auth protocol multiplexed over the same connection via protomux, and has no equivalent to the DHT-double-destroy bug class HyperDNS's own version needed a dedicated fix for — the design that caused that bug (two Hyperswarm instances sharing one DHT) doesn't exist here, because there's only ever one swarm
- HyperDNS's own control channel was scaffolding only — wired up (an event emitter, a message parser) but nothing in `src/` ever sent or handled a control message. `connectToSwarm()`'s writer-request/grant flow is complete, tested, and enforced at apply time (not just as a courtesy on the requesting side) in hypergraph's own suite
- Mirrors hypergraph's own relationship to Hyperswarm: full support for it, zero hard dependency on it. HyperDNS's own code doesn't even lazily `require('hyperswarm')` anymore — it only ever calls `graph.connectToSwarm()`, so swapping hypergraph's transport later requires no HyperDNS-side change at all
- `network/topic.js`'s `deriveAuthorityTopic` is kept — deriving a topic from a human-chosen authority name is genuinely DNS-specific logic hypergraph has no reason to know about. `deriveControlTopic` is removed along with the control swarm it existed for

### Consequences

- `createAuthority(name, { store, connect })` / `joinAuthority(descriptor, { store, connect })` are the new primary entry points for anything that needs a full authority, not just a pre-existing `graph`/`context` pair (which `createDNS()` still handles directly, unchanged)
- The returned `descriptor` is plain and JSON-serializable — `graph.export()`'s shape, extended with `authority` (the name) and `roleBaseKey` (which `export()`/`Hypergraph.join()` don't know about) — so it can be shared however an app likes (printed, sent to a friend, embedded in an address) and rebuilt with `joinAuthority()`
- `test/brittle/replication-hyperswarm.js` was rewritten around the new bootstrap API

---

## 2026-07-31 — Fixed: `createAuthority()`/`joinAuthority()` connecting sequentially prevented peers from ever finding each other quickly

### Decision

Connecting to the network is no longer something `createAuthority()`/`joinAuthority()` do internally as part of `opts.connect: true` alone. Both now return a `.connect()` method; `opts.connect: true` remains as convenience sugar for the common single-instance case, but two peers being set up together (in a test, or in any app bootstrapping both sides at once) should call `.connect()` on each and await them together (`Promise.all`), not sequentially.

### Rationale

- My first diagnosis of this test's slow runtime (previous entry above) was wrong. I attributed it to `connectToSwarm()`'s internally generous, real-world-calibrated timeouts and left it there — but real-world testing (on a machine where Hyperswarm normally connects in 1-2 seconds, not minutes) showed it simply never completing at all. That was the right thing to push back on, and pushed me to actually re-examine the retry logic rather than re-assert the same explanation
- The actual bug: `graph.connectToSwarm()` fully awaits its own connection attempt (including hypergraph's internal retry/backoff logic) before returning. `createAuthority(..., { connect: true })` followed by `joinAuthority(..., { connect: true })` therefore connects sequentially — the owner's discovery window (and any retries, which involve leaving and rejoining the topic) runs entirely, and potentially closes, before the member/peer side ever starts trying to connect at all. Two peers can't find each other in seconds if only one of them is ever actively listening at any given moment, no matter how fast the underlying DHT normally is
- This has nothing to do with hypergraph's own timeout tuning being wrong — it's a HyperDNS-side API/usage bug in how the bootstrap layer exposed connecting at all

### Consequences

- `test/brittle/replication-hyperswarm.js` now sets up both sides fully locally first (`connect: false`, the default — resolves near-instantly, no network I/O), then calls `owner.connect()` and `member.connect()` together via `Promise.all`, so both sides are genuinely trying to find each other at the same time
- The test's timeout was dropped back to brittle's normal default (removed the extended custom timeout and the `--timeout 500000` flag from `npm run test:network`) — if this fix is correct, connecting two same-machine peers should take seconds, not minutes, and a long custom timeout would only mask a real regression rather than surface one
- I could not fully validate the fix's actual timing improvement in my own sandboxed environment specifically — its network conditions may not support real DHT/UDP connectivity at all, independent of anything in this code, which would explain why even a correct implementation might still not complete there. The structural fix (concurrent rather than sequential connection) is correct regardless and should be verified on a real machine
- The bootstrap logic itself (descriptor creation, `joinAuthority()`, publish/resolve across peers) remains separately and fully verified by `test/brittle/authority.js`, over fast, deterministic direct Corestore replication rather than real Hyperswarm — that test was never affected by this bug since it never uses `connect: true` at all
- See `test/brittle/authority.js` for the primary regression coverage of `createAuthority()`/`joinAuthority()`

---

## 2026-08-02 — Added the shell (`shell/`, `bin/cli.js`), forked from js-shell-kit

### Decision

HyperDNS ships a shell — a single long-running process with commands (`create`, `join`, `connect`, `publish`, `resolve`, `status`, `descriptor`, ...) — rather than a short-lived CLI. Forked from js-shell-kit (github.com/tibocub/js-shell-kit), keeping its REPL/readline/tab-completion machinery and the `{name: {fn, help}}` builtin pattern (auto-generates the `help` command's output), removing program execution and the gnu-like builtins (`cd`, `ls`, `type`) entirely — HyperDNS's own commands replace them.

### Rationale

- A short-lived CLI process would pay the network connection cost on every single invocation; the entire point of the underlying P2P networking is to stay connected between commands
- `shell/lib/session.js` (new, not from js-shell-kit) manages the shell's single "current authority" — creating/joining once, then `publish`/`resolve`/`status` all operate on it — and persists it under `.hyperdns/<name>/` so relaunching the shell resumes rather than recreates

### Bugs found while actually testing the shell, not just writing it

- **Command interleaving under piped/fast input**: `readline` fires `'line'` for every buffered line without waiting for a previous async listener to resolve, so `create` → `status` → `publish` piped in together started executing concurrently instead of in order, with `status`/`publish` running before `create` had finished. Fixed with an explicit serialization queue in `shell/main.js`.
- **`status` always reported "owner"**: compared the RoleBase's own key against itself (`descriptor.roleBaseKey === graph.roleBase.key`) — both the owner and any joining peer open the *same* RoleBase, so this was trivially always true regardless of actual role. Fixed to check the real registry (`registry.members[myKey]`).
- **The significant one — resuming silently produced a different identity every time**: `new Hypergraph(store)` with no explicit seed generates a fresh random identity on every construction; nothing is automatically derived from the store's own on-disk state. A first attempt passing only `{ seed }` was insufficient: `graph.key` (what a RoleBase registry actually checks permissions against) comes from `deviceKeyPair`, which defaults to a fresh random keypair regardless of `seed` unless passed explicitly. Fixed by persisting one seed privately (`identity-secret.json` — never written into the shareable `descriptor.json`) and deriving a stable `deviceKeyPair` from it via `hypercoreCrypto.keyPair(seed)` (deterministic from the same seed).

### Consequences

- `corestore`/`hypergraph`/`hyperswarm` moved from `devDependencies` to real `dependencies` (plus `ansi-colors`/`shell-quote`, new) — the shell is a genuine shipped feature that constructs these at runtime, unlike `src/`'s library code, which stays fully dependency-injected
- `.hyperdns/` (Corestore data, descriptors, and the private identity seed) is gitignored
- See `test/brittle/shell-session.js` for regression coverage of the identity-stability bugs specifically (resume produces the same identity and the same recognized owner role, both for the creating side and a joining peer) and the persistence flow (publish survives a full close and resume)

---

## 2026-08-03 — Fixed: owner and a locally-joined peer of the same authority collided on disk

### Decision

Local storage is now split into `.hyperdns/owned/<name>/` (authorities this identity created) and `.hyperdns/joined/<name>/` (authorities it's a member of), instead of one `.hyperdns/<name>/` keyed purely by the human-chosen authority name.

### Rationale

- Reported directly: trying to `join` an authority's descriptor while that authority's own owner session was still running on the same machine failed with a storage-engine file lock error, not a slow convergence issue — a hard failure every time
- Root cause: `create()` and `join()` both computed their storage directory as `.hyperdns/<name>/`, so an owner's `create test2` and a local peer's `join .../test2/descriptor.json` tried to open the exact same Corestore at once — two different local identities, one directory
- This isn't only a same-machine-testing problem: authority names aren't guaranteed globally unique at all, so the same flaw could let two genuinely different authorities that happen to share a name collide on disk even without ever testing owner+peer together locally

### Consequences

- Added `assertNotNameCollision()`: if `join()` finds existing local data under a name but with a different RoleBase key (a different actual authority), it refuses rather than silently reusing/overwriting the wrong local state
- `join()` also gives a clear error now when given something that's neither an existing file path nor valid JSON, instead of a confusing raw `JSON.parse` failure
- See `test/brittle/shell-session.js` for regression coverage: owner + local peer no longer collide even with the owner's session still open, and a genuine name collision between two different authorities is refused

---

## 2026-08-04 — Fixed: `connect()`'s success never actually reached the shell's "current" state

### Decision

`create()`/`join()` no longer build the `current` authority object via `{ ...result, ... }` (spread). They mutate `result` directly and assign it as-is.

### Rationale

- Reported directly: the shell's prompt kept showing "offline" even after `connect` printed "connected", and calling `connect` a second time crashed with "Corestore is closed" deep inside hypergraph's networking code
- Root cause: `attachConnect()` (`src/authority.js`) gives the returned object a `.connect()` closure that sets `result.network = ...` on that exact object. `create()`/`join()` then did `current = { ...result, store, name, dir, resumed }` — a shallow copy. The closure kept mutating the *original* `result` object; `current` (what the prompt, `status`, and the "already connected" check all actually read) was a disconnected copy whose `.network` never changed from `null`
- This explains both symptoms as one bug: the prompt/status never reflecting a real, successful connection, and a second `connect` command never short-circuiting on "already connected" — so it attempted a second, concurrent `connectToSwarm()` on the same graph, which is what actually crashed
- The resume branch of `create()` was already written correctly (mutates `current` directly, added the bug fresh-create/join paths introduced by comparison) — not a new pattern, just inconsistently applied

### Consequences

- See `test/brittle/shell-session.js`: a fast, non-network regression test checks the actual invariant directly (`session.get()` is reference-equal to what `create()`/`join()` returned, and mutating `.network` on that object is immediately visible via `session.get()`) rather than waiting on a real, possibly slow network connection to prove it
- Also added: `create`/`join` reject a name containing a path separator or whitespace with a clear error, instead of silently mangling it into a confusing local directory name (a real mistake made while testing this) — see the same test file
- Added `docs/SHELL_GUIDE.md`, linked from the README: covers the single-current-authority model (testing two peers needs two separate shell processes, not one juggling both), `create`/`join` naming, `connect`'s realistic timing expectations, `status`'s fields, and the on-disk layout

---

## 2026-08-05 — Fixed: `resolve()` never updated RoleBase's own (separate) Autobase

### Decision

`resolve()` now calls `await graph.roleBase.update()` in addition to `await graph.update()`.

### Rationale

- Reported directly: with both peers genuinely showing "online" (a real network connection, confirmed by `status`), a joining peer could still resolve zero records for a name the owner had genuinely published — while the owner resolved it fine locally
- Root cause: RoleBase is its own separate Autobase (own replication, own materialized view) — `graph.update()` only refreshes the main graph/context view. `graph.can()` (the permission gate `resolve()` uses to decide whether to honor a domain claim) reads the RoleBase registry directly, with no update call of its own. So a peer's local view of "who currently holds `dns.publish`" could stay stale even after the underlying data had genuinely replicated over the wire — the domain claim gets silently excluded, which is indistinguishable from "nothing replicated" from the outside, but is actually "replicated, just not applied to this specific view yet"
- Every existing test exercising cross-peer `resolve()` happened to call `roleBase.update()` manually right before invoking it — which is exactly why this shipped uncaught. The tests were unintentionally doing `resolve()`'s job for it

### Consequences

- `resolve()` is now self-sufficient — a caller doesn't need to know to separately update the RoleBase before calling it, which matters a lot for the shell (`shell/builtins/index.js`'s `resolve` command was calling `dns.resolve()` directly, with no such workaround)
- Added `test/brittle/authority.js`: a new test deliberately does *not* call `roleBase.update()` manually before `resolve()`, to actually prove the fix rather than re-exercising the same masked path as the existing tests

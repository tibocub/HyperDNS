# Plan: 001 — HyperDNS on hypergraph's new core

## v1 → `lib/` (`hypergraph/next`)

| HyperDNS uses (v1) | New core | Note |
|---|---|---|
| `new Hypergraph(store)`, Corestore, identity seed files | `Hypergraph.open(dir)` (caller's); the library takes `hg` | identity, storage, devices are the core's |
| context per authority (`createContext`/`openContext`), RoleBase | one **space** per authority: `hg.createSpace({ name, types })` | the space's key is the authority |
| `domain` + `record` entities, `name:<n>` tag, `has_record` edge, JSON content | one record type `hyperdns/record` `{ name, kind, value, ttl }`, indexed by `name` | `type` is a reserved field name: stored as `kind`, returned as `type` |
| `graph.can(author, 'dns.publish')` gate in `resolve()` | type rule `put: { permission: 'dns.publish' }` | enforced by every reader; owner has it, others via `defineRole` + `setRole` |
| `trustedModerators` + `moderation` events | the space's moderators: `moderateAction('hide' / 'remove', record)` | hidden/removed records are out of every query |
| `writeMode: 'open'` + name-derived topic (`network/topic.js`) | public authority: `space.makePublic()`, `publicLink()` | anyone joins with the link; joining writes nothing (read-only in effect: only `dns.publish` holders' records count) |
| `writeMode: 'closed'` (`--closed`) | — | dropped: only `dns.publish` holders count either way; a members-only authority is `private` |
| private: random topic + ScopeBase scope + `grantAccess(pubkey, encKey)` | `createSpace({ private: true })` + `createInvite()` / `redeemInvite()` | D1; key exchange by hand goes |
| `descriptor` (keys JSON), `joinAuthority(descriptor)` | a link (public link or invite), `joinAuthority(link)` = `hg.redeemInvite` | |
| `graph.connectToSwarm(topic, …)`, `.connect()` | `hg.connectToSwarm()` (caller's) | HyperDNS's `src/` does no networking at all now |
| `getAuthorityClient(name)` callback in `resolveAddress` | `resolveAddress(address, { hg })`: authority = a held authority's name, or a link (joins it if needed) | FR-002, error codes `UNKNOWN_AUTHORITY`, `UNKNOWN_NAME`, `UNAVAILABLE`, `AMBIGUOUS_AUTHORITY` |
| `authors`, `claimPermission` options of `resolve()` | — | dropped: untested by callers; the permission now lives in the type |

Nothing needs a hypergraph change.

## Changed meaning (v1 → now)

- Losing `dns.publish` keeps what was published up to the cut (core rule); v1 dropped it retroactively.
- `name@<authority name>` finds only authorities this instance holds (joined or created). An authority nobody told you
  about is reached by its link (`blog@hg:…`). v1 could not resolve outside the current authority at all; the
  README's "addresses derived from the name" was never built and can't be without a name directory.
- `resolve()` takes a `space` (already opened by the caller) instead of `graph` + `context`; it still never joins.

## Order

Tests first (`test/brittle/`, on `hypergraph/testing`'s local DHT), then `src/`, shell, docs. Bare: a script run
with `bare` creating, publishing and resolving through `src/`.

## Tests changed (FR-001)

- `topic.js`: deleted with `network/topic.js` (topics are hypergraph's, from keys).
- `authority-private.js`: v1's topic tests and "joined but not granted" go (no such state: joining a private space is
  being let in); now: no public link, a stranger with the key is refused (`UNAVAILABLE`), an invite lets a member read.
- `resolve-permission-gate.js`: the `relate()`-attached-record test goes (no domain/record split any more).
- `resolve.js`: moderation by the space's moderators instead of `trustedModerators`.
- `shell-session.js`: the seed-file and owned/joined-collision tests go (one instance, spaces by key).
- `shell-builtins.js`: `resolve name@other` now resolves (v1 refused it); `grant`/`whoami` encryption key go, `link`/`invite` come.
- `replication-hyperswarm.js`: same scenario on the public DHT through `hypergraph/testing`.

## Done

`npm test` 36/36 (Node), `npm run test:bare` 24/24 (every library file on Bare, hypergraph's own `bare`),
`npm run test:network` 1/1 (public DHT).

# Feature Specification: 001 — HyperDNS on hypergraph's new core

**Created**: 2026-11-17 · **Status**: Draft (grilled with Tibo, 2026-11-17) · **With**: HyperBrowser spec 022
(resolving `name@authority` in the address bar)

HyperDNS runs on hypergraph v1 (`src/`, `Hypergraph`, ScopeBase). hypergraph's v1 is frozen and will be removed once
HyperDNS no longer needs it (ROADMAP). Port HyperDNS onto the current core (`lib/`, spaces, invites, circles), same
features, so HyperBrowser can resolve names and v1 can go.

## Decided (Tibo, 2026-11-17)

- **D1 Port, not redesign**: the same features: authorities (naming groups), `name@authority` addresses
  (`docs/ADDRESSING.md`), resolving from authorities you're not a member of (sparse, read-only), private authorities,
  the shell (`npm run shell`). Private authorities use the core's private spaces and invites instead of exchanging
  keys by hand (ScopeBase `grantAccess` goes).
- **D2 No migration**: nobody uses it; authorities are recreated.
- **D3 Kept online like any space**: an authority is an ordinary space, held by its members' circles (helpers
  included). Nothing HyperDNS-specific.
- **D4 v1 removal later**: deleting hypergraph `src/` is a separate step after Tibo checks the port.
- **D5 Bare too**: the library part (`src/`, not the shell) must run on Bare as well as Node, because HyperBrowser's
  engine does.

## Requirements

- **FR-001** Every behaviour the current suite tests (`test/brittle/`) still holds on the new core, or the test is
  changed with a one-line reason (a v1-only detail). The constitution (`.specify/memory/constitution.md`) still binds:
  `resolve()` deterministic, local, never mixing contexts, never opening a context itself; every feature has a brittle
  test.
- **FR-002** A library call HyperBrowser can use: given a running hypergraph instance and `name@authority`, resolve
  to the record's value (a site key for HyperBrowser), joining the authority's space read-only if needed; errors
  for an unknown authority, an unknown name, and nobody online to serve it, each with its own code.
- **FR-003** Docs updated (README, `docs/`, SHELL_GUIDE), `DECISIONS`/plan for anything changed; `package.json` no
  longer needs v1.

## Not covered

Managing authorities from HyperBrowser (create, publish a name: later). Federation changes. Removing v1 (D4).

# CLAUDE.md

## What this is

HyperDNS is a federated P2P naming system on `hypergraph/next`. An authority is a hypergraph space (a trust and
moderation boundary, not a global namespace); addresses are `name@authority`. `src/` is a dependency-free library
(Node and Bare) that takes the caller's hypergraph instance; `shell/` is a long-running REPL (`npm run shell`) that
keeps the P2P connection up between commands. Overview: `README.md`.

## Binding rules

`.specify/memory/constitution.md` governs. Two rules are non-negotiable:

- `resolve()` is deterministic and local, reads exactly the one space the caller gives, and never opens one itself.
- Every feature or fix ships with a `brittle` regression test.
- `npm run typecheck` (tsc strict over `bin/`, `scripts/`, `shell/`, `src/`; `jsconfig.json`) passes with no
  error. Real `@typedef`s, hypergraph's own types where they come from it; each `any` or `@ts-expect-error` says why.

New design reasoning goes in the feature's `specs/<NNN-name>/plan.md`. `DECISIONS.md` and `WORKFLOW.md` are records
only (`WORKFLOW.md` is legacy and contradicts this file: this file wins).

## hypergraph

`package.json` links `file:../hypergraph`: the sibling checkout `../hypergraph`, which must sit
next to this repo. `npm install` / `npm ci` are safe. hypergraph is alpha and breaks on purpose, so never test
against a copy; on Windows never repair the link with `ln -s` (it silently copies). Read its source directly when
debugging across the boundary. Ecosystem map: `../hypergraph/ECOSYSTEM.md`.

## Tests

Tests write to the system temp folder (`HG_TEST_TMP` to change it): `npm test`.

- `npm test`: every test except the public-DHT one, on a local DHT, with a 240 s hang guard.
- `npm run test:bare`: the library's tests (not the shell's) on Bare.
- `npm run test:network`: the public-DHT test, alone.

## Comments

Keep a comment only when it explains why, in a way the code can't show: a subtle bug, a security choice, a
workaround (`shortcut: <limit>, <when to upgrade>`). No history, dates, names, spec ids or restated code. Public API
in `src/` gets JSDoc.

## Docs

- `README.md`: overview. `docs/API.md`: every export and option. Other `docs/*.md`: addressing, schema,
  networking, replication, invariants, privacy, shell, architecture. Update them with the code.
- `specs/`: one folder per feature (spec-kit). `.specify/`: spec-kit config and the constitution.

## Workflow

Spec-kit skills (`/speckit-specify` → `plan` → `tasks` → `implement`) for new or ambiguous features; a direct fix
with a regression test for small, understood bugs. The skills call `python3 .specify/scripts/...`; retry with
`python` if `python3` is missing. After `/speckit-specify` creates `specs/<NNN-name>/`, branch `<NNN-name>`, merge
to `master` when its tests pass. Commit messages here are long, narrative and honest about WIP.

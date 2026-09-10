# CLAUDE.md

Guidance for any Claude Code session working in this repo. Read this before doing anything else
here — it's the one file every session auto-loads, unlike `.specify/memory/constitution.md`
below, which only loads during a `/speckit-*` skill invocation.

## What this is

HyperDNS is a federated, P2P naming system built on top of `hypergraph` (a sibling project) —
names resolve to addresses without a central authority. An "authority" is a moderation/trust
boundary, not a global namespace; addresses are `name@authority` (mailbox-first). Ships as a
long-running interactive shell (`npm run shell`), not a short-lived CLI, because the P2P
connection needs to stay live between commands.

## Governing document

**`.specify/memory/constitution.md` is the project's binding governance document.** Read it
before any non-trivial change. Two principles are NON-NEGOTIABLE: `resolve()` must be
deterministic, local, and never mix contexts, and never opens a context itself (the caller
scopes it first) — and every feature ships with a `brittle` regression test, no exceptions.

This project already had its own process docs before spec-kit (`WORKFLOW.md`, `DECISIONS.md`) —
the constitution formalizes what was actually load-bearing in them rather than replacing it
wholesale. `WORKFLOW.md` is now legacy (its rules are in the constitution or here); `DECISIONS.md`
stays as historical record through 2026-08-09, but new decision reasoning belongs in a feature's
`specs/<name>/plan.md` going forward, not a new dated entry there.

## Wider ecosystem

hyperDNS is one of five sibling P2P projects under `E:\Code\P2P\`. **Canonical map:
[`E:\Code\P2P\hypergraph\ECOSYSTEM.md`](../hypergraph/ECOSYSTEM.md).**

- **hypergraph** (`E:\Code\P2P\hypergraph`) — P2P graph database. The hub; this project's only
  sibling dependency. Its source is on this machine — read it directly when debugging across the
  boundary rather than guessing at its behavior.
- **HyperBBS** (`E:\Code\P2P\HyperBBS`) — terminal-first P2P browser; the eventual consumer of
  hyperDNS names (so sites can be addressed by name instead of raw pubkey). Not yet integrated.
- **HyperMD** (`E:\Code\P2P\HyperMD`), **SwarmFS** (`E:\Code\P2P\SwarmFS`) — document format and
  bulk file transfer; unrelated to naming.

Dependency direction is one-way: hypergraph knows nothing about hyperDNS. Breaking changes there
land here instantly via the symlink (see the `npm ci` warning above).

## Spec-kit workflow

Every `/speckit-*` skill has `disable-model-invocation: false` — I can invoke these directly via
the Skill tool, without you typing the slash command. Decide myself whether a request needs the
full pipeline (new/ambiguous features, real design decisions) or just a direct fix with a
regression test (a small, already-understood bug).

`/speckit-specify` → (optional `/speckit-clarify`) → `/speckit-plan` → `/speckit-tasks` →
(optional `/speckit-analyze`, `/speckit-checklist`) → `/speckit-implement` → `/speckit-converge`
for periodic backlog sweeps against the codebase.

The **private authorities** feature is mid-flight in the working tree as of this setup
(uncommitted changes across `authority.js`, `publish.js`, `HyperDNS.js`, `session.js`,
`shell/builtins/index.js`, plus new `docs/PRIVACY.md` and `test/brittle/authority-private.js`) —
finish that on its own before starting an unrelated spec-kit feature pass, don't interleave them.

## ⚠ Do NOT run `npm ci` / `npm install` here without reading this

`node_modules/hypergraph` is a **symlink to the live local checkout at
`E:\Code\P2P\hypergraph`** (see `ECOSYSTEM.md` there for the full picture). That is deliberate —
it means this repo tests against current hypergraph rather than a snapshot.

`package-lock.json` still pins `hypergraph` to commit `c239938` (2026-08-02), which is **behind**
the local checkout by a set of apply-time signature-binding and validation changes (relation/tag
signatures bound to context, content-append author checks, sortable content-version keys). So:

- **`npm ci` will replace the symlink with that stale pinned commit**, producing a peer that
  *rejects tag/relation events* signed by a current-hypergraph peer. This presents as
  "replication silently doesn't work," with nothing pointing at version skew.
- The lock can't be corrected yet: hypergraph's current work is uncommitted/unpushed, so there is
  no GitHub commit to pin to. Until hypergraph publishes, treat the symlink as the source of truth
  and this lockfile entry as known-stale.
- If you do clobber it, restore with: `npm link` in the hypergraph checkout, then
  `npm link hypergraph` here.

hypergraph is ALPHA and takes intentional breaking changes, so a stale copy is not a safe
fallback — it's a silently-incompatible peer.

## Known cleanup

- `network/HyperswarmNetwork.js` — **done** (deleted 2026-09-09; it was unreferenced, and
  DECISIONS.md's 2026-07-30 entry had already declared it removed).
- The three narrative `docs/*.md` prose files and `docs/ARCHITECTURE.md` may describe
  pre-`connectToSwarm()` networking — `docs/NETWORKING.md` is the current, authoritative one.
- `WORKFLOW.md` is legacy. Its embedded ROADMAP is stale (it lists networking and federation as
  future work; both shipped), and it carries a competing "LLM Instructions" block plus a Windsurf
  prompt template that contradict this file. **This file wins.**

## Tooling

- Spec-kit's own `/speckit-*` skills shell out to `.specify/scripts/python/*.py` (stdlib-only) —
  `python3` must resolve on PATH. If a skill's `python3 ...` call fails with "command not found,"
  retry as `python .specify/scripts/...` (some Windows setups only expose `python`).
- Tests: `brittle`, via `npm test` (wraps with a timeout guard, `scripts/test-with-timeout.js`) or
  `npm run test:network` for the Hyperswarm-specific suite. `hypergraph` isn't published to npm
  yet — local dev needs `npm link` from a hypergraph checkout.

## Git convention: branch per feature

No spec-kit git extension is installed, so branch creation isn't automatic. After
`/speckit-specify` creates `specs/<NNN-name>/`, run `git checkout -b <NNN-name>` (same name as
the spec directory). Merge back to `master` once that feature's `/speckit-implement` is done and
its tests pass. This project's existing commit style is long, narrative, and honest about WIP
state ("still crashes," "Next step: ...") — don't impose a different style on top.

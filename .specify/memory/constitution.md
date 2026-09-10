<!--
Sync Impact Report
Version change: none (new) → 1.0.0
Rationale: initial ratification — MAJOR because this establishes the first *versioned*
governance for the project. It is not, however, the first governance of any kind: this project
already had WORKFLOW.md (a concatenation of what were originally six separate docs — WORKFLOW,
TESTING, CONTRIBUTING, ROADMAP, DESIGN_PRINCIPLES, and a literal PROMPT_TEMPLATE for resuming
a lost-context LLM session) and DECISIONS.md (an ongoing, dated architecture-decision +
bug-postmortem log, 2026-04-14 through 2026-08-09). This constitution formalizes WORKFLOW.md's
actual rules into versioned principles rather than re-deriving anything from scratch, and assigns
DECISIONS.md a continuing but narrower role (see Documentation & Specification Hygiene).
Modified principles: n/a (initial set, but see rationale above — not written from a blank slate)
Added sections: Core Principles (I–V), Documentation & Specification Hygiene,
  Adoption in an Existing Codebase, Governance
Removed sections: none (WORKFLOW.md and DECISIONS.md are NOT deleted — see below)
Templates requiring follow-up:
  ✅ plan-template.md — Constitution Check gate reads this file at runtime, no edit needed
  ✅ tasks-template.md / speckit-tasks SKILL.md — "tests optional by default" contradicted
     Principle II (test-first, explicitly required by the pre-existing WORKFLOW.md); changed
     default to test-tasks-included
  ⚠ TODO: none outstanding — all placeholders resolved from repo evidence (WORKFLOW.md,
    DECISIONS.md, docs/INVARIANTS.md, docs/ADDRESSING.md, docs/NETWORKING.md, docs/PRIVACY.md,
    package.json, git log)
-->

# HyperDNS Constitution

## Core Principles

### I. Resolution Is Deterministic, Local, and Never Cross-Context (NON-NEGOTIABLE)

`resolve()` MUST be deterministic given the same local graph state, MUST NOT mix data across
Autobase contexts, and MUST NOT open contexts itself — it only ever operates on a graph instance
the caller has *already* scoped to exactly one open context. This is a hard API contract
(previously stated in WORKFLOW.md's "Resolver Context Contract" and DECISIONS.md), not a
style preference: violating it either silently blends two unrelated authorities' data or makes
resolution depend on caller-side ordering. Names are NOT globally unique (a name can have
multiple claims across authorities/records) — resolution picks among candidates by a documented,
deterministic rule, never by insertion order or network arrival order. Entity IDs are internal
plumbing — resolution and addressing MUST NOT rely on them directly (see `docs/INVARIANTS.md`).
Rationale: this is the one property every caller of `resolve()` — the shell, the SDK, a future
embedder — implicitly trusts. Silent nondeterminism or accidental context-mixing is the kind of
bug that looks fine in a single-peer test and corrupts resolution the moment two authorities
share a process.

### II. Test-First, Every Feature (NON-NEGOTIABLE)

Every feature MUST ship with a minimal implementation AND a `brittle` regression test under
`test/brittle/` — this was already the rule (WORKFLOW.md: "Every feature MUST include... a
regression test"; "Every important behavioral change MUST add a new brittle test case") and
stays one, formalized. `npm test` MUST be green before considering a change done — "it should
work" without a green run is not done. Don't modify an existing test unless it's actually wrong;
don't change a public API's shape without updating the docs that describe it in the same change
(see Documentation & Specification Hygiene). Tests use deterministic inputs and avoid randomness
per WORKFLOW.md's existing testing strategy — snapshot-style where that fits the resolver's
deterministic-output guarantee (Principle I).
Rationale: this project's own DECISIONS.md is full of postmortems that each cite the regression
test added to close the gap — that's the accumulated evidence this rule is worth keeping exactly
as strict as it already was.

### III. Delegate Networking to hypergraph — Don't Reimplement It

HyperDNS depends on `hypergraph` for Hypercore/Autobase/Hyperswarm and does not touch Hyperswarm
directly for anything hypergraph already provides (per `docs/NETWORKING.md`: HyperDNS uses
hypergraph's `connectToSwarm()`, full stop). `network/topic.js`'s authority-topic derivation is
the one piece of networking HyperDNS legitimately owns (there's no hypergraph equivalent for it).
Do not add a second, HyperDNS-owned networking path alongside it — DECISIONS.md already records
one such path (`network/HyperswarmNetwork.js`) being *decided* obsolete once `connectToSwarm()`
existed; that class is still physically on disk and unreferenced (see Adoption below) — a
reminder of how easy it is for "decided removed" to not actually happen without an enforcing
step.
Rationale: hypergraph is a sibling project evolving specifically to solve this; duplicating its
solution here doubles the maintenance surface for zero benefit, and DECISIONS.md already
concluded this once.

### IV. Zero Runtime Dependencies in `src/`

The library surface (`src/`) MUST stay dependency-free at runtime — a `Corestore`/graph instance
is always injected by the caller, never constructed internally. Real dependencies
(`corestore`, `hyperswarm`, `hypergraph`) belong only to the shipped shell (`shell/`, `bin/cli.js`),
which is a genuinely standalone application, not the library. This is already `package.json`'s
own stated intent (its `"//"` comment) — keep it that way when adding to `src/`.
Rationale: keeps HyperDNS embeddable in any host app's own Corestore/graph setup without forcing
a specific networking stack on the embedder.

### V. Federation Trust Is Local, Not Global Consensus

An authority is a moderation/trust boundary, not a source of global truth — HyperDNS's explicit
non-goal is "perfect global consensus" (README.md). Resolution across a federation is
trust-based aggregation from the local peer's point of view, and records may arrive out of order
or duplicate; only the *local, deterministic* result (Principle I) matters, not achieving one
canonical answer across all peers simultaneously (`docs/REPLICATION.md`).
Rationale: this is the actual design bet the project is making (federated, not centralized) —
a feature that quietly assumes global consistency contradicts the reason HyperDNS exists.

## Documentation & Specification Hygiene

`specs/<feature>/` (spec → plan → tasks) is the source of truth for anything new or changed,
going forward — not a new dated entry in `DECISIONS.md`. `DECISIONS.md` remains as the historical
decision/postmortem log through 2026-08-09 (kept, not deleted — it's real project history and
several of its entries are still the best record of *why* something is the way it is); new
entries stop here and move to the relevant `specs/<feature>/plan.md` instead. `WORKFLOW.md` is
now legacy — every rule it stated that still holds is formalized above (Principles I–II) or in
`CLAUDE.md`; its embedded `PROMPT_TEMPLATE.md`/Windsurf-recovery section is superseded entirely by
this constitution + spec-kit and can be treated as historical record, not something to keep
updating. `WORKFLOW.md`'s embedded `ROADMAP.md` section is stale (describes the project as
pre-networking; it's well past that) — don't treat it as current status.

`docs/INVARIANTS.md`, `docs/ADDRESSING.md`, `docs/NETWORKING.md`, `docs/PRIVACY.md`,
`docs/REPLICATION.md`, `docs/HYPERDNS_SCHEMA.md`, and `docs/SHELL_GUIDE.md` are the current-state
technical reference — DECISIONS.md itself already calls ADDRESSING/NETWORKING/PRIVACY "settled,
authoritative" when it introduced them, which this constitution treats as their permanent role.
**Doc-sync-on-change**: a change to a module backed by one of these docs → update that doc in
the *same* change. `docs/ARCHITECTURE.md` is known to be partially stale (its `/core`+`/network`
component split predates the shell and authority-bootstrap code) — treat corrections to it
opportunistically, not as a blocking prerequisite for unrelated work.

## Adoption in an Existing Codebase

This constitution governs new and changed work from this point forward; it does not require
retroactive specs for already-working modules. Two concrete pieces of already-decided cleanup
found during adoption, safe to do whenever convenient (each already has a paper trail —
DECISIONS.md — recording the decision, just not the execution): delete
`network/HyperswarmNetwork.js` (DECISIONS.md's 2026-07-30 entry already declares it removed;
it's dead code, unreferenced anywhere except that entry); reconcile the three narrative
`docs/*.md` prose files if they still describe pre-`connectToSwarm()` behavior. The private
authorities feature is mid-flight in the working tree as of this constitution's ratification
(uncommitted changes to `authority.js`, `publish.js`, `HyperDNS.js`, `session.js`,
`shell/builtins/index.js`, plus new `docs/PRIVACY.md` and `test/brittle/authority-private.js`) —
finish that under its own banner rather than folding it into the first spec-kit feature pass.

## Governance

This constitution supersedes ad hoc practice, including anything in WORKFLOW.md or DECISIONS.md
where they conflict. Amendments happen via `/speckit-constitution`, using semantic versioning for
this document itself: MAJOR for a principle removed or redefined incompatibly, MINOR for a
principle or section added, PATCH for wording/clarity fixes. Every `/speckit-plan` MUST pass the
Constitution Check gate against the current version of this file before Phase 0 research begins,
and re-check after Phase 1 design; violations are either resolved or justified in that plan's
Complexity Tracking table. Principles I and II are NON-NEGOTIABLE: a plan cannot justify away a
violation of them, only avoid causing one.

**Version**: 1.0.0 | **Ratified**: 2026-09-09 | **Last Amended**: 2026-09-09

> ## ⚠ LEGACY — DO NOT FOLLOW THIS FILE
>
> Superseded by **`CLAUDE.md`** and **`.specify/memory/constitution.md`**. Kept only as
> historical record. Specifically:
>
> - The **"LLM Instructions"** block below and the **Windsurf `PROMPT_TEMPLATE`** are obsolete
>   and contradict `CLAUDE.md`. `CLAUDE.md` wins.
> - The **ROADMAP** section below is **stale**: it lists Hyperswarm networking, multi-peer sync,
>   federation, and moderation rules as future work. All of those shipped. The real roadmap is
>   `README.md`'s "Goals" section.
> - Process rules that were actually load-bearing were moved into the constitution.

## WORKFLOW.md

### Purpose

This file ensures both humans and LLMs follow consistent development practices.

---

### Project Structure

* `/src` → logic
* `/test` → regression tests
* `/docs` → documentation

---

### Development Rules

1. Every feature MUST include:

   * Minimal implementation
   * One brittle regression test

2. After making changes, contributors MUST:

   * Run `npm test`
   * If tests fail, iterate until they pass
   * Never stop after "it should work" without a green test run

3. Never modify:

   * Existing tests unless broken
   * Public API without updating docs

4. Prefer:

   * Small modules
   * Pure functions

5. Resolver context contract:

   * `resolve()` MUST only be called with a graph instance that has exactly one context opened
   * `resolve()` MUST NOT call `openContext()` internally

---

### LLM Instructions

When using an LLM:

* Always read:

  * README.md
  * docs/ARCHITECTURE.md
  * WORKFLOW.md
  * docs/HYPERDNS_SCHEMA.md
  * docs/INVARIANTS.md
  * docs/REPLICATION.md

* Before coding:

  * Identify affected modules

* After coding:

  * Add/update tests
  * Ensure no regressions

---

### Testing Strategy

* Use deterministic inputs
* Avoid randomness
* Prefer snapshot-style tests for records

Every important behavioral change MUST add a new brittle test case under `test/brittle/`.

---

## TESTING.md

### Philosophy

Tests are designed to be brittle on purpose to detect regressions early.

### Types of Tests

1. Unit Tests

   * Record validation
   * Signature verification

2. Integration Tests

   * Peer sync
   * Resolution flow

3. Regression Tests

   * Fixed inputs → fixed outputs

---

## CONTRIBUTING.md

### Guidelines

* Follow WORKFLOW.md strictly
* Keep PRs small
* Document all new features

---

## ROADMAP.md

### Phase 1

* Core record system
* Basic resolution

### Phase 2

* Networking (Hyperswarm)
* Multi-peer sync

### Phase 3

* Federation
* Moderation rules

### Phase 4

* Daemon
* Browser integration

---

## DESIGN_PRINCIPLES.md

* Local trust over global truth
* Simplicity first
* Auditability via append-only logs
* Modular architecture

---

## PROMPT_TEMPLATE.md

Use this prompt in Windsurf when context is lost:

"""
You are working on HyperDNS.

Read:

* README.md
* docs/ARCHITECTURE.md
* WORKFLOW.md

Rules:

* Do not break existing tests
* Add a regression test for every feature
* Follow modular structure

Task: <INSERT TASK HERE>
"""

---


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

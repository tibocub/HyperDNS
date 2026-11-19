# Replication Model (HyperDNS)

HyperDNS operates on hypergraph's eventually consistent spaces (`hypergraph/next`).

## Authority scope

- Resolution is scoped to a single DNS authority selected explicitly by the caller (e.g. `my-blog@myDNS` - see `docs/ADDRESSING.md`).
- A HyperDNS authority is a hypergraph space, addressed by its key (link); see `docs/NETWORKING.md`.
- Authorities MUST NOT be mixed during resolution.

## Guarantees

- Records may appear in different orders across peers
- Duplicate records MAY exist temporarily
- Resolution MUST be deterministic locally
- Moderation events MAY arrive late

## Required behavior

- resolve() MUST be idempotent
- resolve() MUST NOT depend on arrival order
- duplicate records MUST be safely ignored
- last-known moderation state wins locally

## Non-guarantees

- No global ordering of records
- No immediate consistency across peers
- No global uniqueness of names

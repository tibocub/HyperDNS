# Replication Model (HyperDNS)

HyperDNS operates on an eventually consistent graph.

## Authority scope

- Resolution is scoped to a single DNS authority (instance) selected explicitly by the caller (e.g. `myDNS@my-blog`).
- A HyperDNS authority is independently addressable and discoverable.
- Authorities MUST NOT be mixed during resolution unless explicitly federated/composed.

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
- No global uniqueness of domain names

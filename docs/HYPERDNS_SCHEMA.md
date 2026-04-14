## Entities
 
### domain
 
- Entity type: `domain`
- Entity id: assigned by Hypergraph (`domain/<author>/<seq>`)
 
Domain content (`application/json`):
 
{
  name: string
}
 
Optional tag index (recommended):
 
- Tag: `name:<name>`
- Authored by the domain author
 
### record
 
- Entity type: `record`
- Entity id: assigned by Hypergraph (`record/<author>/<seq>`)
 
Record content (`application/json`):
 
{
  name: string
  type: string
  value: string
  ttl?: number
}

---

## Relations
 
- domain --has_record--> record

---

## Name Resolution Model
 
- A name resolves to a set of domain claims
- Resolution selects records by applying trust + moderation rules

---

## Context Rules
 
- All relations MUST include a context
- A context represents a DNS authority
- Resolution MUST be scoped to a single context

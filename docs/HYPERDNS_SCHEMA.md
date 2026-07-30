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
- A domain claim (and the `has_record` edge attaching a record to it) is only
  honored if its author currently holds the `dns.publish` permission in the
  context's RoleBase registry (checked via `graph.can(author, 'dns.publish')`)
- The context owner always has this implicitly (owner role has `*`); operators
  who want open community registration must explicitly grant `dns.publish` to
  other roles (e.g. `member`) via `roleBase.append({ type: 'roles/setRolePermissions', ... })`

---

## Context Rules
 
- All relations MUST include a context
- A context represents a DNS authority
- Resolution MUST be scoped to a single context

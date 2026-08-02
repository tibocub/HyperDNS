const DEFAULT_CLAIM_PERMISSION = 'dns.publish'

async function resolve (name, opts = {}) {
  if (!name || typeof name !== 'string') throw new Error('name is required')
  if (!opts.graph) throw new Error('opts.graph is required')
  if (!opts.context) throw new Error('opts.context is required')

  const graph = opts.graph
  const context = opts.context
  const trustedModerators = Array.isArray(opts.trustedModerators) ? opts.trustedModerators : []
  const authors = Array.isArray(opts.authors) ? opts.authors : null

  // The permission an author must currently hold (per the context's own
  // RoleBase registry) for their domain claims to be honored at all. This is
  // the primary trust gate: it uses graph.can(), i.e. hypergraph's own
  // role/permission system, rather than a caller-supplied allowlist. An
  // instance's owner always has it (owner role is granted '*'); operators
  // who want open community registration grant it to other roles explicitly
  // via graph.roleBase.append({ type: 'roles/setRolePermissions', ... }).
  const claimPermission = typeof opts.claimPermission === 'string' && opts.claimPermission
    ? opts.claimPermission
    : DEFAULT_CLAIM_PERMISSION

  const parseJsonBody = (content) => {
    if (!content) return null
    if (content.contentType !== 'application/json') return null
    if (typeof content.body !== 'string') return null
    try {
      return JSON.parse(content.body)
    } catch {
      return null
    }
  }

  // hypergraph requires `context` on any context-scoped read once more than
  // one context is open on this graph instance (see getByTag/edges calls
  // below) - this is what actually enforces "resolution is scoped to a
  // single context", not just a caller convention.
  await graph.update()

  // RoleBase is its own separate Autobase (own replication, own view) -
  // graph.update() does not touch it, and graph.can() reads its registry
  // directly with no update of its own. Without this, a peer that just
  // joined and replicated real data could still have every domain claim
  // silently excluded below (graph.can() evaluating against a stale local
  // view of who holds claimPermission), which looks identical to "nothing
  // replicated" but is actually "replicated, just not applied to this view
  // yet" - confirmed directly: this was the actual cause of a joining peer
  // seeing zero records for names the owner had genuinely published and
  // that had genuinely replicated.
  await graph.roleBase.update()

  const tag = `name:${name}`

  const candidateDomains = []

  // getByTag() only ever returns entities tagged by their own author (tag()
  // enforces `node.author === author`), so a domain claim's tag author and
  // its entity author are guaranteed to match — no separate check needed
  // there. `authors`, when passed, is hypergraph's own tag-query trust
  // filter (a caller-supplied allowlist); it composes with, but does not
  // replace, the role-based `claimPermission` check below.
  //
  // `context` is passed explicitly here rather than left to hypergraph's
  // default-context inference: a graph instance can have more than one
  // context open at once (e.g. a daemon that's a member of several DNS
  // authorities), and without this, hypergraph now throws instead of
  // silently guessing which one to search - this is what actually makes
  // that "resolve from a specific context" case work, not just fail safely.
  for await (const node of graph.getByTag(tag, { context, ...(authors ? { authors } : {}) })) {
    candidateDomains.push(node)
  }

  // Deterministic domain selection: sort by id so output does not depend on iterator order.
  candidateDomains.sort((a, b) => String(a.id).localeCompare(String(b.id)))

  const records = []
  const seen = new Set()

  for (const domainNode of candidateDomains) {
    // Trust gate: only honor claims from an author who currently holds
    // `claimPermission` in this context's role registry. This is what stops
    // any admitted-but-unprivileged writer's claim from silently blending
    // into resolution results.
    if (!(await graph.can(domainNode.author, claimPermission))) continue

    const domainContent = await graph.getContent(domainNode.id)
    const domainBody = parseJsonBody(domainContent)
    if (!domainBody || domainBody.name !== name) continue

    const edges = []
    for await (const edge of graph.edges(domainNode.id, { direction: 'out', type: 'has_record', context })) {
      edges.push(edge)
    }

    // Deterministic traversal
    edges.sort((a, b) => String(a.to).localeCompare(String(b.to)))

    for (const edge of edges) {
      // relate() (unlike tag()) does not check that the caller owns `from`
      // or `to` — any writer can attach a `has_record` edge from someone
      // else's legitimate domain to their own record. So the edge's own
      // author needs the same permission check as the domain claim itself;
      // trusting the domain node alone is not sufficient.
      if (!(await graph.can(edge.author, claimPermission))) continue

      const recordNode = await graph.get(edge.to)
      if (!recordNode) continue
      // Likewise, the record entity itself must actually be authored by the
      // same (permitted) author as the edge — otherwise a permitted author
      // could still relate to a record entity someone else planted.
      if (recordNode.author !== edge.author) continue

      const recordContent = await graph.getContent(recordNode.id)
      const recordBody = parseJsonBody(recordContent)
      if (!recordBody) continue
      if (recordBody.name !== name) continue
      if (typeof recordBody.type !== 'string' || typeof recordBody.value !== 'string') continue
      if (!recordBody.type.trim() || !recordBody.value.trim()) continue

      if (trustedModerators.length) {
        const events = []
        for await (const ev of graph.queryContext({
          type: 'moderation',
          context,
          target: recordNode.id,
          authors: trustedModerators
        })) {
          events.push(ev)
        }

        if (events.length) {
          events.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          const last = events[0]
          if (last && (last.action === 'content.hide' || last.action === 'content.remove')) continue
        }
      }

      const out = {
        type: recordBody.type,
        value: recordBody.value
      }
      if (recordBody.ttl !== undefined) out.ttl = recordBody.ttl

      const key = `${out.type}:${out.value}`
      if (seen.has(key)) continue
      seen.add(key)
      records.push(out)
    }
  }

  // Deterministic output
  records.sort((a, b) => {
    const t = String(a.type).localeCompare(String(b.type))
    if (t) return t
    return String(a.value).localeCompare(String(b.value))
  })

  return records
}

module.exports = resolve

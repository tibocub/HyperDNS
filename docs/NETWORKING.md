# Networking Model (HyperDNS)

HyperDNS does no networking. Since spec 001 its library (`src/`) takes the caller's hypergraph instance (`hg`,
`hypergraph/next`); the caller connects it once (`hg.connectToSwarm()`), and hypergraph finds the members of every
space it holds, now and later. HyperDNS's own code never touches a P2P library, a topic or a connection.

## Finding an authority

An authority is a space: members meet on a topic hypergraph derives from the space's **key**, and only peers that
know the key can open its channel. So an authority is reached by its link (`hg:<key>`, `space.publicLink()`), not
by its name.

v1 derived a topic from the authority's name (`network/topic.js`, `sha256("hyperdns:v1:" + name)`), but a peer
still needed the owner's descriptor (its keys) to join anything: the name alone never resolved. That file is gone.
Resolving by name alone needs a directory of names to keys, which nothing provides yet (not built; would need a
hypergraph change or a shared registry).

`resolveAddress('blog@<authority>', { hg })`:

- `<authority>` a link: joins the space if `hg` doesn't hold it yet (a public one: no decision, nothing written;
  `UNAVAILABLE` if nobody holding it answers in time), then resolves.
- `<authority>` a name: an authority `hg` already holds (created, joined, or reached once by link).
  `UNKNOWN_AUTHORITY` if none, `AMBIGUOUS_AUTHORITY` if two share it.

## Replication

Hypergraph's: every member holds the space, newest part first for a big one, and keeps it updated while online.
A visitor that joined by link holds it like a member and is told about new records. See hypergraph's
`docs/next/concepts.md`.

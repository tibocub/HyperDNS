# Networking Model (HyperDNS)

HyperDNS does no networking. Its library (`src/`) takes the caller's hypergraph instance (`hg`,
`hypergraph/next`); the caller connects it once (`hg.connectToSwarm()`), and hypergraph finds the members of every
space it holds, now and later. HyperDNS's own code never touches a P2P library, a topic or a connection.

## Finding an authority

An authority is a space: members meet on a topic hypergraph derives from the space's **key**, and only peers that
know the key can open its channel. So an authority is reached by its link (`hg:<key>`, `space.publicLink()`), not
by its name.

Resolving by name alone would need a directory of names to keys. None exists yet.

`resolveAddress('blog@<authority>', { hg })`:

- `<authority>` a link: joins the space if `hg` doesn't hold it yet (a public one: no decision, nothing written;
  `UNAVAILABLE` if nobody holding it answers in time), then resolves.
- `<authority>` a name: an authority `hg` already holds (created, joined, or reached once by link).
  `UNKNOWN_AUTHORITY` if none, `AMBIGUOUS_AUTHORITY` if two share it.

`resolveAddress` waits up to `timeout` (default 10 s) for holders to answer.

## Replication

Done by hypergraph: every member holds the space, newest part first for a big one, and keeps it updated while online.
A visitor that joined by link holds it like a member and is told about new records. See hypergraph's
`docs/next/concepts.md`.

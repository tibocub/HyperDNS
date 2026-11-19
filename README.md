# HyperDNS

HyperDNS is a federated, peer-to-peer naming system built on [hypergraph](../hypergraph). It turns a
human-readable name such as `blog@bobsDNS` into records (a hypergraph link, a Hyperdrive key, an IP address...)
without a central registry.

## Concepts

- **Authority.** A hypergraph space that holds DNS records. It has an owner, members, roles and moderators. An
  authority is a trust and moderation boundary, not a global namespace: two authorities can both have a `blog`.
- **Address.** `name@authority`, mailbox first like an email address. `authority` is either the authority's link
  (`hg:<key>`), which reaches any authority, or the name of one you already hold (`bobsDNS`). An optional
  `hyperdns://` prefix and a trailing `/path` are allowed. HyperDNS never interprets the path. See
  [docs/ADDRESSING.md](docs/ADDRESSING.md).
- **Resolving.** A name resolves to every record of that name in one authority, deduplicated and sorted, so every
  peer gets the same answer from the same data. Resolving by link joins a public authority read-only. Only members
  whose role holds `dns.publish` can publish, and the authority's moderators can take records down.
- **Private authorities.** `private: true` makes an authority a private space: sealed records, encrypted on disk,
  members let in by invite link only. See [docs/PRIVACY.md](docs/PRIVACY.md).

Names are not globally unique, and a name alone does not find an authority: you need its link once. Nothing maps
names to links yet.

## Library

`src/` has no dependencies and runs on Node and Bare. You pass in your own `hypergraph/next` instance and connect
it yourself (`hg.connectToSwarm()`); HyperDNS does no networking of its own.

```js
const { createAuthority, resolveAddress } = require('hyperdns')

const { dns, link } = await createAuthority('bobsDNS', { hg })     // public; link is 'hg:<key>'
await dns.publish('blog', { type: 'hyper', value: 'hg:...' })

const { records, path, authority } = await resolveAddress(`blog@${link}`, { hg: otherHg })
// records: [{ type: 'hyper', value: 'hg:...' }]
// errors carry err.code: UNKNOWN_AUTHORITY | AMBIGUOUS_AUTHORITY | UNKNOWN_NAME | UNAVAILABLE
```

Every export and option: [docs/API.md](docs/API.md).

## Shell

The shell is a long-running process: the P2P connection stays up between commands.

```
npm run shell
```

```
hyperdns > create bobsDNS
created authority "bobsDNS"
hyperdns:bobsDNS (offline) > connect
connected
hyperdns:bobsDNS (online) > publish blog A 1.2.3.4
published blog -> A 1.2.3.4
hyperdns:bobsDNS (online) > resolve blog
  A  1.2.3.4
```

Data lives in `.hyperdns/` in the current folder; `create bobsDNS` again resumes the same authority. Anyone else
resolves with `resolve blog@hg:...` (the link printed by `link`). `help` lists every command. Walkthrough:
[docs/SHELL_GUIDE.md](docs/SHELL_GUIDE.md).

## Quick start

Clone [hypergraph](../hypergraph) next to this repo (it is not on npm yet; `package.json` links
`file:../hypergraph`), then:

```
npm install
npm run shell
```

## Tests

```
npm test               # Node, all tests on a local DHT
npm run test:bare      # the library's tests on Bare
npm run test:network   # one test on the public DHT (slow, run alone)
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Docs

- [docs/API.md](docs/API.md): library exports and options
- [docs/ADDRESSING.md](docs/ADDRESSING.md): address grammar
- [docs/HYPERDNS_SCHEMA.md](docs/HYPERDNS_SCHEMA.md): authorities, the record type, who may publish
- [docs/NETWORKING.md](docs/NETWORKING.md): how authorities are found and replicated
- [docs/REPLICATION.md](docs/REPLICATION.md): consistency guarantees
- [docs/INVARIANTS.md](docs/INVARIANTS.md): rules resolution must keep
- [docs/PRIVACY.md](docs/PRIVACY.md): private authorities
- [docs/SHELL_GUIDE.md](docs/SHELL_GUIDE.md): the shell
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): code layout

Records: `.specify/memory/constitution.md` (binding rules), `specs/` (feature specs), `DECISIONS.md` (decisions up
to 2026-08), `WORKFLOW.md` (legacy).

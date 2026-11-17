# HyperDNS

### Overview

HyperDNS is a peer-to-peer, federated naming system built on [Hypergraph](https://github.com/tibocub/Hypergraph)
and the [Holepunch](https://github.com/holepunchto) primitives (Hypercore, Hyperswarm, Hyperbee...). It allows
applications to resolve human-readable names into addresses or hashes (hyperdrive key, IP address, hyperswarm
topic...) without relying on centralized DNS authorities.

Central authority sucks, but making a community-based DNS breaks a bit the purpose of a DNS which is to make
a resource easy to access. So joining manually a HyperDNS community to be able to reach its addresses doesn't sound optimal.

We can still manage to make a kinda universal source of truth without trusting everyone by making hyperDNS instances
able to talk to each others like email servers or the fediverse. A hyperDNS address is composed of the record
name + the DNS instance to resolve it from - the same order as an email address (mailbox first, domain second).
For example **"hyper://blog@bobsDNS"** would resolve the record named **"blog"** within the **"bobsDNS"**
hyperDNS instance. See `docs/ADDRESSING.md` for the full grammar (including an optional trailing path, for
addressing something more specific within whatever the resolved record points to).

- an authority is reached by its link (its key); once held, by its name. Deriving it from the name alone needs a name directory (not built)
- users can join and create hyperDNS instances, which replicates locally all their records
- resolving an address from an instance you're not member of joins it read-only (hypergraph holds big spaces newest part first)

### Goals

* Decentralized naming system
* Federated moderation (no global authority)
* Any address is resolvable even without being member of a DNS instance (if at least one member of the target instance is online to host the records)
* Embeddable SDK for developers (give the holepunch ecosystem a hyperdns module)
* Local daemon for system-wide resolution
* [idea/later] Browser integration via extensions to support hyper:// protocol and resolve addresses directly from browser

### Non-Goals

* Perfect global consensus
* Full DNS replacement

### Core Concepts

* Identity = public key
* Community = moderation boundary
* Record = signed entry in append-only log
* Resolution = trust-based aggregation

---

## Usage

HyperDNS ships a shell - a single long-running process you interact with via commands, rather
than a short-lived CLI, since the whole point of the underlying P2P networking is to stay
connected between commands instead of reconnecting on every invocation.

```
npm run shell
```

```
hyperdns > create bobsDNS
created authority "bobsDNS"
hyperdns:bobsDNS (offline) > connect
connected
hyperdns:bobsDNS (offline) > publish blog A 1.2.3.4
published blog -> A 1.2.3.4
hyperdns:bobsDNS (online) > resolve blog
  A  1.2.3.4
```

Relaunching the shell and running `create bobsDNS` again resumes the same authority (same
identity, same data, under `.hyperdns/`). Anyone else resolves from it with its link
(`resolve blog@hg:...`, printed by `link`), which joins it read-only. Run `help` for every command;
**see `docs/SHELL_GUIDE.md` for a full walkthrough.**

## Library

`src/` runs on Node and Bare and requires nothing: hand it your `hypergraph/next` instance.

```js
const { createAuthority, resolveAddress } = require('hyperdns')
const { dns, link } = await createAuthority('bobsDNS', { hg })   // a public space; link: hg:<key>
await dns.publish('blog', { type: 'hyper', value: 'hg:...' })
await resolveAddress(`blog@${link}`, { hg: someoneElsesHg })     // { records, path, authority }
// errors: err.code UNKNOWN_AUTHORITY | AMBIGUOUS_AUTHORITY | UNKNOWN_NAME | UNAVAILABLE
```

Tests: `npm test` (Node), `npm run test:bare` (the library on Bare), `npm run test:network` (public DHT).

---

## Docs

- docs/ARCHITECTURE.md
- docs/HYPERDNS_SCHEMA.md
- docs/INVARIANTS.md
- docs/REPLICATION.md
- docs/NETWORKING.md
- docs/ADDRESSING.md
- docs/SHELL_GUIDE.md
- docs/PRIVACY.md
- DECISIONS.md
- WORKFLOW.md

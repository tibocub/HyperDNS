# HyperDNS

### Overview

HyperDNS is a peer-to-peer, federated naming system built on [Holepunch](https://github.com/holepunchto) primitives (Hypercore, Hyperswarm, Hyperbee...). It allows applications to resolve human-readable names into addresses or hashes (hyperdrive key, IP address, hyperswarm topic...) without relying on centralized DNS authorities.

Central authority sucks, but making a community-based DNS breaks a bit the purpose of a DNS which is to make a resource easy to access. So joining manually a HyperDNS community to be able to reach its addresses doesn't sound optimal.

We can still manage to make a kinda universal source of truth without trusting everyone by making hyperDNS instances able to talk to each others like email servers or the fediverse. If a hyperDNS address is composed of the DNS address + it's domain name. For example "hyper://bobsDNS@blog.bob" would resolve to the dns record of "blog.bob" into the "bobsDNS" hyperDNS instance.

- DNS addresses are derived from their name so they are deterministic and immutable (so no need for a public record of DNS addresses)
- users can join and create hyperDNS instances, which replicates locally all their records
- resolving an address from other instances you're not member of will only sparse-replicate the resolved records

### Goals

* Decentralized naming system
* Federated moderation (no global authority)
* Any address is accessible even without being member of a DNS instance
* Embeddable SDK for developers (give the holepunch ecosystem a hyperdns module)
* Local daemon for system-wide resolution
* Browser integration via extensions

### Non-Goals

* Perfect global consensus
* Full DNS replacement

### Core Concepts

* Identity = public key
* Community = moderation boundary
* Record = signed entry in append-only log
* Resolution = trust-based aggregation

---

## Docs

- docs/ARCHITECTURE.md
- WORKFLOW.md
- docs/HYPERDNS_SCHEMA.md
- docs/INVARIANTS.md
- DECISIONS.md

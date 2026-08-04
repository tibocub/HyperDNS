# Addressing (HyperDNS)

This is the settled, authoritative reference for HyperDNS's address format. `src/address.js`
(`parseAddress`/`resolveAddress`) is the implementation; this document explains the grammar and
the reasoning behind it.

## Grammar

```
[hyperdns://]<name>@<authority>[/<path>]
```

- **`name`** — the record name to resolve (e.g. `blog`, `forum`, `bobs-blog`). No `/`, `@`, or
  whitespace.
- **`authority`** — which HyperDNS authority to resolve `name` within (e.g. `bobsDNS`,
  `my-dns`). No `/`, `@`, or whitespace. This is what selects (and, via
  `network/topic.js`'s deterministic topic derivation, discovers) the specific community/instance
  — see `docs/NETWORKING.md`.
- **`hyperdns://`** — an optional, ignorable scheme prefix. Never required; useful mainly for a
  browser/link context. Case-insensitive.
- **`path`** — everything after the first `/` following the authority. Entirely optional, and
  deliberately **opaque to HyperDNS itself** — see below for why. Returned as-is, never parsed
  or given structure here.

Examples:

```
blog@bobsDNS
hyperdns://blog@bobsDNS
forum@my-dns/posts
forum@my-dns/post/1a0e0f168ab42de514f92cb95bd640ac599c43af9efbde0a14c81faa16bb0fe8/8
```

## Why `name@authority`, not `authority@name`

Settled on the same order real email addresses use — the specific part first (`user@`), the
broader namespace second (`@domain`) — matching how `parseAddress`/`resolveAddress` were
actually implemented and tested from early on. `authority@name` (the reverse order) appeared in
some earlier drafts of other docs in this repo, inspired by how DNS names themselves read
right-to-left in specificity (`blog.example.com` resolves root → `com` → `example` → `blog`,
opposite of email's left-to-right specific-to-general). That reversed convention was never
actually implemented, and email's ordering is the more intuitive fit here — an authority in
HyperDNS is closer to "which mail server" than "which zone in a hierarchy", so this project
uses email's order, not DNS's.

## Why the trailing path is opaque, not something HyperDNS interprets

HyperDNS resolving `name@authority` gives back a record — a `{ type, value, ttl? }` — and stops
there. The path, if present, is handed back unmodified for the *caller* to make sense of. This
is deliberate, not an oversight: there are two real, different consumers that both need paths to
mean nothing in particular at this layer, and giving either one meaning here would break the
other:

1. **Hypergraph's own entity addressing.** A hypergraph entity id is already a path-shaped
   string: `type/authorCoreKeyHex/seq` (e.g.
   `post/1a0e0f168ab42de514f92cb95bd640ac599c43af9efbde0a14c81faa16bb0fe8/8`). A record whose
   value points at a hypergraph context can have a *specific entity within that context*
   addressed directly by appending its id as the path:
   `forum@my-dns/post/1a0e0f168ab42de514f92cb95bd640ac599c43af9efbde0a14c81faa16bb0fe8/8`.
2. **An application's own dynamic routing.** HyperBBS plans to use paths under a resolved
   address for its own routing — e.g. `forum@my-dns/posts` listing every post in that forum.
   This has nothing to do with hypergraph's own entity-id shape; it's HyperBBS's own convention,
   layered on top.

Both are legitimate, and neither is HyperDNS's concern. `resolveAddress()` returns
`{ records, path }` precisely so a caller gets everything needed to keep going, without
HyperDNS ever having decided what "going" means.

An earlier draft of `docs/NETWORKING.md` sketched a *third*, different scheme
(`hyper://myDNS/my-blog/post/23`, no `@` at all) for a similar idea. It's been removed — it
would have collided with hypergraph's own `type/author/seq` shape instead of being able to embed
it directly, which is exactly the compatibility this format is trying to preserve.

## What HyperDNS deliberately does NOT do (yet, or at all)

A few real-DNS concepts worth knowing about, and why HyperDNS currently does or doesn't have an
equivalent:

- **CNAME (aliasing one name to another).** Real DNS lets one name point at another name rather
  than a final value, with the resolver following the chain. HyperDNS doesn't have this yet, but
  nothing about the record schema (`{ type, value, ttl? }`) prevents adding it later as its own
  record `type` (e.g. `type: 'alias'`, `value` being another full `name@authority` address, with
  `resolve()` optionally following it). Worth considering if aliasing/redirection becomes a real
  need, but out of scope for settling the address format itself.
- **Delegation (NS records — a zone handing authority for a subdomain to different servers).**
  HyperDNS's "federation" goal (see `README.md`) is the loose analog — one authority's members
  resolving another authority's records — but there's no delegation *within* a single authority
  (no "subdomain of an authority" concept). Every name lives directly in exactly one authority;
  see `docs/INVARIANTS.md` ("Resolution must NOT mix multiple contexts").
- **TTL / caching.** Already present — `HYPERDNS_SCHEMA.md`'s record shape has an optional `ttl`.
  Nothing in `resolve()` currently *acts* on it (no cache layer yet), but the field exists for
  when one does.
- **Case sensitivity.** Real DNS names are conventionally case-insensitive. HyperDNS names and
  authorities are currently treated as opaque, case-sensitive strings — not addressed here;
  worth a deliberate decision later if it becomes a real point of confusion (e.g. `BobsDNS` vs
  `bobsdns` being treated as different authorities today).

# Addressing

Implemented by `parseAddress` and `resolveAddress` in `src/address.js`.

## Grammar

```
[hyperdns://]<name>@<authority>[/<path>]
```

- **`name`**: the record name (`blog`, `forum`). No `/`, `@` or whitespace.
- **`authority`**: the name of an authority you hold (`bobsDNS`), or its link (`hg:<key>`), which reaches any
  authority and joins it read-only if needed. No `/`, `@` or whitespace. See [NETWORKING.md](NETWORKING.md).
- **`hyperdns://`**: optional prefix, case-insensitive, ignored.
- **`path`**: everything after the first `/` following the authority. Optional and returned as-is.

Leading and trailing whitespace is trimmed. A second `@` anywhere is an error.

```
blog@bobsDNS
blog@hg:oxkj3m3rgtjki5oqdggrmcj9zin1rnz4rkifuxhdxnidf6sy9cpy
hyperdns://blog@bobsDNS
forum@my-dns/posts
forum@my-dns/post/1a0e0f168ab42de514f92cb95bd640ac599c43af9efbde0a14c81faa16bb0fe8/8
```

## Why `name@authority`

Email order: the specific part first, the namespace second. An authority is closer to "which mail server" than to
a zone in a DNS hierarchy.

## Why the path is opaque

HyperDNS resolves `name@authority` to records and stops. The path goes back to the caller unparsed because two
different users need it to mean different things:

1. **Hypergraph entity ids.** An id is already path-shaped (`type/author/seq`), so a record pointing at a graph
   can have one entity in it addressed directly: `forum@my-dns/post/<author>/8`.
2. **An app's own routing.** HyperBBS can route `forum@my-dns/posts` however it likes.

Giving the path a meaning here would break one of them.

## What HyperDNS does not do

- **Aliases (CNAME).** Not built. The record shape allows it later as its own `type` whose value is another
  address.
- **Delegation (NS).** No sub-authorities: every name lives in exactly one authority, and resolution never mixes
  authorities ([INVARIANTS.md](INVARIANTS.md)).
- **TTL caching.** Records carry an optional `ttl`; nothing caches on it yet.
- **Case folding.** Names and authority names are case-sensitive: `BobsDNS` and `bobsdns` are different.

Errors from `resolveAddress` are listed in [API.md](API.md).

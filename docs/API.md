# Library API

`require('hyperdns')` (`src/index.js`). No dependencies; Node and Bare. Every function takes the caller's
`hypergraph/next` instance (`hg`) or one of its spaces. HyperDNS never opens, connects or closes them.

## Authorities

### `createAuthority(name, { hg, private })` → `{ space, dns, link }`

Creates an authority: a new space of `hg`, owned by `hg`'s identity, with the `hyperdns/record` type.

- `private` (default `false`): a private space. Records are sealed, members join by invite only, `link` is `null`.
- Public by default: the space is made public and `link` is its public link (`hg:<key>`).
- `dns` is a `HyperDNS` bound to the space.

### `joinAuthority(link, { hg, timeout })` → `{ space, dns }`

Joins by a public link or an invite link. A link to a space `hg` already holds returns that space. Joining by
public link writes nothing; publishing still needs `dns.publish`. `timeout` (ms) is passed to
`hg.redeemInvite`. Errors are hypergraph's (`INVITE_INVALID`, `INVITE_USED_UP`...).

## Names

### `publish(name, record, { space })` → `{ name, type, value, ttl?, id }`

Writes a record into `space`, signed by `hg`'s own identity (there is no author option).

- `record.type` (required, non-blank string): the DNS record type (`A`, `TXT`, `hyper`...).
- `record.value` (required, non-blank string).
- `record.ttl` (optional, unsigned integer): stored and returned; nothing acts on it yet.

Only members whose role holds `dns.publish` may publish; others get hypergraph's `NOT_ALLOWED`.

### `resolve(name, { space, timeout })` → `[{ type, value, ttl? }]`

Every record named `name` in `space`, deduplicated by type and value and sorted by type then value. Reads that one
space only. `timeout` (ms) waits that long for records known to exist but not yet arrived; without it, answers
from what is held now.

### `resolve.lookup(name, { space, timeout })` → `{ records, complete }`

Same as `resolve`, plus `complete: false` when some records are known but not yet arrived.

### `parseAddress(address)` → `{ name, dns, path }`

Parses `[hyperdns://]name@authority[/path]` (see [ADDRESSING.md](ADDRESSING.md)). `dns` is the authority part;
`path` is the text after the first `/`, or `null`. Throws `Invalid address format` on anything else.

### `resolveAddress(address, { hg, timeout })` → `{ records, path, authority }`

Parses the address, finds the authority and resolves the name in it.

- The authority is a link (joined if `hg` doesn't hold it yet) or the name of an authority `hg` holds.
- `timeout` (ms, default `10000`): how long to wait for the authority's holders.
- `authority` in the result is the key of the space that answered; `path` is returned unparsed.

Errors carry `err.code`:

| code | meaning |
|---|---|
| `UNKNOWN_AUTHORITY` | no held authority has that name, or the link isn't a readable HyperDNS authority |
| `AMBIGUOUS_AUTHORITY` | two held authorities share that name: use the link |
| `UNKNOWN_NAME` | the authority has no such name |
| `UNAVAILABLE` | the name or authority may exist, but nobody holding it is online |

## Classes

### `new HyperDNS({ space })`, `createDNS({ space })`

A `HyperDNS` bound to one space, with `resolve(name, opts)` and `publish(name, record, opts)`: the functions above
with `space` filled in. `createDNS` is the same as `new HyperDNS`.

## Constants

- `RECORD_TYPE`: `'hyperdns/record'`, the record type every authority has.
- `PUBLISH_PERMISSION`: `'dns.publish'`, the permission a role needs to publish.

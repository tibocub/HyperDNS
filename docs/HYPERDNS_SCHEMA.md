# HyperDNS schema

On hypergraph's new core (`hypergraph/next`), since spec 001. Before that (v1): `domain` and `record` entities,
a `name:<name>` tag and a `has_record` edge, see `DECISIONS.md`.

## An authority is a space

One space per authority (`hg.createSpace({ name, types })`): its members, roles, moderators and records. Its key
(a short string) is the authority's identity; its name is the human label (`bobsDNS`), not unique.

- **public** (the default): `space.makePublic()`. Anyone with its link (`space.publicLink()`, `hg:<key>`) joins with
  no decision; joining writes nothing.
- **private** (`{ private: true }`): sealed records, members let in by invite links. See `PRIVACY.md`.

## The record type

`hyperdns/record` (`src/schema.js`):

| field | kind | |
|---|---|---|
| `name` | string | the name resolved (`blog`); indexed |
| `kind` | string | the DNS record type (`A`, `TXT`, `hyper`...); `type` is taken by hypergraph's record itself |
| `value` | string | |
| `ttl` | uint | optional |

`put: { permission: 'dns.publish' }`: only members whose role has `dns.publish` publish. The owner has every
permission; give it to others with a role of yours:

```js
await space.defineRole('publisher', ['post', 'dns.publish'])
await space.setRole(identity, 'publisher')
```

Anyone else's `publish()` is refused (`NOT_ALLOWED`), and a record from a modified app is ignored by every member.
Taking the permission away keeps what they published up to then (hypergraph's cut), not after.

## Name resolution model

- A name resolves to every record of that name in one space (several publishers may claim the same name).
- `resolve()` returns `{ type, value, ttl? }`, deduplicated by type and value, sorted by type then value.
- Moderation is the space's: a record its moderators hide or remove (`moderateAction`) is out.
- A record its author deleted is out.
- Never two spaces at once: `resolve()` reads the one space it is given.

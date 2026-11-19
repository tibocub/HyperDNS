# Private Authorities (HyperDNS)

`createAuthority(name, { hg, private: true })` (`src/authority.js`) makes the authority a **private space** of
`hypergraph/next`.

## What it gives

- **Members only.** Nobody gets in without an invite link (`space.createInvite()`, redeemed with `joinAuthority(link)`
  or the shell's `join`); a member able to let people in must be online. It has no public link.
- **Sealed records.** Record fields (name, type, value) are sealed with a key only members' devices receive; whoever
  relays or stores it without being let in reads nothing.
- **Encrypted on disk**: its members, record types and timing are hidden from whoever stores
  it without being let in.
- **Removal.** A removed member (`space.removeRole`) can't read what is published after; what came before stays
  readable to them.
- A stranger holding only its key gets no answer at all: `resolveAddress` says `UNAVAILABLE`, as if nobody were
  online.

## What it doesn't

- Members see who published and when (hypergraph's limit: authors and timing of records stay visible to members).
- A removed member keeps what they read before.

Limits and design: hypergraph's `docs/next/concepts.md` ("Sub-spaces and private spaces") and its
`specs/022-sealed-places/`.

## Usage

```js
const { space, dns } = await createAuthority('secretDNS', { hg, private: true })
await dns.publish('blog', { type: 'hyper', value: 'hg:abc' })
const invite = await space.createInvite()            // send it to someone
// on their side:
const { dns: theirs } = await joinAuthority(invite, { hg: theirHg })
await theirs.resolve('blog')                         // once it has arrived
```

Shell: `create <name> --private`, `invite`, `join <link>`. See `docs/SHELL_GUIDE.md`.

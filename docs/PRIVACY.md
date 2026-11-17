# Private Authorities (HyperDNS)

This is the settled reference for HyperDNS's private authority feature. `src/authority.js`
(`createAuthority()`'s `opts.private`, `joinAuthority()`, `grantAccess()`) is the
implementation; this document explains the design and, just as importantly, what it does
**not** protect.

## The two-layer model

A private authority combines two independent protections - neither one alone would match
what "private" needs to mean here:

1. **Topic secrecy.** A normal authority's network topic is `deriveAuthorityTopic(name)` - a
   deterministic hash of its public name (see `docs/NETWORKING.md`). Anyone who knows or
   guesses the name can compute the same topic and connect. A private authority instead uses
   a **randomly-generated topic**, carried in its descriptor, never derivable from the name at
   all. Reaching it - even just connecting to it - requires the descriptor, not the name.
2. **Content encryption.** Every record published in a private authority is automatically
   encrypted via a `ScopeBase` scope (see hypergraph's own `docs/read-permission.md`). The
   owner is granted the scope's key on creation; nobody else can decrypt a record's value
   until explicitly `grantAccess()`-ed.

Together: even if a private authority's descriptor leaks (a careless share, a compromised
device), record *values* stay unreadable without a separate, explicit grant. Topic secrecy is
the primary defense (most people never even find the rendezvous point); content encryption is
defense in depth (protects the payload even if that defense is breached).

## What this does NOT protect - a hard limit, not an oversight

**Record names, who published them, and when, remain visible to anyone who has the
descriptor** - joined or not, granted or not. This follows directly from hypergraph's own
documented limit (`docs/read-permission.md`): a `ScopeBase` scope encrypts a record's content
body only. `contentType`, and all of an entity's type/author/timestamp/relations, stay in the
clear - encrypting that structure too would break hypergraph's indexing/query model entirely.
HyperDNS's own name lookup is tag-based (`name:<name>`, see `docs/HYPERDNS_SCHEMA.md`), and
tag strings are the context view's own index keys - there is no way to encrypt them without
losing the ability to look anything up by name at all.

Concretely: someone who obtains a private authority's descriptor (even without ever being
granted scope access) can see that a domain named `blog` exists, who published it, and when -
they just can't read what `blog` currently resolves *to* without a grant. If hiding the
existence of activity itself - not just its content - is ever required, that's a
fundamentally different, much harder design problem than this system currently addresses (see
hypergraph's own framing of the same limit).

## What NOT to encrypt: public/open authorities stay exactly as they are

Private mode is opt-in (`opts.private`) precisely because encrypting a public authority's
records would provide no real security benefit - anyone can already read them, by design. See
hypergraph's own `docs/read-permission.md`: *"If a context is open-mode... encrypting its
regular content provides no real security benefit — anyone can trivially become a participant
and receive the same key."* A normal, public HyperDNS authority is unaffected by any of this;
`publish()`/`resolve()` behave exactly as before this feature existed.

## Encryption is not, and should not be, how HyperDNS proves ownership

Worth stating explicitly, since it came up while designing this: encryption (confidentiality -
"only Bob can read this") and cryptographic ownership proof (authenticity - "this was
definitely written by Alice") are independent primitives. HyperDNS already has strong,
signature-based ownership proof on every event, enforced at apply time, with no dependency on
encryption at all - see `DECISIONS.md`'s entries on relation `from`-ownership and moderation
timestamp forgery for concrete examples of exactly this being audited and fixed. A public
authority's records don't need encryption to prove who published them; they already do,
today, via signatures.

## Usage

```js
const owner = await createAuthority('secretDNS', { store, private: true })
await owner.dns.publish('blog', { type: 'hyper', value: 'hyper://abc123' })
// owner can already resolve their own record - auto-granted on creation

// share owner.descriptor with a specific person, out-of-band (this is what
// reaching the authority at all requires, private or not)
const peer = await joinAuthority(descriptor, { store: peerStore })
// peer.dns.resolve('blog') returns [] right now - joined, but not granted

// the recipient shares both of their public keys (their shell's "whoami"
// prints these) with the owner, out-of-band
await owner.grantAccess(peerPubkeyHex, peerEncryptionPubkeyHex)
// peer.dns.resolve('blog') now returns the record correctly
```

In the shell: `create <name> --private`, `whoami` (prints your own keys to hand to a granter),
`grant <pubkey> <encryption-pubkey>` (owner-side, or anyone with `scope.grant`). See
`docs/SHELL_GUIDE.md`.

## Known limitation: no invite-code flow yet

`grantAccess()` requires the granter to already know the recipient's public keys - there is no
way yet to invite someone who isn't already a known participant. This is a real, acknowledged
gap, not something silently skipped: hypergraph's own `docs/read-permission.md` already
identifies [`blind-pairing`](https://github.com/holepunchto/blind-pairing) as the intended
direction for this (the same primitive underlying
[`autopass`](https://github.com/holepunchto/autopass)'s `createInvite()`/`pair()` flow), but
explicitly notes it "isn't implemented in Hypergraph yet." Integrating it is genuine,
undesigned hypergraph-level work - out of scope for this round, tracked here so it isn't
forgotten.

## See Also

- [Addressing](ADDRESSING.md) - the `name@authority` grammar this builds on
- [Networking](NETWORKING.md) - topic derivation, and how a public authority's context is
  discovered by a peer with no prior knowledge (the mechanism a private authority deliberately
  does not use)
- hypergraph's `docs/read-permission.md` - the underlying `ScopeBase` mechanism this is built
  on, including what it can and can't hide, and its own honest limitations section

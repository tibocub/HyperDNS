# HyperDNS Shell — Usage Guide

## Starting it

```
npm run shell
```

This launches one long-running process with a `hyperdns >` prompt. Type commands directly
(`create`, `publish`, `resolve`, ...) — there's no `hyperdns` prefix to type, since the whole
process is already HyperDNS-specific. Run `help` any time for the full command list.

## The most important thing to understand: "current authority"

The shell holds **exactly one authority at a time** — whichever one you most recently `create`d
or `join`ed. Every other command (`publish`, `resolve`, `status`, `connect`, `descriptor`)
operates on that one. There's no way to juggle two authorities in the same shell process.

**This means testing locally with two peers needs two separate terminals/processes** — one
shell acting as the owner, a second, separate shell acting as the joining peer. Running both
`create` and `join` in the *same* shell session doesn't give you two peers; it just switches
which single authority that one shell is currently pointed at.

## `name` is a name, not a path

```
create bobsDNS        # right
create ./some/path    # wrong - this is NOT how you point at existing data
```

`create <name>` takes a short, human-chosen label (letters/numbers/`-`/`_`) for a *new or
already-yours* authority — not a file path. If you run `create` with the same name again later
(even in a different shell process), it resumes the authority you already have locally, rather
than making a new one — that's the mechanism for "reopening what I already have," not passing
it a path.

## Testing two peers on one machine (or two)

**Terminal 1 — the owner:**
```
hyperdns > create bobsDNS
created authority "bobsDNS"
  local data: /path/to/HyperDNS/.hyperdns/owned/bobsDNS
hyperdns:bobsDNS (offline) > connect
connecting...
connected
hyperdns:bobsDNS (offline online) > descriptor
{ ... prints JSON ... }
```

Copy that JSON, or note the path it's saved to
(`.hyperdns/owned/bobsDNS/descriptor.json` on the owner's machine).

**Terminal 2 — a separate peer (can be the same machine, a different directory, or a different
machine entirely):**
```
hyperdns > join /path/to/that/descriptor.json
joined authority "bobsDNS"
  local data: /path/to/HyperDNS/.hyperdns/joined/bobsDNS
hyperdns:bobsDNS (offline) > connect
connecting...
connected
```

Once both sides show `connect`ed, publishing on one and resolving on the other should work:

```
# owner:
hyperdns:bobsDNS (online) > publish blog A 1.2.3.4
published blog -> A 1.2.3.4

# peer, after a moment for it to replicate:
hyperdns:bobsDNS (online) > resolve blog
  A  1.2.3.4
```

`join` currently always needs an explicit descriptor (a file path, or the JSON itself) — there's
no way yet to resolve `name@authority` from just the authority's name without one. That's a
real, bigger feature (see `docs/NETWORKING.md`'s "Mode B: Query mode") that isn't built yet.

## `connect` — what to actually expect

- It's **safe to run more than once** — if already connected, it just says `already connected`
  and does nothing further.
- **It can be slow, especially with nobody else to connect to.** With zero peers around,
  `connect` goes through a real discovery/retry cycle before giving up and reporting itself
  connected anyway (with `0` connections) — this can take up to roughly a minute or two in the
  worst case. It is not designed to fail fast when alone; it's designed to keep trying.
- Check `status` afterward — `network: online (N connection(s))` is what actually tells you
  whether a peer was found, not just whether `connect` finished.

## `resolve` — bare names vs. full addresses

`resolve` accepts either a bare record name (resolved on whatever authority is currently
loaded) or a full `name@authority` address (see `docs/ADDRESSING.md` for the full grammar,
including an optional trailing path):

```
hyperdns:testdns (online) > resolve testrec
  hyper  hyper://123abc
hyperdns:testdns (online) > resolve testrec@testdns
  hyper  hyper://123abc
```

Right now, `resolve name@authority` only works if `authority` is the one currently loaded (you
get a clear error otherwise) — resolving from an authority you haven't `join`ed yet isn't built
yet (see `docs/NETWORKING.md`'s "Mode B: Query mode").

## `status` field reference

```
authority:  <the authority's name>
role:       owner | member | unknown (not yet synced with the authority)
identity:   <your own public key for this authority>
context:    <the context key records live in>
network:    offline | online (N connection(s))
local data: <where this authority's data is stored on disk>
```

`role: unknown (not yet synced with the authority)` is normal right after joining and before
you've ever connected — the RoleBase registry (who owns what) is itself data that has to
replicate in, same as anything else. It resolves to `member` (or `owner`) once you've connected
and it's had a chance to sync.

## Where things are stored

```
.hyperdns/
  owned/<name>/    - authorities this identity created
  joined/<name>/   - authorities this identity has joined
    store/                  - the actual Corestore data
    descriptor.json          - shareable - hand this to others via "join"
    identity-secret.json     - NOT shareable - this identity's private key material
```

`owned` and `joined` are kept separate deliberately: an authority you created and a locally
joined copy of the same authority are two different local identities, and need two different
directories even if they share a human-chosen name.

`.hyperdns/` is gitignored — it's per-machine local state, not something to commit.

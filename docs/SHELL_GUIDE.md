# HyperDNS Shell — Usage Guide

## Starting it

```
npm run shell
```

One long-running process with a `hyperdns >` prompt. Type commands directly (`create`, `publish`, `resolve`...).
`help` lists them all.

## One identity, many authorities, one "current"

The shell opens one hypergraph instance in `.hyperdns/hg/`: your identity and every authority you created or
joined. One of them is **current**: the one `publish`, bare-name `resolve`, `status`, `link` and `invite` act on.
`create <name>` (yours) and `use <name>` (any you hold) switch it. `resolve name@authority` works on any authority,
current or not.

Testing two peers on one machine needs two shells in two different folders (each has its own `.hyperdns/`).

## `name` is a name, not a path

```
create bobsDNS        # right
create ./some/path    # wrong
```

`create` with a name you already created resumes that authority (same identity, same data).

## Two peers

**Terminal 1 — the owner:**
```
hyperdns > create bobsDNS
created authority "bobsDNS"
  anyone resolves from it with its link: hg:oxkj3m3rgtjki5...
hyperdns:bobsDNS (offline) > connect
connected
hyperdns:bobsDNS (online) > publish blog A 1.2.3.4
published blog -> A 1.2.3.4
```

**Terminal 2 — anyone else, in another folder:**
```
hyperdns > connect
hyperdns > resolve blog@hg:oxkj3m3rgtjki5...
  A  1.2.3.4
hyperdns > resolve blog@bobsDNS
  A  1.2.3.4
```

The first `resolve` by link joins the authority (read-only: you may not publish there); from then on its name
works, and `use bobsDNS` makes it current. `join <link>` does the same joining without resolving.

## Letting others publish

The owner (and only members whose role has `dns.publish`) publish. There's no shell command for giving it yet;
see `docs/HYPERDNS_SCHEMA.md` for the two calls.

## `connect` / `disconnect`

`connect` goes online for every authority of the shell; safe to run again. `disconnect` goes offline (local data
kept). Resolving or joining by link goes online by itself.

## `resolve`

```
resolve testrec                 # the current authority
resolve testrec@testdns         # an authority you hold, by name
resolve testrec@hg:...          # any authority, by link
resolve forum@testdns/posts     # a trailing path is shown, never interpreted (docs/ADDRESSING.md)
```

Errors say which: no such authority here, no such name, nobody online who has it.

## Private authorities

```
hyperdns > create secretDNS --private
hyperdns:secretDNS (offline) > invite
hg:...
```

Send the invite link; the person runs `join <link>` while you (or another member able to let people in) are online.
See `docs/PRIVACY.md`.

## `status`

```
authority:  <name>
role:       owner | admin | ... | none (reading only)
private:    yes | no
identity:   <your identity key>
key:        <the authority's key>
network:    offline | online (N peer(s))
local data: <.hyperdns folder>
```

## Where things are stored

`.hyperdns/hg/`: hypergraph's instance folder (identity, every authority). Gitignored, per machine. Before spec 001
it held `owned/` and `joined/` folders with descriptors and identity seeds; those are not read any more (D2: no
migration).

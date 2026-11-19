# Architecture

Two layers.

## `src/`: the library

A protocol layer over a caller-given `hypergraph/next` instance. No dependencies, no networking, no lifecycle: the
caller opens, connects and closes hypergraph. Runs on Node and Bare (HyperBrowser uses it on Bare).

| file | does |
|---|---|
| `schema.js` | the `hyperdns/record` type and the `dns.publish` permission |
| `authority.js` | create, join and find authorities (spaces with that type) |
| `publish.js` | write a record |
| `resolve.js` | read every record of a name in one space, deterministically |
| `address.js` | parse and resolve `name@authority[/path]` |
| `HyperDNS.js`, `createDNS.js` | a handle bound to one space |
| `index.js` | the public exports ([API.md](API.md)) |

## `shell/` and `bin/cli.js`: the app

A REPL that opens one hypergraph instance in `.hyperdns/hg/` and keeps it connected between commands.
`shell/lib/session.js` holds the instance and the current authority; `shell/builtins/index.js` defines the
commands. See [SHELL_GUIDE.md](SHELL_GUIDE.md).

## Data flow

- **Publish:** `space.put('hyperdns/record', ...)`. Hypergraph signs it, checks `dns.publish`, and replicates it to
  the space's members.
- **Resolve:** query the space's index on `name`, drop duplicates, sort. One space, local data only, optionally
  waiting for records not yet arrived.
- **Trust:** the space's own roles and moderators, applied by hypergraph on every member.

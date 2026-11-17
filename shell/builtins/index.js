const c = require('ansi-colors')
const { resolveAddress } = require('../../src/address')

/**
 * Every command is `{ fn(args), help }` - `help` is the one-line description
 * shown by the `help` builtin, auto-generated from this object so a new
 * command only ever needs to be added here once.
 */
function createBuiltins (session) {
  function parseFlags (args) {
    const positional = []
    const flags = {}
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (arg.startsWith('--')) {
        const key = arg.slice(2)
        const next = args[i + 1]
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next
          i++
        } else {
          flags[key] = true
        }
      } else {
        positional.push(arg)
      }
    }
    return { positional, flags }
  }

  const builtins = {
    exit: {
      fn () { process.exit(0) },
      help: 'Exit the shell'
    },

    clear: {
      fn () { process.stdout.write('\x1b[2J\x1b[H') },
      help: 'Clear the terminal screen'
    },

    help: {
      fn () {
        const names = Object.keys(builtins).sort()
        const width = Math.max(...names.map((n) => n.length))
        console.log('')
        for (const name of names) {
          console.log(`  ${c.bold(name.padEnd(width))}  ${builtins[name].help}`)
        }
        console.log('')
      },
      help: 'List available commands'
    },

    create: {
      async fn (args) {
        const { positional, flags } = parseFlags(args)
        const name = positional[0]
        if (!name) throw new Error('usage: create <name> [--private]')

        const result = await session.create(name, { private: !!flags.private })

        console.log(result.resumed
          ? c.green(`resumed authority "${name}"`)
          : c.green(`created authority "${name}"`))
        console.log(c.dim(`  local data: ${result.dir}`))
        if (result.private) {
          console.log(c.dim('  private: only members read it - let people in with "invite"'))
        } else {
          console.log(c.dim(`  anyone resolves from it with its link: ${result.link}`))
        }
        if (!session.isOnline()) console.log(c.dim('  not connected yet - run "connect" to go online'))
      },
      help: 'Create a new DNS authority (or resume one this shell already created): create <name> [--private]'
    },

    join: {
      async fn (args) {
        const [link] = args
        if (!link) throw new Error('usage: join <link>')

        const result = await session.join(link)

        console.log(c.green(`joined authority "${result.name}"`))
        console.log(c.dim(`  local data: ${result.dir}`))
      },
      help: 'Join a DNS authority by its link or an invite link: join <link>'
    },

    use: {
      async fn (args) {
        const [name] = args
        if (!name) throw new Error('usage: use <name>')
        const result = await session.use(name)
        console.log(c.green(`using authority "${result.name}"`))
      },
      help: 'Switch to an authority this shell already created or joined: use <name>'
    },

    connect: {
      async fn () {
        if (session.isOnline()) {
          console.log(c.dim('already connected'))
          return
        }
        console.log(c.dim('connecting...'))
        await session.connect()
        console.log(c.green('connected'))
      },
      help: 'Connect to the network (every authority of this shell)'
    },

    disconnect: {
      async fn () {
        if (!session.isOnline()) {
          console.log(c.dim('not connected'))
          return
        }
        await session.disconnect()
        console.log(c.green('disconnected'))
      },
      help: 'Disconnect from the network (local data is kept)'
    },

    status: {
      async fn () {
        const current = session.get()
        if (!current) {
          console.log(c.dim('no authority loaded - use "create <name>", "join <link>" or "use <name>"'))
          return
        }
        const me = current.hg.identity.publicKey
        const role = await current.space.getRole(me)

        console.log(`  authority:  ${current.name}`)
        console.log(`  role:       ${role || 'none (reading only)'}`)
        console.log(`  private:    ${current.private ? 'yes' : 'no'}`)
        console.log(`  identity:   ${me}`)
        console.log(`  key:        ${current.space.key}`)
        console.log(`  network:    ${session.isOnline() ? `online (${current.space.peers().length} peer(s))` : 'offline'}`)
        console.log(`  local data: ${current.dir}`)
      },
      help: "Show the current authority's status"
    },

    whoami: {
      async fn () {
        const hg = await session.instance()
        console.log(`  identity: ${hg.identity.publicKey}`)
      },
      help: 'Show your own identity key'
    },

    link: {
      fn () {
        const current = session.requireCurrent()
        if (!current.link) throw new Error('this authority is private - it has no public link: let people in with "invite"')
        console.log(current.link)
      },
      help: "Print the current authority's link: anyone resolves from it with 'resolve <name>@<link>'"
    },

    invite: {
      async fn (args) {
        const { flags } = parseFlags(args)
        const current = session.requireCurrent()
        const link = await current.space.createInvite(flags.role ? { role: flags.role } : {})
        console.log(link)
        console.log(c.dim('  one use; the person runs "join <link>" (someone able to let them in must be online)'))
      },
      help: 'Create an invite link to the current authority (a private one, or a role): invite [--role <role>]'
    },

    publish: {
      async fn (args) {
        const { positional, flags } = parseFlags(args)
        const [name, type, value] = positional
        if (!name || !type || !value) throw new Error('usage: publish <name> <type> <value> [--ttl <seconds>]')

        const current = session.requireCurrent()
        const record = { type, value }
        if (flags.ttl) record.ttl = Number(flags.ttl)

        await current.dns.publish(name, record)
        console.log(c.green(`published ${name} -> ${type} ${value}`))
      },
      help: 'Publish a record on the current authority: publish <name> <type> <value> [--ttl <seconds>]'
    },

    resolve: {
      async fn (args) {
        const [input] = args
        if (!input) throw new Error('usage: resolve <name> | resolve <name@authority>')

        let records, path
        if (input.includes('@')) {
          // any authority: one held here by name, or any by its link
          ({ records, path } = await resolveAddress(input, { hg: await session.instance() }))
        } else {
          records = await session.requireCurrent().dns.resolve(input)
          path = null
        }

        if (records.length === 0) {
          console.log(c.dim(`no records found for "${input}"`))
          return
        }
        for (const record of records) {
          console.log(`  ${record.type}  ${record.value}${record.ttl !== undefined ? c.dim(`  (ttl: ${record.ttl})`) : ''}`)
        }
        if (path) {
          console.log(c.dim(`  (trailing path "${path}" is not interpreted by HyperDNS itself - see docs/ADDRESSING.md)`))
        }
      },
      help: "Resolve a name on the current authority, or name@authority on any (a held one's name, or a link): resolve <name>[@authority][/path]"
    }
  }

  return builtins
}

module.exports = createBuiltins

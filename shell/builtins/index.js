const c = require('ansi-colors')

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
        if (!name) throw new Error('usage: create <name> [--closed]')

        const contextOpts = flags.closed ? { writeMode: 'closed' } : undefined
        const result = await session.create(name, { contextOpts })

        console.log(result.resumed
          ? c.green(`resumed authority "${name}"`)
          : c.green(`created authority "${name}"`))
        console.log(c.dim(`  local data: ${result.dir}`))
        console.log(c.dim('  not connected yet - run "connect" to go online'))
      },
      help: 'Create a new DNS authority (or resume one this shell already created): create <name> [--closed]'
    },

    join: {
      async fn (args) {
        const [descriptorArg] = args
        if (!descriptorArg) throw new Error('usage: join <path-to-descriptor.json>')

        const result = await session.join(descriptorArg)

        console.log(c.green(`joined authority "${result.name}"`))
        console.log(c.dim(`  local data: ${result.dir}`))
        console.log(c.dim('  not connected yet - run "connect" to go online'))
      },
      help: 'Join a DNS authority from a shared descriptor file: join <path-to-descriptor.json>'
    },

    connect: {
      async fn () {
        const current = session.requireCurrent()
        if (current.network) {
          console.log(c.dim('already connected'))
          return
        }
        console.log(c.dim('connecting...'))
        await session.connect()
        console.log(c.green('connected'))
      },
      help: 'Connect the current authority to the network'
    },

    disconnect: {
      async fn () {
        const current = session.requireCurrent()
        if (!current.network) {
          console.log(c.dim('not connected'))
          return
        }
        await current.network.disconnect()
        console.log(c.green('disconnected'))
      },
      help: 'Disconnect the current authority from the network (local data is kept)'
    },

    status: {
      async fn () {
        const current = session.get()
        if (!current) {
          console.log(c.dim('no authority loaded - use "create <name>" or "join <path>"'))
          return
        }
        const myKey = current.graph.key.toString('hex')
        await current.graph.roleBase.update()
        const registry = await current.graph.roleBase.getRegistry()
        const role = registry ? (registry.members[myKey] || 'member') : 'unknown (not yet synced with the authority)'

        console.log(`  authority:  ${current.name}`)
        console.log(`  role:       ${role}`)
        console.log(`  identity:   ${myKey}`)
        console.log(`  context:    ${current.context}`)
        console.log(`  network:    ${current.network ? `online (${current.network.connections} connection(s))` : 'offline'}`)
        console.log(`  local data: ${current.dir}`)
      },
      help: 'Show the current authority\'s status'
    },

    descriptor: {
      fn () {
        const current = session.requireCurrent()
        console.log(JSON.stringify(current.descriptor, null, 2))
      },
      help: 'Print the current authority\'s descriptor, to share with others via "join"'
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
        const [name] = args
        if (!name) throw new Error('usage: resolve <name>')

        const current = session.requireCurrent()
        const records = await current.dns.resolve(name)

        if (records.length === 0) {
          console.log(c.dim(`no records found for "${name}"`))
          return
        }
        for (const record of records) {
          console.log(`  ${record.type}  ${record.value}${record.ttl !== undefined ? c.dim(`  (ttl: ${record.ttl})`) : ''}`)
        }
      },
      help: 'Resolve a name on the current authority: resolve <name>'
    }
  }

  return builtins
}

module.exports = createBuiltins

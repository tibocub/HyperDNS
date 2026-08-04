const test = require('brittle')
const Corestore = require('corestore')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { Hypergraph } = require('hypergraph')
const { createDNS, parseAddress, resolveAddress, publish } = require('../../src')

function makeTmp (prefix) {
  const tmpDir = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  return tmpDir
}

test('parseAddress parses and normalizes whitespace', async (t) => {
  t.alike(parseAddress('bobs-blog@bobsDNS'), { name: 'bobs-blog', dns: 'bobsDNS', path: null })
  t.alike(parseAddress('  a  @  b  '), { name: 'a', dns: 'b', path: null })

  t.exception(() => parseAddress('abc'), 'Invalid address format')
  t.exception(() => parseAddress('a@b@c'), 'Invalid address format')
  t.exception(() => parseAddress('@dns'), 'Invalid address format')
  t.exception(() => parseAddress('name@'), 'Invalid address format')
  t.exception(() => parseAddress(' @ '), 'Invalid address format')
})

test('parseAddress accepts an optional hyperdns:// scheme prefix', async (t) => {
  t.alike(parseAddress('hyperdns://bobs-blog@bobsDNS'), { name: 'bobs-blog', dns: 'bobsDNS', path: null })
  t.alike(parseAddress('HYPERDNS://bobs-blog@bobsDNS'), { name: 'bobs-blog', dns: 'bobsDNS', path: null }, 'the scheme prefix is case-insensitive')
})

test('parseAddress carries a trailing path through untouched, without ever interpreting it', async (t) => {
  // The path is deliberately opaque - it exists to let hypergraph's own
  // entity addressing (type/author/seq) and an app's own dynamic routing
  // (e.g. HyperBBS's own "list all posts" route) both use it validly,
  // without HyperDNS imposing any structure of its own on it.
  t.alike(
    parseAddress('forum@my-dns/post/1a0e0f168ab42de514f92cb95bd640ac599c43af9efbde0a14c81faa16bb0fe8/8'),
    { name: 'forum', dns: 'my-dns', path: 'post/1a0e0f168ab42de514f92cb95bd640ac599c43af9efbde0a14c81faa16bb0fe8/8' },
    'a hypergraph-style entity path is carried through as one opaque string'
  )
  t.alike(
    parseAddress('forum@my-dns/posts'),
    { name: 'forum', dns: 'my-dns', path: 'posts' },
    "an app's own single-segment route is carried through just as validly"
  )
  t.alike(
    parseAddress('hyperdns://forum@my-dns/post/1a0e.../8'),
    { name: 'forum', dns: 'my-dns', path: 'post/1a0e.../8' },
    'works the same with the scheme prefix present'
  )
  t.alike(parseAddress('forum@my-dns/'), { name: 'forum', dns: 'my-dns', path: null }, 'a trailing slash with nothing after it is no path at all, not an empty string')
})

test('parseAddress rejects whitespace inside name, and a path separator before the authority even starts', async (t) => {
  t.exception(() => parseAddress('fo/rum@my-dns'), 'Invalid address format')
  t.exception(() => parseAddress('fo rum@my-dns'), 'Invalid address format')
  // A slash right after '@' always starts the path by definition (that's
  // the whole grammar) - there's no way for the authority itself to
  // "contain" a slash that would need rejecting; this is a legitimate
  // parse, not an error.
  t.alike(parseAddress('forum@my/dns'), { name: 'forum', dns: 'my', path: 'dns' })
})

test('resolveAddress works with HyperDNS instance client', async (t) => {
  const tmpDir = makeTmp('hyperdns-test-resolveAddress-instance')

  const store = new Corestore(tmpDir)
  const graph = new Hypergraph(store)
  await graph.ready()

  t.teardown(async () => {
    await graph.close()
    await store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const author = graph.key.toString('hex')

  const roleKeyHex = await graph.createRoleBase()
  await graph.roleBase.init(author)

  const context = await graph.createContext()
  await graph.openContext(context)

  const dns = createDNS({ graph, context })

  await dns.publish('example', { type: 'A', value: '1.2.3.4' })
  await graph.update()

  const expected = [{ type: 'A', value: '1.2.3.4' }]

  const r1 = await resolveAddress('example@localDNS', {
    getAuthorityClient: async (dnsName) => {
      t.is(dnsName, 'localDNS')
      return dns
    }
  })

  const r2 = await resolveAddress('example@localDNS', {
    getAuthorityClient: async () => dns
  })

  t.alike(r1, r2)
  t.alike(r1, { records: expected, path: null })
})

test('resolveAddress returns the trailing path alongside the resolved records, unmodified', async (t) => {
  const tmpDir = makeTmp('hyperdns-test-resolveAddress-path')

  const store = new Corestore(tmpDir)
  const graph = new Hypergraph(store)
  await graph.ready()

  t.teardown(async () => {
    await graph.close()
    await store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const author = graph.key.toString('hex')
  await graph.createRoleBase()
  await graph.roleBase.init(author)
  const context = await graph.createContext()
  await graph.openContext(context)

  const dns = createDNS({ graph, context })
  await dns.publish('forum', { type: 'hyper', value: 'hyper://abc123' })
  await graph.update()

  const result = await resolveAddress('forum@localDNS/posts', {
    getAuthorityClient: async () => dns
  })

  t.alike(result, {
    records: [{ type: 'hyper', value: 'hyper://abc123' }],
    path: 'posts'
  })
})

test('resolveAddress works with raw graph/context client', async (t) => {
  const tmpDir = makeTmp('hyperdns-test-resolveAddress-raw')

  const store = new Corestore(tmpDir)
  const graph = new Hypergraph(store)
  await graph.ready()

  t.teardown(async () => {
    await graph.close()
    await store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const author = graph.key.toString('hex')

  const roleKeyHex = await graph.createRoleBase()
  await graph.roleBase.init(author)

  const context = await graph.createContext()
  await graph.openContext(context)

  await publish('example', { type: 'A', value: '1.2.3.4' }, { graph, context })
  await graph.update()

  const expected = [{ type: 'A', value: '1.2.3.4' }]

  const r1 = await resolveAddress('example@localDNS', {
    getAuthorityClient: async () => ({ graph, context })
  })

  const r2 = await resolveAddress('example@localDNS', {
    getAuthorityClient: async () => ({ graph, context })
  })

  t.alike(r1, r2)
  t.alike(r1, { records: expected, path: null })
})

test('resolveAddress errors are deterministic', async (t) => {
  await t.exception(async () => resolveAddress('example@localDNS'), 'getAuthorityClient is required')

  await t.exception(async () => resolveAddress('example@localDNS', {
    getAuthorityClient: async () => null
  }), 'Invalid authority client')
})

test('resolveAddress routes independently by authority (no accidental reuse)', async (t) => {
  const tmpDir1 = makeTmp('hyperdns-test-resolveAddress-dns1')
  const tmpDir2 = makeTmp('hyperdns-test-resolveAddress-dns2')

  const store1 = new Corestore(tmpDir1)
  const store2 = new Corestore(tmpDir2)

  const graph1 = new Hypergraph(store1)
  const graph2 = new Hypergraph(store2)

  await graph1.ready()
  await graph2.ready()

  t.teardown(async () => {
    await Promise.allSettled([
      graph1.close(),
      graph2.close(),
      store1.close(),
      store2.close()
    ])
    fs.rmSync(tmpDir1, { recursive: true, force: true })
    fs.rmSync(tmpDir2, { recursive: true, force: true })
  })

  const author1 = graph1.key.toString('hex')
  const author2 = graph2.key.toString('hex')

  const role1 = await graph1.createRoleBase()
  await graph1.roleBase.init(author1)

  const role2 = await graph2.createRoleBase()
  await graph2.roleBase.init(author2)

  const ctx1 = await graph1.createContext()
  const ctx2 = await graph2.createContext()

  await graph1.openContext(ctx1)
  await graph2.openContext(ctx2)

  const dns1 = createDNS({ graph: graph1, context: ctx1 })
  const dns2 = createDNS({ graph: graph2, context: ctx2 })

  await dns1.publish('example', { type: 'A', value: '1.1.1.1' })
  await dns2.publish('example', { type: 'A', value: '2.2.2.2' })

  await graph1.update()
  await graph2.update()

  const getAuthorityClient = async (dnsName) => {
    if (dnsName === 'dns1') return dns1
    if (dnsName === 'dns2') return dns2
    return null
  }

  const r1 = await resolveAddress('example@dns1', { getAuthorityClient })
  const r2 = await resolveAddress('example@dns2', { getAuthorityClient })

  t.alike(r1, { records: [{ type: 'A', value: '1.1.1.1' }], path: null })
  t.alike(r2, { records: [{ type: 'A', value: '2.2.2.2' }], path: null })
})

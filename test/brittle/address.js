const test = require('brittle')
const Corestore = require('corestore')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { Hypergraph } = require('../../../hyper-bbs/lib/hypergraph')
const { createDNS, parseAddress, resolveAddress, publish } = require('../../src')

function makeTmp (prefix) {
  const tmpDir = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  return tmpDir
}

test('parseAddress parses and normalizes whitespace', async (t) => {
  t.alike(parseAddress('bobs-blog@bobsDNS'), { name: 'bobs-blog', dns: 'bobsDNS' })
  t.alike(parseAddress('  a  @  b  '), { name: 'a', dns: 'b' })

  t.exception(() => parseAddress('abc'), 'Invalid address format')
  t.exception(() => parseAddress('a@b@c'), 'Invalid address format')
  t.exception(() => parseAddress('@dns'), 'Invalid address format')
  t.exception(() => parseAddress('name@'), 'Invalid address format')
  t.exception(() => parseAddress(' @ '), 'Invalid address format')
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
  await graph.openRoleBase(roleKeyHex)
  await graph.roleBase.init(author)

  const context = await graph.createContext()
  await graph.openContext(context)

  const dns = createDNS({ graph, context, author })

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
  t.alike(r1, expected)
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
  await graph.openRoleBase(roleKeyHex)
  await graph.roleBase.init(author)

  const context = await graph.createContext()
  await graph.openContext(context)

  await publish('example', { type: 'A', value: '1.2.3.4' }, { graph, context, author })
  await graph.update()

  const expected = [{ type: 'A', value: '1.2.3.4' }]

  const r1 = await resolveAddress('example@localDNS', {
    getAuthorityClient: async () => ({ graph, context })
  })

  const r2 = await resolveAddress('example@localDNS', {
    getAuthorityClient: async () => ({ graph, context })
  })

  t.alike(r1, r2)
  t.alike(r1, expected)
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
  await graph1.openRoleBase(role1)
  await graph1.roleBase.init(author1)

  const role2 = await graph2.createRoleBase()
  await graph2.openRoleBase(role2)
  await graph2.roleBase.init(author2)

  const ctx1 = await graph1.createContext()
  const ctx2 = await graph2.createContext()

  await graph1.openContext(ctx1)
  await graph2.openContext(ctx2)

  const dns1 = createDNS({ graph: graph1, context: ctx1, author: author1 })
  const dns2 = createDNS({ graph: graph2, context: ctx2, author: author2 })

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

  t.alike(r1, [{ type: 'A', value: '1.1.1.1' }])
  t.alike(r2, [{ type: 'A', value: '2.2.2.2' }])
})

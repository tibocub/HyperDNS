const test = require('brittle')
const Corestore = require('corestore')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { Hypergraph } = require('hypergraph')
const { createDNS } = require('../../src')

function makeTmp (prefix) {
  const tmpDir = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  return tmpDir
}

// Hypergraph derives authorship from the graph instance's own signing
// identity (`graph.identity.deviceKeyPair`) — it never reads a caller-supplied
// author string. createDNS/publish therefore MUST NOT require or depend on an
// `author` option: it has no effect on who actually signs the resulting
// entities, so requiring it only implies a control that doesn't exist.
test('createDNS/publish do not require an author option', async (t) => {
  const tmpDir = makeTmp('hyperdns-test-no-author')

  const store = new Corestore(tmpDir)
  const graph = new Hypergraph(store)
  await graph.ready()

  t.teardown(async () => {
    await graph.close()
    await store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const realAuthor = graph.key.toString('hex')

  await graph.createRoleBase()
  await graph.roleBase.init(realAuthor)

  const context = await graph.createContext()
  await graph.openContext(context)

  // No `author` passed anywhere.
  const dns = createDNS({ graph, context })

  await dns.publish('example', { type: 'A', value: '1.2.3.4' })
  const r = await dns.resolve('example')

  t.alike(r, [{ type: 'A', value: '1.2.3.4' }])
})

test('a caller-supplied author option has no effect on who signs the data', async (t) => {
  const tmpDir = makeTmp('hyperdns-test-author-ignored')

  const store = new Corestore(tmpDir)
  const graph = new Hypergraph(store)
  await graph.ready()

  t.teardown(async () => {
    await graph.close()
    await store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const realAuthor = graph.key.toString('hex')
  const impersonated = 'ff'.repeat(32)

  await graph.createRoleBase()
  await graph.roleBase.init(realAuthor)

  const context = await graph.createContext()
  await graph.openContext(context)

  // A bogus/impersonated author is accepted without error...
  const dns = createDNS({ graph, context, author: impersonated })
  await dns.publish('example', { type: 'A', value: '1.2.3.4' })

  // ...but the data is still signed by the graph's real identity, not the
  // impersonated string.
  const domains = []
  for await (const node of graph.getByTag('name:example', {})) {
    domains.push(node)
  }

  t.is(domains.length, 1)
  t.is(domains[0].author, realAuthor)
  t.not(domains[0].author, impersonated)
})

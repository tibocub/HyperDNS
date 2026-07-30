const test = require('brittle')
const Corestore = require('corestore')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { Hypergraph } = require('hypergraph')
const { createDNS } = require('../../src')

test('factory creates working instance', async (t) => {
  const tmpDir = path.join(os.tmpdir(), `hyperdns-test-factory-${process.pid}-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })

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

  const dns = createDNS({
    graph,
    context
  })

  await dns.publish('example', {
    type: 'A',
    value: '1.2.3.4'
  })

  const r = await dns.resolve('example')

  t.alike(r, [
    { type: 'A', value: '1.2.3.4' }
  ])
})

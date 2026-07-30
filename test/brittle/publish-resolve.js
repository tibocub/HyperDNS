const test = require('brittle')
const Corestore = require('corestore')
const crypto = require('hypercore-crypto')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { Hypergraph } = require('hypergraph')
const publish = require('../../src/publish')
const resolve = require('../../src/resolve')

test('hyperdns: publish then resolve', async (t) => {
  const tmpDir = path.join(os.tmpdir(), `hyperdns-test-publish-resolve-${process.pid}-${Date.now()}`)
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

  const ctx = await graph.createContext()
  await graph.openContext(ctx)

  // publish() is the write primitive
  await publish('example', { type: 'A', value: '1.2.3.4' }, { graph, context: ctx })

  await graph.update()

  const r1 = await resolve('example', { graph, context: ctx, trustedModerators: [] })
  const r2 = await resolve('example', { graph, context: ctx, trustedModerators: [] })

  t.alike(r1, r2)
  t.alike(r1, [
    { type: 'A', value: '1.2.3.4' }
  ])
})

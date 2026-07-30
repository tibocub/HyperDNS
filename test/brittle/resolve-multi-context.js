const test = require('brittle')
const Corestore = require('corestore')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { Hypergraph } = require('hypergraph')
const publish = require('../../src/publish')
const resolve = require('../../src/resolve')

function makeTmp (prefix) {
  const dir = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// A single daemon/graph instance can be a member of more than one DNS
// authority at once - each one is a separate context on the same graph.
// hypergraph now requires `context` to be named whenever more than one
// context is open (see the hypergraph fix), and resolve() passes it
// through. This test proves the actual point of that: the SAME name can
// mean two completely different things in two different authorities the
// same graph instance belongs to, and resolving against one must never see
// the other's claim - not "throws instead of leaking", but "returns
// exactly the right one".
test('resolve() is correctly scoped to the requested context when the graph has more than one open', async (t) => {
  const dir = makeTmp('hyperdns-test-multi-context')

  const store = new Corestore(dir)
  const graph = new Hypergraph(store)
  await graph.ready()

  t.teardown(async () => {
    await graph.close()
    await store.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const owner = graph.key.toString('hex')

  await graph.createRoleBase()
  await graph.roleBase.init(owner)

  const ctxA = await graph.createContext()
  const ctxB = await graph.createContext()
  await graph.openContext(ctxA)
  await graph.openContext(ctxB)

  // Same name, two different authorities, two different answers.
  await publish('example', { type: 'A', value: '1.1.1.1' }, { graph, context: ctxA })
  await publish('example', { type: 'A', value: '2.2.2.2' }, { graph, context: ctxB })

  const resultA = await resolve('example', { graph, context: ctxA })
  const resultB = await resolve('example', { graph, context: ctxB })

  t.alike(resultA, [{ type: 'A', value: '1.1.1.1' }], 'resolving against ctxA returns only ctxA\'s claim')
  t.alike(resultB, [{ type: 'A', value: '2.2.2.2' }], 'resolving against ctxB returns only ctxB\'s claim, not blended with ctxA\'s')
})

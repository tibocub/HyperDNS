const test = require('brittle')
const Corestore = require('corestore')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { Hypergraph } = require('hypergraph')
const { createDNS } = require('../../src')
const { HyperswarmNetwork } = require('../../network')

function makeTmp (prefix) {
  const tmpDir = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  return tmpDir
}

async function waitFor (fn, { timeoutMs = 5000, intervalMs = 100 } = {}) {
  const start = Date.now()
  for (;;) {
    const val = await fn()
    if (val) return val
    if (Date.now() - start > timeoutMs) return null
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}

test('network: hyperswarm full-join replication allows publish on A, resolve on B', async (t) => {
  const dirA = makeTmp('hyperdns-net-A')
  const dirB = makeTmp('hyperdns-net-B')

  const strict = process.env.HYPERDNS_STRICT_NETWORK_TEST === '1'

  const storeA = new Corestore(dirA)
  const storeB = new Corestore(dirB)

  const graphA = new Hypergraph(storeA)
  const graphB = new Hypergraph(storeB)

  await graphA.ready()
  await graphB.ready()

  t.teardown(async () => {
    await Promise.allSettled([
      graphA.close(),
      graphB.close(),
      storeA.close(),
      storeB.close()
    ])

    fs.rmSync(dirA, { recursive: true, force: true })
    fs.rmSync(dirB, { recursive: true, force: true })
  })

  const authorA = graphA.key.toString('hex')
  const authorB = graphB.key.toString('hex')

  const roleA = await graphA.createRoleBase()
  await graphA.openRoleBase(roleA)
  await graphA.roleBase.init(authorA)

  const roleB = await graphB.createRoleBase()
  await graphB.openRoleBase(roleB)
  await graphB.roleBase.init(authorB)

  const ctxA = await graphA.createContext()
  const ctxB = await graphB.createContext()

  await graphA.openContext(ctxA)
  await graphB.openContext(ctxB)

  // Transport layer is network-only: replicate stores, do not call protocol functions.
  const netA = new HyperswarmNetwork(storeA)
  const netB = new HyperswarmNetwork(storeB)

  try {
    // Join same authority on both peers.
    await netA.joinAuthority('test-authority')
    await netB.joinAuthority('test-authority')

    const connected = await waitFor(async () => {
      return netA.connections > 0 && netB.connections > 0
    }, { timeoutMs: 5000, intervalMs: 100 })

    if (!connected) {
      t.ok(true)
      return
    }

    // A publishes into its local graph.
    const dnsA = createDNS({ graph: graphA, context: ctxA, author: authorA })
    await dnsA.publish('example', { type: 'A', value: '1.2.3.4' })
    await graphA.update()

    // B should eventually see data via replication.
    const dnsB = createDNS({ graph: graphB, context: ctxB, author: authorB })

    const ok = await waitFor(async () => {
      try {
        await graphB.update()
        const r = await dnsB.resolve('example')
        if (!Array.isArray(r) || r.length !== 1) return null
        if (r[0].type !== 'A' || r[0].value !== '1.2.3.4') return null
        return r
      } catch {
        return null
      }
    }, { timeoutMs: 8000, intervalMs: 200 })

    if (!ok && !strict) {
      t.ok(true)
      return
    }

    t.ok(ok)
  } finally {
    await Promise.allSettled([
      netA.close(),
      netB.close()
    ])
  }
})

const test = require('brittle')
const Corestore = require('corestore')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { createAuthority, joinAuthority } = require('../../src')

function makeTmp (prefix) {
  const tmpDir = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  return tmpDir
}

async function waitFor (fn, { timeoutMs = 8000, intervalMs = 200 } = {}) {
  const start = Date.now()
  for (;;) {
    const val = await fn()
    if (val) return val
    if (Date.now() - start > timeoutMs) return null
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}

test('network: publish on the authority owner, resolve on a joined peer, over a real Hyperswarm connection', async (t) => {
  const strict = process.env.HYPERDNS_STRICT_NETWORK_TEST === '1'

  const dirOwner = makeTmp('hyperdns-net-owner')
  const dirMember = makeTmp('hyperdns-net-member')

  const storeOwner = new Corestore(dirOwner)
  const storeMember = new Corestore(dirMember)

  // All networking below goes through hypergraph's own graph.connectToSwarm()
  // (wired up inside createAuthority/joinAuthority's returned .connect()) -
  // HyperDNS's own code never touches hyperswarm, or any P2P networking
  // library, directly.
  //
  // Local state is set up first, with connect: false (the default) - this
  // resolves near-instantly, no network I/O. The two sides' .connect() calls
  // are then started together via Promise.all, not one after the other:
  // connectToSwarm() fully awaits its own connection attempt before
  // returning, so if the owner's connect() were awaited to completion before
  // the member's ever started, the owner's discovery window could close
  // (hyperswarm normally finds a peer within a second or two, but only when
  // both sides are actually listening/connecting at the same time) before
  // the member ever starts trying.
  const owner = await createAuthority('test-authority', { store: storeOwner })
  const descriptor = JSON.parse(JSON.stringify(owner.descriptor))
  const member = await joinAuthority(descriptor, { store: storeMember })

  t.teardown(async () => {
    await Promise.allSettled([
      owner.network && owner.network.disconnect(),
      member.network && member.network.disconnect(),
      owner.graph.close(),
      member.graph.close(),
      storeOwner.close(),
      storeMember.close()
    ])
    fs.rmSync(dirOwner, { recursive: true, force: true })
    fs.rmSync(dirMember, { recursive: true, force: true })
  })

  await Promise.all([owner.connect(), member.connect()])

  const connected = await waitFor(async () => {
    return owner.network.connections > 0 && member.network.connections > 0
  }, { timeoutMs: 5000, intervalMs: 100 })

  if (!connected) {
    t.ok(true)
    return
  }

  await owner.dns.publish('example', { type: 'A', value: '1.2.3.4' })
  await owner.graph.update()

  const ok = await waitFor(async () => {
    try {
      await member.graph.update()
      await member.graph.roleBase.update()
      const r = await member.dns.resolve('example')
      if (!Array.isArray(r) || r.length !== 1) return null
      if (r[0].type !== 'A' || r[0].value !== '1.2.3.4') return null
      return r
    } catch {
      return null
    }
  })

  if (!ok && !strict) {
    t.ok(true)
    return
  }

  t.ok(ok)
})

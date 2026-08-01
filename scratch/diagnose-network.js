// Diagnostic script - NOT a test. Run directly with `node scratch/diagnose-network.js`
// from the HyperDNS repo root. Bypasses graph.connectToSwarm()'s convenience
// wrapper to construct HypergraphNetwork directly, so event listeners can be
// wired BEFORE calling connect() - this lets us see events that fire DURING
// the connection attempt (peer-join, connection-retry, etc.), not just
// whatever's true once it fully resolves or times out.
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const HypergraphNetwork = require('hypergraph/src/networking')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { createAuthority, joinAuthority } = require('../src')
const { deriveAuthorityTopic } = require('../network/topic')

const t0 = Date.now()
function log (label, ...args) {
  console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`, ...args)
}

function wireAll (label, network) {
  const events = [
    'data-connection', 'control-connection', 'control-message', 'control-error',
    'writer-granted', 'writer-error', 'writer-request-timeout', 'context-announced',
    'peer-join', 'peer-leave', 'data-error', 'connected',
    'connection-retry', 'connection-retry-exhausted', 'disconnected'
  ]
  for (const ev of events) {
    network.on(ev, (payload) => log(`[${label}] ${ev}`, payload && payload.label ? payload.label : (payload && payload.name) || ''))
  }
}

function makeTmp (prefix) {
  const dir = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function main () {
  const dirOwner = makeTmp('diag-owner')
  const dirMember = makeTmp('diag-member')
  const storeOwner = new Corestore(dirOwner)
  const storeMember = new Corestore(dirMember)

  log('creating owner authority (local only, no network yet)...')
  const owner = await createAuthority('diag-authority', { store: storeOwner })
  const descriptor = JSON.parse(JSON.stringify(owner.descriptor))

  log('joining as member (local only, no network yet)...')
  const member = await joinAuthority(descriptor, { store: storeMember })

  const topic = deriveAuthorityTopic('diag-authority')

  const ownerSwarm = new Hyperswarm()
  const memberSwarm = new Hyperswarm()

  const ownerNetwork = new HypergraphNetwork(owner.graph, storeOwner, ownerSwarm, {
    topic, role: 'owner', contexts: { domains: owner.context }
  })
  const memberNetwork = new HypergraphNetwork(member.graph, storeMember, memberSwarm, {
    topic, role: 'peer', contexts: { domains: member.context }
  })

  wireAll('owner', ownerNetwork)
  wireAll('member', memberNetwork)

  log('calling connect() on both concurrently...')
  const results = await Promise.allSettled([
    ownerNetwork.connect().then(() => log('owner.connect() RESOLVED')),
    memberNetwork.connect().then(() => log('member.connect() RESOLVED'))
  ])
  log('Promise.allSettled results:', JSON.stringify(results.map(r => ({ status: r.status, reason: r.reason && r.reason.message }))))

  log('owner.connections =', ownerNetwork.connections)
  log('member.connections =', memberNetwork.connections)

  log('waiting 15 more seconds to observe any further events...')
  await new Promise((resolve) => setTimeout(resolve, 15000))

  log('final owner.connections =', ownerNetwork.connections)
  log('final member.connections =', memberNetwork.connections)

  await Promise.allSettled([
    ownerNetwork.disconnect(),
    memberNetwork.disconnect(),
    owner.graph.close(),
    member.graph.close(),
    storeOwner.close(),
    storeMember.close()
  ])
  fs.rmSync(dirOwner, { recursive: true, force: true })
  fs.rmSync(dirMember, { recursive: true, force: true })
  process.exit(0)
}

main().catch((err) => {
  console.error('ERROR', err)
  process.exit(1)
})

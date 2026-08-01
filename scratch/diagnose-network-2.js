// Second diagnostic - uses the ACTUAL authority.js code path (owner.connect()/
// member.connect(), i.e. graph.connectToSwarm()) rather than bypassing it, to
// isolate whether the bug is in that specific path or something particular
// to running inside brittle.
const Corestore = require('corestore')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { createAuthority, joinAuthority } = require('../src')

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
  const dirOwner = makeTmp('diag2-owner')
  const dirMember = makeTmp('diag2-member')
  const storeOwner = new Corestore(dirOwner)
  const storeMember = new Corestore(dirMember)

  log('creating owner authority (local only, no network yet)...')
  const owner = await createAuthority('test-authority', { store: storeOwner })
  const descriptor = JSON.parse(JSON.stringify(owner.descriptor))

  log('joining as member (local only, no network yet)...')
  const member = await joinAuthority(descriptor, { store: storeMember })

  // We can't wire listeners before connect() here, since owner.network is
  // only set once connect() resolves internally - but we CAN at least
  // confirm whether connect() itself resolves at all, and if so how long it
  // takes, using this exact code path.
  log('calling owner.connect() and member.connect() concurrently (via authority.js, same as the test)...')

  const results = await Promise.allSettled([
    owner.connect().then(() => log('owner.connect() RESOLVED')),
    member.connect().then(() => log('member.connect() RESOLVED'))
  ])
  log('Promise.allSettled results:', JSON.stringify(results.map(r => ({ status: r.status, reason: r.reason && r.reason.message }))))

  if (owner.network) wireAll('owner', owner.network)
  if (member.network) wireAll('member', member.network)

  log('owner.network:', owner.network ? `connections=${owner.network.connections}` : 'null')
  log('member.network:', member.network ? `connections=${member.network.connections}` : 'null')

  log('waiting 10 more seconds...')
  await new Promise((resolve) => setTimeout(resolve, 10000))

  log('final owner.network.connections =', owner.network && owner.network.connections)
  log('final member.network.connections =', member.network && member.network.connections)

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
  process.exit(0)
}

main().catch((err) => {
  console.error('ERROR', err)
  process.exit(1)
})

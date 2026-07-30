const test = require('brittle')
const Corestore = require('corestore')
const crypto = require('hypercore-crypto')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { Hypergraph } = require('hypergraph')
const resolve = require('../../src/resolve')

test('hyperdns: resolve is deterministic and supports multi-claim + moderation', async (t) => {
  const tmpDir = path.join(os.tmpdir(), `hyperdns-test-${process.pid}-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })

  const store = new Corestore(tmpDir)
  const graph = new Hypergraph(store)
  await graph.ready()

  t.teardown(async () => {
    await graph.close()
    await store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const owner = graph.key.toString('hex')

  const roleKeyHex = await graph.createRoleBase()
  await graph.roleBase.init(owner)

  const ctx = await graph.createContext()
  await graph.openContext(ctx)

  const domain1 = await graph.put({ type: 'domain' })
  await graph.putContent(domain1.id, JSON.stringify({ name: 'example' }), 'application/json')
  await graph.tag(domain1.id, 'name:example', { author: owner, context: ctx })

  const record1 = await graph.put({ type: 'record' })
  await graph.putContent(record1.id, JSON.stringify({ name: 'example', type: 'A', value: '1.2.3.4', ttl: 3600 }), 'application/json')
  await graph.relate({ from: domain1.id, to: record1.id, type: 'has_record', author: owner, context: ctx })

  const domain2 = await graph.put({ type: 'domain' })
  await graph.putContent(domain2.id, JSON.stringify({ name: 'example' }), 'application/json')
  await graph.tag(domain2.id, 'name:example', { author: owner, context: ctx })

  const record2 = await graph.put({ type: 'record' })
  await graph.putContent(record2.id, JSON.stringify({ name: 'example', type: 'A', value: '5.6.7.8', ttl: 3600 }), 'application/json')
  await graph.relate({ from: domain2.id, to: record2.id, type: 'has_record', author: owner, context: ctx })

  const moderator = crypto.keyPair()
  const moderatorPub = moderator.publicKey.toString('hex')
  await graph.roleBase.append({
    type: 'roles/setRole',
    member: moderatorPub,
    role: 'mod',
    author: owner,
    timestamp: Date.now()
  })

  await graph.update()

  await graph.moderateAction({
    context: ctx,
    action: 'content.hide',
    target: record2.id,
    keyPair: moderator
  })

  await graph.update()

  const r1 = await resolve('example', {
    graph,
    context: ctx,
    trustedModerators: [moderatorPub]
  })

  const r2 = await resolve('example', {
    graph,
    context: ctx,
    trustedModerators: [moderatorPub]
  })

  t.alike(r1, r2)

  t.alike(r1, [
    { type: 'A', value: '1.2.3.4', ttl: 3600 }
  ])
})

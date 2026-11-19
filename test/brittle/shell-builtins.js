const test = require('brittle')
const { tmpDir, bootstrap } = require('hypergraph/testing')
const { createSession } = require('../../shell/lib/session')
const createBuiltins = require('../../shell/builtins')

async function shell (t) {
  const session = createSession({ baseDir: tmpDir(t), hgOpts: { bootstrap: await bootstrap(t) } })
  t.teardown(() => session.shutdown(), { order: 0 })
  return { session, builtins: createBuiltins(session) }
}

// Captures console.log output for one call: the commands are plain functions.
async function captureLogs (fn) {
  const lines = []
  const original = console.log
  console.log = (...args) => lines.push(args.join(' '))
  try {
    await fn()
  } finally {
    console.log = original
  }
  return lines.join('\n')
}

test('shell resolve: a bare name resolves on the current authority', async (t) => {
  const { session, builtins } = await shell(t)
  await session.create('testdns')
  await session.get().dns.publish('testrec', { type: 'hyper', value: 'hyper://123abc' })

  const output = await captureLogs(() => builtins.resolve.fn(['testrec']))
  t.ok(output.includes('hyper') && output.includes('hyper://123abc'))
})

test('shell resolve: a full name@authority address resolves (regression: it was once passed through as a literal name)', async (t) => {
  const { session, builtins } = await shell(t)
  await session.create('testdns')
  await session.get().dns.publish('testrec', { type: 'hyper', value: 'hyper://123abc' })

  const output = await captureLogs(() => builtins.resolve.fn(['testrec@testdns']))
  t.ok(output.includes('hyper://123abc'))
  t.absent(output.includes('no records found'))
})

test('shell resolve: name@authority reaches another held authority than the current one; an unknown one errors clearly', async (t) => {
  // any held authority (or link) resolves, not only the current one
  const { session, builtins } = await shell(t)
  await session.create('other')
  await session.get().dns.publish('rec', { type: 'A', value: '9.9.9.9' })
  await session.create('testdns')

  const output = await captureLogs(() => builtins.resolve.fn(['rec@other']))
  t.ok(output.includes('9.9.9.9'))
  await t.exception(builtins.resolve.fn(['rec@nowhere']), /No authority "nowhere"/)
})

test('shell resolve: a trailing path is accepted and surfaced, not treated as part of the name', async (t) => {
  const { session, builtins } = await shell(t)
  await session.create('testdns')
  await session.get().dns.publish('forum', { type: 'hyper', value: 'hg:forum' })

  const output = await captureLogs(() => builtins.resolve.fn(['forum@testdns/posts']))
  t.ok(output.includes('hg:forum'))
  t.ok(output.includes('trailing path "posts"'))
})

test('shell create --private: the owner can publish/resolve at once; it has no public link, only invites', async (t) => {
  const { session, builtins } = await shell(t)
  const out = await captureLogs(() => builtins.create.fn(['secret', '--private']))
  t.ok(out.includes('private'))
  await session.get().dns.publish('blog', { type: 'A', value: '1.2.3.4' })
  t.alike(await session.get().dns.resolve('blog'), [{ type: 'A', value: '1.2.3.4' }])
  t.exception(() => builtins.link.fn(), /private/)
  t.ok((await captureLogs(() => builtins.invite.fn([]))).startsWith('hg:'))
})

test('shell link and whoami: print the public link and the identity', async (t) => {
  const { session, builtins } = await shell(t)
  await session.create('testdns')
  t.is(await captureLogs(() => builtins.link.fn()), session.get().link)
  t.ok((await captureLogs(() => builtins.whoami.fn())).includes(session.get().hg.identity.publicKey))
  t.ok((await captureLogs(() => builtins.status.fn())).includes('owner'))
})

const test = require('brittle')
const os = require('os')
const path = require('path')
const fs = require('fs')

const { createSession } = require('../../shell/lib/session')
const createBuiltins = require('../../shell/builtins')

function makeTmpBaseDir () {
  const dir = path.join(os.tmpdir(), `hyperdns-shell-builtins-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Captures console.log output for one call, without needing readline/stdin
// piping - createBuiltins() is a plain factory function, so its commands
// can be exercised directly.
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

test('shell resolve: a bare name resolves on the current authority, unchanged from before addressing existed', async (t) => {
  const baseDir = makeTmpBaseDir()
  t.teardown(() => fs.rmSync(baseDir, { recursive: true, force: true }))

  const session = createSession({ baseDir })
  const builtins = createBuiltins(session)

  await session.create('testdns')
  await session.get().dns.publish('testrec', { type: 'hyper', value: 'hyper://123abc' })

  const output = await captureLogs(() => builtins.resolve.fn(['testrec']))
  t.ok(output.includes('hyper') && output.includes('hyper://123abc'), 'a bare name resolves correctly')

  await session.shutdown()
})

test('shell resolve: a full name@authority address matching the current authority resolves correctly', async (t) => {
  // Regression test for a real bug: the shell's resolve command was never
  // actually wired to use parseAddress() at all - "resolve testrec@testdns"
  // was passed straight through as a literal record name ("testrec@testdns"),
  // which obviously never matches anything published, giving a misleading
  // "no records found" that looked like a resolution bug rather than a
  // missing integration.
  const baseDir = makeTmpBaseDir()
  t.teardown(() => fs.rmSync(baseDir, { recursive: true, force: true }))

  const session = createSession({ baseDir })
  const builtins = createBuiltins(session)

  await session.create('testdns')
  await session.get().dns.publish('testrec', { type: 'hyper', value: 'hyper://123abc' })

  const output = await captureLogs(() => builtins.resolve.fn(['testrec@testdns']))
  t.ok(output.includes('hyper') && output.includes('hyper://123abc'), 'name@authority resolves correctly when it matches the loaded authority')
  t.absent(output.includes('no records found'), 'this must not silently fail the way it did before the fix')

  await session.shutdown()
})

test('shell resolve: a name@authority address for a DIFFERENT authority gives a clear error, not a silent empty result', async (t) => {
  const baseDir = makeTmpBaseDir()
  t.teardown(() => fs.rmSync(baseDir, { recursive: true, force: true }))

  const session = createSession({ baseDir })
  const builtins = createBuiltins(session)

  await session.create('testdns')
  await session.get().dns.publish('testrec', { type: 'hyper', value: 'hyper://123abc' })

  await t.exception(
    () => builtins.resolve.fn(['testrec@someotherdns']),
    /different authority/,
    'a mismatched authority is a clear, explicit error - not a silent "no records found"'
  )

  await session.shutdown()
})

test('shell resolve: a trailing path is accepted and surfaced, not treated as part of the name', async (t) => {
  const baseDir = makeTmpBaseDir()
  t.teardown(() => fs.rmSync(baseDir, { recursive: true, force: true }))

  const session = createSession({ baseDir })
  const builtins = createBuiltins(session)

  await session.create('testdns')
  await session.get().dns.publish('forum', { type: 'hyper', value: 'hyper://abc123' })

  const output = await captureLogs(() => builtins.resolve.fn(['forum@testdns/posts']))
  t.ok(output.includes('hyper://abc123'), 'the record still resolves correctly with a trailing path present')
  t.ok(output.includes('posts'), 'the trailing path is surfaced to the user, not silently dropped')

  await session.shutdown()
})

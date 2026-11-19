const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

// every test runs real peers on a local DHT (hypergraph/testing): seconds each
const timeoutMs = 240000

const brittleCmd = path.join(__dirname, '..', 'node_modules', 'brittle', 'cmd.js')
const testDir = path.join(__dirname, '..', 'test', 'brittle')

// Public-DHT tests can take minutes, too long for the hang guard above:
// they run alone with `npm run test:network`.
const NETWORK_TEST_FILES = new Set(['replication-hyperswarm.js'])

const testFiles = fs.readdirSync(testDir)
  .filter((name) => name.endsWith('.js') && !NETWORK_TEST_FILES.has(name))
  .map((name) => path.join('test', 'brittle', name))

const child = spawn(process.execPath, [brittleCmd, ...testFiles], {
  stdio: 'inherit',
  windowsHide: true
})

let killed = false
const timer = setTimeout(() => {
  killed = true
  child.kill('SIGKILL')

  process.stderr.write('\ntime-out: test took more than 240s\n')
  process.exit(1)
}, timeoutMs)

child.on('exit', (code, signal) => {
  clearTimeout(timer)

  if (killed) return

  if (signal) process.exit(1)
  process.exit(code == null ? 1 : code)
})

child.on('error', (err) => {
  clearTimeout(timer)
  process.stderr.write(`\nERROR: failed to run tests: ${err && err.message ? err.message : String(err)}\n`)
  process.exit(1)
})

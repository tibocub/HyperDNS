const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const timeoutMs = 60000

const brittleCmd = path.join(__dirname, '..', 'node_modules', 'brittle', 'cmd.js')
const testDir = path.join(__dirname, '..', 'test', 'brittle')

// Real-network tests (anything actually exercising Hyperswarm/DHT connectivity,
// via graph.connectToSwarm()) are excluded from the default fast suite: they
// use deliberately generous, real-world-calibrated timeouts by hypergraph's
// own design (its connectToSwarm() can legitimately take minutes depending on
// DHT conditions), which is fundamentally incompatible with a single fixed
// ceiling meant to catch a genuinely hung/broken test run. Run them
// separately via `npm run test:network` - see docs/NETWORKING.md.
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

  process.stderr.write('\ntime-out: test took more than 60s\n')
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

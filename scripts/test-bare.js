// The library's tests (not the shell's) on Bare, where HyperBrowser runs it.
// Uses the hypergraph checkout's own `bare`, so this repo needs no copy.
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const bare = path.join(path.dirname(require.resolve('hypergraph/package.json')), 'node_modules', 'bare', 'bin', 'bare')
const testDir = path.join(__dirname, '..', 'test', 'brittle')
const SKIP = (name) => name.startsWith('shell-') || name === 'replication-hyperswarm.js'

let failed = 0
for (const name of fs.readdirSync(testDir).filter((n) => n.endsWith('.js') && !SKIP(n))) {
  const r = spawnSync(process.execPath, [bare, path.join(testDir, name)], { stdio: 'inherit', windowsHide: true, timeout: 240000 })
  if (r.status !== 0) {
    failed++
    process.stderr.write(`\nFAILED on Bare: ${name}\n`)
  }
}
process.exit(failed ? 1 : 0)

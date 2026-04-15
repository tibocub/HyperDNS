const { spawn } = require('child_process')
const path = require('path')

const timeoutMs = 60000

const brittleCmd = path.join(__dirname, '..', 'node_modules', 'brittle', 'cmd.js')
const testGlob = 'test/brittle/*.js'

const child = spawn(process.execPath, [brittleCmd, testGlob], {
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

// The REPL. Commands live in shell/builtins/index.js.
const readline = require('readline')
const c = require('ansi-colors')
const { parse } = require('shell-quote')
const createBuiltins = require('./builtins')
const { createCompleter } = require('./lib/completion')
const { createSession } = require('./lib/session')

const session = createSession()
const builtins = createBuiltins(session)

const completer = createCompleter({
  builtins,
  cwdProvider: () => process.cwd()
})

/**
 * readline's undocumented internals the tab menu drives; Node's own REPL uses them too.
 * @typedef {Omit<readline.Interface, 'line' | 'cursor'> & {
 *   line: string,
 *   cursor: number,
 *   output: NodeJS.WriteStream,
 *   _prompt?: string,
 *   _refreshLine (): void,
 *   _ttyWrite (s: string, key: readline.Key | undefined): void
 * }} TtyInterface
 */

const rl = /** @type {TtyInterface} */ (/** @type {unknown} */ (readline.createInterface({
  input: process.stdin,
  output: process.stdout
})))

/**
 * The tab menu while it is open: the matches for the word at `replaceStart`, `index` the chosen one.
 * @typedef {object} TabState
 * @property {boolean} active
 * @property {string} baseLine
 * @property {number} baseCursor
 * @property {number} replaceStart
 * @property {string} word
 * @property {string[]} matches
 * @property {number} index
 * @property {number} menuLines
 * @property {string} right - the line after the cursor
 */

/** @type {TabState | null} */
let tabState = null

function resetTabState () {
  tabState = null
}

/** @param {string} s */
function visibleLen (s) {
  return s
    .replace(/\x1B\[[0-9;]*m/g, '')
    .replace(/[\r\n]/g, '')
    .length
}

function clearSuggestionMenu () {
  if (!tabState?.menuLines) return
  tabState.menuLines = 0
}

function renderSuggestionMenu () {
  if (!tabState?.active) return
  clearSuggestionMenu()

  const { matches, index } = tabState
  const parts = matches.map((m, i) => (i === index ? c.inverse(m) : m))
  const menu = parts.join('  ')

  const columns = rl.output.columns || process.stdout.columns || 80
  const wrappedLines = Math.max(1, Math.ceil(visibleLen(menu) / columns))

  rl.output.write('\n')
  rl.output.write(menu)
  rl.output.write('\n')

  tabState.menuLines = 1 + wrappedLines
  rl.output.write(`\x1b[${tabState.menuLines}A`)

  const promptText = rl.getPrompt?.() ?? rl._prompt ?? ''
  const col = Math.max(0, visibleLen(promptText) + rl.cursor)
  rl.output.write('\r')
  if (col > 0) rl.output.write(`\x1b[${col}C`)
}

async function handleTab () {
  const line = rl.line
  const cursor = rl.cursor
  const left = line.slice(0, cursor)
  const right = line.slice(cursor)

  const [matches, word] = await completer(left)
  if (!matches || matches.length === 0) return

  if (matches.length === 1) {
    const start = word ? left.lastIndexOf(word) : cursor
    const replaceStart = start >= 0 ? start : cursor
    const chosen = matches[0]
    const newLeft = left.slice(0, replaceStart) + chosen
    const newLine = newLeft + right

    closeTabMenu()
    rl.line = newLine
    rl.cursor = newLeft.length
    rl._refreshLine()
    return
  }

  const start = word ? left.lastIndexOf(word) : cursor
  const replaceStart = start >= 0 ? start : cursor

  const sameContext =
    tabState?.active &&
    tabState.baseLine === line &&
    tabState.baseCursor === cursor &&
    tabState.replaceStart === replaceStart &&
    tabState.word === word &&
    tabState.matches.join('\n') === matches.join('\n')

  if (!sameContext) {
    tabState = {
      active: true,
      baseLine: line,
      baseCursor: cursor,
      replaceStart,
      word,
      matches,
      index: 0,
      menuLines: 0,
      right
    }
  }

  renderSuggestionMenu()

  // set just above when it wasn't open with these matches
  const state = /** @type {TabState} */ (tabState)
  const chosen = state.matches[state.index]
  const baseLeft = state.baseLine.slice(0, state.baseCursor)
  const newLeft = baseLeft.slice(0, state.replaceStart) + chosen
  const newLine = newLeft + state.right

  rl._refreshLine()
  rl.line = newLine
  rl.cursor = newLeft.length
  rl._refreshLine()
  renderSuggestionMenu()
}

/** @param {number} delta */
function cycleTab (delta) {
  if (!tabState?.active) return
  tabState.index = (tabState.index + delta + tabState.matches.length) % tabState.matches.length
  rl._refreshLine()

  const chosen = tabState.matches[tabState.index]
  const baseLeft = tabState.baseLine.slice(0, tabState.baseCursor)
  const newLeft = baseLeft.slice(0, tabState.replaceStart) + chosen
  const newLine = newLeft + tabState.right

  rl.line = newLine
  rl.cursor = newLeft.length
  rl._refreshLine()
  renderSuggestionMenu()
}

function acceptTabCompletion () {
  if (!tabState?.active) return false
  clearSuggestionMenu()
  tabState = null
  rl._refreshLine()
  return true
}

function closeTabMenu () {
  if (!tabState?.active) return
  clearSuggestionMenu()
  tabState = null
  rl._refreshLine()
}

const originalTtyWrite = rl._ttyWrite.bind(rl)
rl._ttyWrite = (/** @type {string} */ s, /** @type {readline.Key | undefined} */ key) => {
  if (key?.name === 'tab') {
    if (tabState?.active) {
      cycleTab(key.shift ? -1 : 1)
    } else {
      handleTab().catch(() => {})
    }
    return
  }

  if (tabState?.active && key?.name === 'return') {
    acceptTabCompletion()
    return
  }

  if (tabState?.active) {
    closeTabMenu()
  }

  resetTabState()
  return originalTtyWrite(s, key)
}

function updatePrompt () {
  const label = session.promptLabel()
  rl.setPrompt(`\n${label} ${c.bold.yellow('>')} `)
}

async function main () {
  console.log(c.bold(`HyperDNS shell - v0.0.1`))
  console.log(c.dim(`type "help" for a list of commands`))

  updatePrompt()
  rl.prompt()

  // Serialized: readline doesn't await async 'line' listeners, so pasted or
  // piped lines would otherwise run concurrently and out of order.
  let queue = Promise.resolve()

  rl.on('line', (userInput) => {
    queue = queue.then(() => processLine(userInput))
  })

  /** @param {string} userInput */
  async function processLine (userInput) {
    const trimmed = userInput.trim()
    if (trimmed === '') {
      updatePrompt()
      rl.prompt()
      return
    }

    const cmdItems = parse(trimmed).filter((p) => typeof p === 'string')
    if (cmdItems.length === 0) {
      updatePrompt()
      rl.prompt()
      return
    }

    const cmd = cmdItems[0]
    const args = cmdItems.slice(1)

    if (cmd in builtins) {
      try {
        await builtins[cmd].fn(args)
      } catch (err) {
        console.error(c.red(/** @type {Error | undefined} */ (err)?.message ?? String(err)))
      }
    } else {
      console.log(c.red(`${cmd}: command not found (type "help" for a list of commands)`))
    }

    updatePrompt()
    rl.prompt()
  }

  rl.on('close', async () => {
    await queue
    await session.shutdown()
    process.exit(0)
  })
}

main()

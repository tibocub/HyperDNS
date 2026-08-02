const fs = require('fs')
const path = require('path')

function splitLine (line) {
  const m = line.match(/\S+\s*$/)
  const current = m ? m[0] : ''
  const before = line.slice(0, line.length - current.length)
  const trimmedCurrent = current.replace(/\s+$/, '')
  const hasTrailingSpace = current.length > trimmedCurrent.length
  const tokens = (before + trimmedCurrent).trim().length
    ? (before + trimmedCurrent).trim().split(/\s+/)
    : []

  return { tokens, currentToken: hasTrailingSpace ? '' : trimmedCurrent }
}

async function listDirEntries (dirAbs) {
  try {
    return await fs.promises.readdir(dirAbs)
  } catch {
    return []
  }
}

async function isDirectory (p) {
  try {
    const st = await fs.promises.lstat(p)
    return st.isDirectory()
  } catch {
    return false
  }
}

function uniqueSorted (arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b))
}

// Command-position completion matches against builtin names only (there's
// no external/PATH program execution in this shell, unlike the original
// js-shell-kit this is adapted from). Argument-position completion still
// does filesystem path completion - useful for `join <descriptor-file>`,
// `create --dir <path>`, etc.
function createCompleter ({ builtins, cwdProvider }) {
  return async function completer (line) {
    const { tokens, currentToken } = splitLine(line)

    const isCommandPosition = tokens.length <= 1

    if (isCommandPosition) {
      const all = uniqueSorted(Object.keys(builtins))
      if (!currentToken) return [[], currentToken]
      const hits = all.filter((n) => n.startsWith(currentToken))
      return [hits, currentToken]
    }

    const cwd = cwdProvider()
    const token = currentToken || ''

    const lastSep = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'))
    const prefixPath = lastSep >= 0 ? token.slice(0, lastSep + 1) : ''
    const baseName = lastSep >= 0 ? token.slice(lastSep + 1) : token

    const baseDirAbs = path.resolve(cwd, prefixPath || '.')
    const names = await listDirEntries(baseDirAbs)

    const matches = []
    for (const name of names) {
      if (baseName && !name.startsWith(baseName)) continue

      const abs = path.join(baseDirAbs, name)
      const slash = (await isDirectory(abs)) ? '/' : ''
      matches.push(name + slash)
    }

    const hits = uniqueSorted(matches)
    return [hits, baseName]
  }
}

module.exports = { createCompleter }

// The published .d.ts (npm run types) work in a strict TypeScript project that installed no @types of its
// own ("types": []), reached through package exports as a user would: no error on right use, an error on a
// typo (so the types really load, not any).

const test = require('brittle')

if (typeof Bare !== 'undefined') {
  test('types consumer: skipped on Bare (a Node script)', (t) => t.pass('skipped on Bare'))
} else {
  const fs = require('fs')
  const os = require('os')
  const path = require('path')
  const { spawnSync } = require('child_process')

  const root = path.join(__dirname, '../..')

  const GOOD = `import hyperdns = require('hyperdns')

export async function main (hg: hyperdns.Hypergraph): Promise<void> {
  const { dns, link, space } = await hyperdns.createAuthority('a', { hg, private: false })
  const out: hyperdns.PublishedRecord = await dns.publish('blog', { type: 'A', value: '1.2.3.4', ttl: 60 })
  const records: hyperdns.DnsRecord[] = await hyperdns.resolve('blog', { space, timeout: 0 })
  const answer = await hyperdns.resolveAddress('blog@' + link, { hg, timeout: 0 })
  const s: hyperdns.Space = space
  void out; void records; void answer.authority; void s.key
}
`
  const BAD = `import hyperdns = require('hyperdns')

export async function typo (hg: hyperdns.Hypergraph): Promise<void> {
  const { dns } = await hyperdns.createAuthority('a', { hg })
  await dns.publish('blog', { type: 'A', valu: '1.2.3.4' })
}
`

  test('types consumer: no @types installed, strict, node16; right use passes, a typo fails', { timeout: 300000 }, async (t) => {
    const tsc = require.resolve('typescript/bin/tsc', { paths: [root] })
    const build = spawnSync(process.execPath, [tsc, '-p', 'jsconfig.json', '--noEmit', 'false', '--declaration', '--emitDeclarationOnly', '--outDir', 'dist/types'], { cwd: root, encoding: 'utf8' })
    t.is(build.status, 0, 'npm run types: ' + build.stdout.slice(0, 2000))

    const dir = fs.mkdtempSync(path.join(process.env.HG_TEST_TMP || os.tmpdir(), 'hyperdns-types-'))
    const link = path.join(dir, 'node_modules', 'hyperdns')
    fs.mkdirSync(path.dirname(link))
    fs.symlinkSync(root, link, 'junction')
    t.teardown(() => {
      // Only the link itself goes (rmdir on a junction leaves its target alone); the folder only once it's gone.
      try { process.platform === 'win32' ? fs.rmdirSync(link) : fs.unlinkSync(link) } catch {}
      if (!fs.existsSync(link)) fs.rmSync(dir, { recursive: true, force: true })
    })

    fs.writeFileSync(path.join(dir, 'good.cts'), GOOD)
    fs.writeFileSync(path.join(dir, 'bad.cts'), BAD)
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { strict: true, module: 'node16', moduleResolution: 'node16', target: 'ES2022', types: [], noEmit: true },
      files: ['good.cts', 'bad.cts']
    }))

    const res = spawnSync(process.execPath, [tsc, '-p', path.join(dir, 'tsconfig.json')], { cwd: dir, encoding: 'utf8' })
    const errors = res.stdout.split('\n').filter((line) => line.includes('error TS'))
    const elsewhere = errors.filter((line) => !line.startsWith('bad.cts'))
    t.alike(elsewhere, [], 'no error in good.cts or in the published types')
    t.ok(errors.some((line) => line.startsWith('bad.cts') && line.includes('valu')), 'the typo valu is an error: ' + errors.join('\n'))
  })
}

const test = require('brittle')
const { open, codeOf } = require('hypergraph/testing')
const { createAuthority, resolve } = require('../../src')

test('resolve() is scoped to the space it is given when the instance holds several authorities', async (t) => {
  const hg = await open(t)
  const a = await createAuthority('a', { hg })
  const b = await createAuthority('b', { hg })
  await a.dns.publish('shared', { type: 'A', value: '1.1.1.1' })
  await b.dns.publish('shared', { type: 'A', value: '2.2.2.2' })

  t.alike(await resolve('shared', { space: a.space }), [{ type: 'A', value: '1.1.1.1' }])
  t.alike(await resolve('shared', { space: b.space }), [{ type: 'A', value: '2.2.2.2' }])
  t.is(await codeOf(resolve('shared', {})), 'opts.space is required')
})

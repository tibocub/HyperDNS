const test = require('brittle')
const { open } = require('hypergraph/testing')
const { createAuthority } = require('../../src')

// The author of a record is always the hypergraph instance's own identity:
// publish() takes no author, and one passed anyway changes nothing.
test('publish does not require an author option', async (t) => {
  const hg = await open(t)
  const { dns } = await createAuthority('a', { hg })
  await dns.publish('example', { type: 'A', value: '1.2.3.4' })
  t.alike(await dns.resolve('example'), [{ type: 'A', value: '1.2.3.4' }])
})

test('a caller-supplied author option has no effect on who signs the data', async (t) => {
  const hg = await open(t)
  const { dns, space } = await createAuthority('a', { hg })
  const out = await dns.publish('example', { type: 'A', value: '1.2.3.4' }, { author: 'someone-else' })
  const { record } = await space.get(out.id)
  t.is(record.author, hg.identity.publicKey)
})

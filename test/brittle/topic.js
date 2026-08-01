const test = require('brittle')

const { deriveAuthorityTopic } = require('../../network/topic')

test('topic derivation is deterministic and 32 bytes', async (t) => {
  const authority = 'myDNS'

  const a1 = deriveAuthorityTopic(authority)
  const a2 = deriveAuthorityTopic(authority)

  t.is(a1.length, 32)
  t.is(a2.length, 32)
  t.is(a1.toString('hex'), a2.toString('hex'))
})

test('topic uniqueness across authorities', async (t) => {
  const a = deriveAuthorityTopic('myDNS')
  const b = deriveAuthorityTopic('myDNS2')

  t.unlike(a.toString('hex'), b.toString('hex'))
})

test('deriveAuthorityTopic requires a non-empty string', async (t) => {
  await t.exception(() => deriveAuthorityTopic(''), 'empty string throws')
  await t.exception(() => deriveAuthorityTopic(null), 'null throws')
  await t.exception(() => deriveAuthorityTopic(undefined), 'undefined throws')
})

const test = require('brittle')

const { deriveAuthorityTopic, deriveControlTopic } = require('../../network/topic')

test('topic derivation is deterministic and 32 bytes', async (t) => {
  const authority = 'myDNS'

  const a1 = deriveAuthorityTopic(authority)
  const a2 = deriveAuthorityTopic(authority)

  t.is(a1.length, 32)
  t.is(a2.length, 32)
  t.is(a1.toString('hex'), a2.toString('hex'))

  const c1 = deriveControlTopic(authority)
  const c2 = deriveControlTopic(authority)

  t.is(c1.length, 32)
  t.is(c2.length, 32)
  t.is(c1.toString('hex'), c2.toString('hex'))

  t.unlike(a1.toString('hex'), c1.toString('hex'))
})

test('topic uniqueness across authorities', async (t) => {
  const a = deriveAuthorityTopic('myDNS')
  const b = deriveAuthorityTopic('myDNS2')

  t.unlike(a.toString('hex'), b.toString('hex'))

  const ca = deriveControlTopic('myDNS')
  const cb = deriveControlTopic('myDNS2')

  t.unlike(ca.toString('hex'), cb.toString('hex'))
})

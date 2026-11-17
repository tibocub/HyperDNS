const test = require('brittle')
const { open, codeOf } = require('hypergraph/testing')
const { createAuthority, parseAddress, resolveAddress } = require('../../src')

test('parseAddress parses and normalizes whitespace', async (t) => {
  t.alike(parseAddress('bobs-blog@bobsDNS'), { name: 'bobs-blog', dns: 'bobsDNS', path: null })
  t.alike(parseAddress('  a  @  b  '), { name: 'a', dns: 'b', path: null })

  t.exception(() => parseAddress('abc'), 'Invalid address format')
  t.exception(() => parseAddress('a@b@c'), 'Invalid address format')
  t.exception(() => parseAddress('@dns'), 'Invalid address format')
  t.exception(() => parseAddress('name@'), 'Invalid address format')
  t.exception(() => parseAddress(' @ '), 'Invalid address format')
})

test('parseAddress accepts an optional hyperdns:// scheme prefix', async (t) => {
  t.alike(parseAddress('hyperdns://bobs-blog@bobsDNS'), { name: 'bobs-blog', dns: 'bobsDNS', path: null })
  t.alike(parseAddress('HYPERDNS://bobs-blog@bobsDNS'), { name: 'bobs-blog', dns: 'bobsDNS', path: null }, 'the scheme prefix is case-insensitive')
})

test('parseAddress carries a trailing path through untouched, without ever interpreting it', async (t) => {
  // The path is deliberately opaque - it exists to let hypergraph's own
  // entity addressing (type/author/seq) and an app's own dynamic routing
  // (e.g. HyperBBS's own "list all posts" route) both use it validly,
  // without HyperDNS imposing any structure of its own on it.
  t.alike(
    parseAddress('forum@my-dns/post/1a0e0f168ab42de514f92cb95bd640ac599c43af9efbde0a14c81faa16bb0fe8/8'),
    { name: 'forum', dns: 'my-dns', path: 'post/1a0e0f168ab42de514f92cb95bd640ac599c43af9efbde0a14c81faa16bb0fe8/8' },
    'a hypergraph-style entity path is carried through as one opaque string'
  )
  t.alike(
    parseAddress('forum@my-dns/posts'),
    { name: 'forum', dns: 'my-dns', path: 'posts' },
    "an app's own single-segment route is carried through just as validly"
  )
  t.alike(
    parseAddress('hyperdns://forum@my-dns/post/1a0e.../8'),
    { name: 'forum', dns: 'my-dns', path: 'post/1a0e.../8' },
    'works the same with the scheme prefix present'
  )
  t.alike(parseAddress('forum@my-dns/'), { name: 'forum', dns: 'my-dns', path: null }, 'a trailing slash with nothing after it is no path at all, not an empty string')
})

test('parseAddress rejects whitespace inside name, and a path separator before the authority even starts', async (t) => {
  t.exception(() => parseAddress('fo/rum@my-dns'), 'Invalid address format')
  t.exception(() => parseAddress('fo rum@my-dns'), 'Invalid address format')
  // A slash right after '@' always starts the path by definition (that's
  // the whole grammar) - there's no way for the authority itself to
  // "contain" a slash that would need rejecting; this is a legitimate
  // parse, not an error.
  t.alike(parseAddress('forum@my/dns'), { name: 'forum', dns: 'my', path: 'dns' })
})

test('resolveAddress resolves by the name of an authority this instance holds', async (t) => {
  const hg = await open(t)
  const { dns } = await createAuthority('bobsDNS', { hg })
  await dns.publish('blog', { type: 'hyper', value: 'hg:abc' })

  const out = await resolveAddress('blog@bobsDNS', { hg })
  t.alike(out.records, [{ type: 'hyper', value: 'hg:abc' }])
  t.is(out.path, null)
})

test('resolveAddress returns the trailing path alongside the resolved records, unmodified', async (t) => {
  const hg = await open(t)
  const { dns } = await createAuthority('my-dns', { hg })
  await dns.publish('forum', { type: 'hyper', value: 'hg:forum' })

  const out = await resolveAddress('hyperdns://forum@my-dns/post/1a0e/8', { hg })
  t.alike(out.records, [{ type: 'hyper', value: 'hg:forum' }])
  t.is(out.path, 'post/1a0e/8')
})

test('resolveAddress reaches an authority this instance is not a member of, by its link (joins it read-only)', async (t) => {
  const owner = await open(t)
  const visitor = await open(t)
  const { dns, link } = await createAuthority('bobsDNS', { hg: owner })
  await dns.publish('blog', { type: 'hyper', value: 'hg:blog' })

  const out = await resolveAddress(`blog@${link}`, { hg: visitor, timeout: 15000 })
  t.alike(out.records, [{ type: 'hyper', value: 'hg:blog' }])
  t.is(out.authority, link.slice(3), 'says which authority answered')

  // held now: its name works too, and the visitor may not publish
  t.alike((await resolveAddress('blog@bobsDNS', { hg: visitor })).records, [{ type: 'hyper', value: 'hg:blog' }])
  t.is(await codeOf(visitor.space(out.authority).put('hyperdns/record', { name: 'blog', kind: 'hyper', value: 'evil' })), 'NOT_ALLOWED')
})

test('resolveAddress errors: unknown authority, unknown name, nobody online, each with its own code', async (t) => {
  const hg = await open(t)
  const { dns } = await createAuthority('bobsDNS', { hg })
  await dns.publish('blog', { type: 'A', value: '1.2.3.4' })

  t.is(await codeOf(resolveAddress('blog@nobodysDNS', { hg })), 'UNKNOWN_AUTHORITY')
  t.is(await codeOf(resolveAddress('nope@bobsDNS', { hg })), 'UNKNOWN_NAME')

  // a link to an authority whose only holder is gone
  const gone = await open(t)
  const { link } = await createAuthority('goneDNS', { hg: gone })
  await gone.close()
  t.is(await codeOf(resolveAddress(`blog@${link}`, { hg, timeout: 2000 })), 'UNAVAILABLE')

  // a held space that isn't an authority
  await hg.createSpace({ name: 'forum' })
  t.is(await codeOf(resolveAddress('blog@forum', { hg })), 'UNKNOWN_AUTHORITY')

  t.exception(() => parseAddress('blog'), /Invalid address format/)
  t.is(await codeOf(resolveAddress('blog@bobsDNS', {})), 'hg is required')
})

test('resolveAddress routes independently by authority (no accidental reuse)', async (t) => {
  const hg = await open(t)
  const a = await createAuthority('dnsA', { hg })
  const b = await createAuthority('dnsB', { hg })
  await a.dns.publish('blog', { type: 'A', value: '1.1.1.1' })
  await b.dns.publish('blog', { type: 'A', value: '2.2.2.2' })

  t.alike((await resolveAddress('blog@dnsA', { hg })).records, [{ type: 'A', value: '1.1.1.1' }])
  t.alike((await resolveAddress('blog@dnsB', { hg })).records, [{ type: 'A', value: '2.2.2.2' }])
})

test('resolveAddress refuses an authority name two held authorities share', async (t) => {
  const hg = await open(t)
  await createAuthority('twin', { hg })
  await createAuthority('twin', { hg })
  t.is(await codeOf(resolveAddress('blog@twin', { hg })), 'AMBIGUOUS_AUTHORITY')
})


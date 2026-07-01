const resolve = require('./resolve')

function parseAddress (address) {
  if (!address || typeof address !== 'string') throw new Error('Invalid address format')

  const parts = address.split('@')
  if (parts.length !== 2) throw new Error('Invalid address format')

  const name = parts[0].trim()
  const dns = parts[1].trim()

  if (!name || !dns) throw new Error('Invalid address format')

  return { name, dns }
}

async function resolveAddress (address, opts = {}) {
  const { name, dns } = parseAddress(address)

  if (!opts.getAuthorityClient) throw new Error('getAuthorityClient is required')

  const client = await opts.getAuthorityClient(dns)

  if (client && typeof client.resolve === 'function') {
    return client.resolve(name)
  }

  if (client && client.graph && client.context) {
    return resolve(name, {
      graph: client.graph,
      context: client.context,
      trustedModerators: client.trustedModerators || []
    })
  }

  throw new Error('Invalid authority client')
}

module.exports = {
  parseAddress,
  resolveAddress
}

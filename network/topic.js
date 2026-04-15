const crypto = require('crypto')

function deriveAuthorityTopic (authority) {
  if (!authority || typeof authority !== 'string') throw new Error('authority must be a non-empty string')

  return crypto
    .createHash('sha256')
    .update('hyperdns:v1:' + authority)
    .digest()
}

function deriveControlTopic (authority) {
  if (!authority || typeof authority !== 'string') throw new Error('authority must be a non-empty string')

  return crypto
    .createHash('sha256')
    .update('hyperdns-control:v1:' + authority)
    .digest()
}

module.exports = {
  deriveAuthorityTopic,
  deriveControlTopic
}

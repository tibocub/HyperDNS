module.exports = {
  resolve: require('./resolve'),
  publish: require('./publish'),
  HyperDNS: require('./HyperDNS'),
  createDNS: require('./createDNS'),
  parseAddress: require('./address').parseAddress,
  resolveAddress: require('./address').resolveAddress,
  createAuthority: require('./authority').createAuthority,
  joinAuthority: require('./authority').joinAuthority,
  RECORD_TYPE: require('./schema').RECORD_TYPE,
  PUBLISH_PERMISSION: require('./schema').PUBLISH_PERMISSION
}

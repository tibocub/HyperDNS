module.exports = {
  resolve: require('./resolve'),
  publish: require('./publish'),
  HyperDNS: require('./HyperDNS'),
  createDNS: require('./createDNS'),
  parseAddress: require('./address').parseAddress,
  resolveAddress: require('./address').resolveAddress
}

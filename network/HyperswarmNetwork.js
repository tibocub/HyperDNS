const Hyperswarm = require('hyperswarm')
const EventEmitter = require('events')

const { deriveAuthorityTopic, deriveControlTopic } = require('./topic')

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withTimeout (promise, ms) {
  return await Promise.race([
    promise,
    sleep(ms).then(() => null)
  ])
}

module.exports = class HyperswarmNetwork extends EventEmitter {
  constructor (store, opts = {}) {
    super()

    if (!store) throw new Error('store is required')

    this.store = store
    this.maxPeers = opts.maxPeers || 16

    const dht = opts.dht || null

    this.dataSwarm = new Hyperswarm({ maxPeers: this.maxPeers, dht: dht || undefined })
    // Share the same DHT instance to keep connection behaviour predictable.
    this.controlSwarm = new Hyperswarm({ maxPeers: this.maxPeers, dht: this.dataSwarm.dht })

    this.connections = 0
    this.authority = null
    this._dataTopic = null
    this._controlTopic = null

    this.dataSwarm.on('connection', (conn) => {
      this.connections++
      this.store.replicate(conn)
      conn.on('error', (err) => this.emit('data-error', err))
      conn.on('close', () => { this.connections-- })
      this.emit('data-connection', conn)
    })

    this.controlSwarm.on('connection', (conn, info) => {
      this.connections++
      this._wireControlConnection(conn, info)
      conn.on('error', (err) => this.emit('control-error', err))
      conn.on('close', () => { this.connections-- })
      this.emit('control-connection', conn, info)
    })
  }

  _wireControlConnection (conn, info) {
    let buf = ''
    conn.on('data', (data) => {
      buf += data.toString('utf-8')

      for (;;) {
        const idx = buf.indexOf('\n')
        if (idx === -1) break
        const line = buf.slice(0, idx)
        buf = buf.slice(idx + 1)
        if (!line) continue

        let msg = null
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }

        this.emit('control-message', msg, conn, info)
      }
    })
  }

  sendControl (conn, msg) {
    const line = JSON.stringify(msg) + '\n'
    conn.write(Buffer.from(line, 'utf-8'))
  }

  async joinAuthority (authority) {
    if (!authority || typeof authority !== 'string') throw new Error('authority must be a non-empty string')

    this.authority = authority
    this._dataTopic = deriveAuthorityTopic(authority)
    this._controlTopic = deriveControlTopic(authority)

    const d1 = this.dataSwarm.join(this._dataTopic, { server: true, client: true })
    const d2 = this.controlSwarm.join(this._controlTopic, { server: true, client: true })

    await withTimeout(d1.flushed(), 2000)
    await withTimeout(d2.flushed(), 2000)
    await withTimeout(this.dataSwarm.flush(), 2000)
    await withTimeout(this.controlSwarm.flush(), 2000)

    return { data: d1, control: d2 }
  }

  async close () {
    await this.dataSwarm.destroy()
    await this.controlSwarm.destroy()
  }
}

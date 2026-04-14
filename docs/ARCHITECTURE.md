# ARCHITECTURE

## High-Level Components

1. Core Library (`/core`)

   * Hypercore feeds
   * Record validation
   * Resolution engine

2. Networking (`/network`)

   * Hyperswarm topics
   * Peer discovery
   * Replication

3. Storage (`/storage`)

   * Hyperbee indexes
   * Local cache

4. Daemon (`/daemon`)

   * Local API (HTTP/IPC)
   * Background sync

5. Client SDK (`/sdk`)

   * Developer-facing API

6. Extensions (`/extensions`)

   * Browser integration

---

### Data Flow

1. Publish:

   * User signs record
   * Append to Hypercore
   * Broadcast via swarm

2. Resolve:

   * Join topic (the DNS address)
   * Fetch records (the domain name)

---

### Trust Model

* Local-first trust
* Configurable community list
* Conflict resolution handled client-side

---
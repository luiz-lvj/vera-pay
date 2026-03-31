# VeraPay Documentation

## Guides

| Document | Description |
|----------|-------------|
| [Getting Started](./getting-started.md) | Step-by-step guide to integrating `@vera-pay/sdk` |
| [Architecture](./architecture.md) | System design and component overview |
| [Flow Integration](./flow-integration.md) | Flow Blockchain dual-VM, scheduled transactions, and COAs |
| [Storacha Setup](./storacha-setup.md) | Configure IPFS receipt pinning via Protocol Labs |

## API Reference

The full SDK API reference is in the [SDK README](../sdk/README.md).

## Key Concepts

### The Product

**`@vera-pay/sdk`** is an npm package that provides on-chain subscription payments on Flow Blockchain. Install it, create plans, accept recurring stablecoin payments, and let Flow's native scheduled transactions handle the rest.

### Flow Blockchain (Dual-VM)

VeraPay runs on [Flow](https://flow.com), which uniquely offers both:

- **Flow EVM** — A full EVM environment. The `VeraPay.sol` smart contract lives here. Works with MetaMask, ethers.js, Foundry.
- **Cadence** — Flow's native language with [scheduled transactions](https://developers.flow.com/build/cadence/advanced-concepts/scheduled-transactions). VeraPay uses this for autonomous recurring payments via cross-VM calls through Cadence Owned Accounts (COAs).

### IPFS via Storacha (Protocol Labs)

Every payment receipt is pinned to [IPFS](https://ipfs.io) through [Storacha](https://storacha.network), built by [Protocol Labs](https://protocol.ai) (creators of IPFS and Filecoin). Receipts are permanent, content-addressed JSON documents.

### Two Payment Paths

1. **EVM Path** — Standard ERC-20 subscriptions via `VeraPayClient`. Payments can be triggered by anyone (permissionless keeper design) or automated with `startKeeper()`.

2. **Cadence Scheduled Path** — Subscribe and schedule future payments in a single transaction via `FlowScheduler.subscribeAndSchedule()`. Flow's protocol executes payments automatically at the interval — no off-chain infrastructure needed.

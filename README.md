# VeraPay

**Stripe, but on-chain.** Subscription payments powered by stablecoins on [Flow Blockchain](https://flow.com), with immutable receipts on [IPFS](https://ipfs.io) via [Storacha](https://storacha.network) (Protocol Labs).

VeraPay is a TypeScript SDK ([`@vera-pay/sdk`](https://www.npmjs.com/package/@vera-pay/sdk)) that gives any dApp Stripe-like subscription billing — plan creation, one-click subscribe, ERC-20 payment pulling, IPFS receipts, and **fully on-chain scheduled recurring payments** using Flow's native Cadence scheduled transactions. No off-chain keepers or cron jobs required.

**[Live Demo](https://www.verapay.xyz/)** · **[NPM Package](https://www.npmjs.com/package/@vera-pay/sdk)** · **[Documentation](./docs/)**

---

## Why VeraPay?

| Problem | VeraPay Solution |
|---------|-----------------|
| Recurring crypto payments require off-chain keepers | Flow Cadence **scheduled transactions** execute payments autonomously on-chain |
| Payment receipts are ephemeral event logs | Every receipt is pinned to **IPFS via Storacha** (Protocol Labs) for permanent verifiability |
| EVM-only limits what's possible | Flow's **cross-VM architecture** combines EVM smart contracts with Cadence's native capabilities |
| Integrating subscription payments is complex | One `npm install` — the SDK handles plans, subscriptions, approvals, scheduling, and receipts |

---

## Architecture

```
vera-pay/
├── sdk/          @vera-pay/sdk — the product (npm package)
├── contracts/    Solidity smart contracts (Foundry) — deployed on Flow EVM
├── vera-pay/     Cadence project — scheduled transaction handler
├── demo/         Vite + React demo app
└── docs/         Documentation
```

### How It Works

```
┌──────────┐  createPlan()   ┌────────────────────┐
│ Merchant │ ──────────────> │                    │
└──────────┘                 │   VeraPay.sol      │
                             │   (Flow EVM)       │──> IPFS receipt
┌──────────┐  subscribe()    │                    │    (Storacha / Protocol Labs)
│  User    │ ──────────────> │                    │
└──────────┘                 └────────────────────┘
                                       ▲
                                       │ processPayment()
                                       │ (cross-VM via COA)
┌──────────────────────────────────────┐
│  Flow Cadence Scheduled Transactions │
│  VeraPayScheduledPaymentHandler      │
│  (no off-chain keeper needed)        │
└──────────────────────────────────────┘
```

1. **Merchant** creates a subscription plan on-chain (token, price, interval).
2. **Subscriber** approves the stablecoin and subscribes — first payment is pulled immediately.
3. **Scheduled Transaction** — Flow's Cadence layer autonomously executes future payments at the plan's interval using a cross-VM call through a Cadence Owned Account (COA). No external keeper, no cron job.
4. **IPFS Receipt** — Every payment is pinned to IPFS via Storacha for immutable, verifiable proof.

---

## The Product: `@vera-pay/sdk`

The SDK is the core product. Install it and integrate subscription payments in minutes.

```bash
npm install @vera-pay/sdk ethers
```

```typescript
import {
  VeraPayClient, FlowScheduler, createStorachaAdapter,
  DEPLOYED_CONTRACTS, CADENCE_HANDLERS, KNOWN_TOKENS,
} from "@vera-pay/sdk";
import { ethers } from "ethers";

// Connect to VeraPay on Flow EVM
const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
const ipfs = createStorachaAdapter({ key: "...", proof: "..." });

const veraPay = VeraPayClient.fromNetwork(
  "flow-testnet",
  DEPLOYED_CONTRACTS["flow-testnet"],
  signer,
  ipfs
);

// Merchant: create a plan
const { planId } = await veraPay.createPlan({
  paymentToken: KNOWN_TOKENS["flow-testnet"].USDC,
  amount: ethers.parseUnits("9.99", 18),
  interval: 30n * 24n * 3600n, // monthly
  name: "Pro Plan",
});

// Subscriber: approve + subscribe in one call
const { subscriptionId, receipt } = await veraPay.subscribeWithApproval(planId);
console.log("IPFS receipt:", receipt.ipfsCid);

// Schedule recurring payments — no keeper needed
const scheduler = new FlowScheduler({
  network: "testnet",
  handlerAddress: CADENCE_HANDLERS["flow-testnet"],
  evmContractAddress: DEPLOYED_CONTRACTS["flow-testnet"],
  ipfsAdapter: ipfs,
});
await scheduler.authenticate();
await scheduler.setup();
await scheduler.approveERC20(KNOWN_TOKENS["flow-testnet"].USDC);

const result = await scheduler.subscribeAndSchedule({
  planId: planId.toString(),
  intervalSeconds: "2592000.0", // 30 days
});
console.log("Scheduled TX:", result.scheduledTxId);
```

---

## Live On-Chain Example

Here is a real end-to-end payment that was scheduled, executed, and receipted — all on-chain:

| Step | What Happened | Link |
|------|--------------|------|
| 1. **Scheduled** | Payment scheduled via `FlowTransactionScheduler` | [Scheduled Transaction #2000865](https://testnet.explorer.flow.com/scheduled/2000865) |
| 2. **Executed (Cadence)** | Flow protocol executed the handler at the scheduled time | [Cadence TX `84ecf1...`](https://testnet.explorer.flow.com/tx/84ecf194a54473a43292ce75ebb277e8a0d9b722d9cdde5ac1fbb3d22b78a56e) |
| 3. **Cross-VM (EVM)** | Handler called `processPayment()` on VeraPay.sol via COA | [EVM TX `0x02e9...`](https://testnet.evm.flow.com/tx/0x02e9ec846696a8b66c97da631197d0af8f76c03a5ae385981eaa36dfd7bd0975) |
| 4. **IPFS Receipt** | Payment receipt pinned to IPFS via Storacha | [View Receipt](https://bafkreih4wvblxkog2qt4smv5u7nwoiaom3g3y73xuqde35yss7st4jsiwm.ipfs.w3s.link/) |

This demonstrates the full flow: a single user action schedules a future payment on Cadence, which autonomously executes a cross-VM call to the EVM contract, pulls the ERC-20 stablecoin, and pins the receipt to IPFS — with zero off-chain infrastructure.

---

## Key Technologies

### Flow Blockchain

VeraPay leverages Flow's unique **dual-VM architecture**:

- **Flow EVM** — Runs the `VeraPay.sol` smart contract. Compatible with MetaMask, ethers.js, Foundry, and all EVM tooling.
- **Cadence** — Flow's native language powers [scheduled transactions](https://developers.flow.com/build/cadence/advanced-concepts/scheduled-transactions) and cross-VM calls via Cadence Owned Accounts (COAs), enabling autonomous recurring payments without off-chain infrastructure.

| Network | Chain ID | RPC Endpoint | Explorer (Flow) | Explorer (EVM) |
|---------|----------|-------------|-----------------|----------------|
| Testnet | 545 | `https://testnet.evm.nodes.onflow.org` | [testnet.explorer.flow.com](https://testnet.explorer.flow.com) | [testnet.evm.flow.com](https://testnet.evm.flow.com) |
| Mainnet | 747 | `https://mainnet.evm.nodes.onflow.org` | [explorer.flow.com](https://explorer.flow.com) | [evm.flow.com](https://evm.flow.com) |

### IPFS via Storacha (Protocol Labs)

Every payment receipt is pinned to [IPFS](https://ipfs.io) through [Storacha](https://storacha.network) (by Protocol Labs, the creators of IPFS and Filecoin). Receipts are permanent, content-addressed JSON documents viewable at `https://storacha.link/ipfs/<CID>`.

The SDK supports pluggable IPFS backends:

| Adapter | Use Case |
|---------|----------|
| `createStorachaAdapter()` | Production — Storacha (formerly web3.storage) |
| `createKuboAdapter()` | Self-hosted Kubo IPFS node |
| `createMemoryAdapter()` | Testing / development |

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) >= 18
- [Foundry](https://getfoundry.sh) (for contract development)
- A wallet with Flow testnet tokens ([Flow Faucet](https://faucet.flow.com))

### Run the Demo

```bash
# Install dependencies
cd demo && npm install

# Optional: configure IPFS (see docs/storacha-setup.md)
# cp .env.example .env

# Start the demo
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Deployed Contracts (Testnet)

| Contract | Address | Explorer |
|----------|---------|----------|
| VeraPay (EVM) | `0x24730C8387C11e6031f692Bf0B14000D93271766` | [View on Blockscout](https://testnet.evm.flow.com/address/0x24730C8387C11e6031f692Bf0B14000D93271766) |
| Mock USDC (EVM) | `0x9C080703256BDF9Ea1b485aE72f13E31f74C558b` | [View on Blockscout](https://testnet.evm.flow.com/address/0x9C080703256BDF9Ea1b485aE72f13E31f74C558b) |
| VeraPayScheduledPaymentHandler (Cadence) | `A.7c0bf27829276c6b` | [View on Flow Explorer](https://testnet.explorer.flow.com/account/0x7c0bf27829276c6b) |

---

## Documentation

| Document | Description |
|----------|-------------|
| [SDK README](./sdk/README.md) | Full API reference and npm package tutorial |
| [Getting Started](./docs/getting-started.md) | Step-by-step integration guide |
| [Architecture](./docs/architecture.md) | System design and component overview |
| [Flow Integration](./docs/flow-integration.md) | Dual-VM, scheduled transactions, COAs |
| [Storacha Setup](./docs/storacha-setup.md) | Configure IPFS receipt pinning |

---

## Repository Structure

| Folder | Description | README |
|--------|-------------|--------|
| [`sdk/`](./sdk/) | `@vera-pay/sdk` npm package — the core product | [SDK docs](./sdk/README.md) |
| [`contracts/`](./contracts/) | Solidity smart contracts (Foundry) | [Contracts docs](./contracts/README.md) |
| [`vera-pay/`](./vera-pay/) | Cadence scheduled transaction handler | [Cadence docs](./vera-pay/README.md) |
| [`demo/`](./demo/) | Vite + React demo application | [Demo docs](./demo/README.md) |
| [`docs/`](./docs/) | Extended documentation | [Docs index](./docs/README.md) |

---

## Tech Stack

- **Smart Contracts**: Solidity 0.8.24, OpenZeppelin, Foundry
- **Blockchain**: Flow EVM + Cadence (dual-VM)
- **Scheduled Payments**: Cadence `FlowTransactionScheduler` + cross-VM COA calls
- **SDK**: TypeScript, ethers.js v6, FCL (Flow Client Library), tsup
- **IPFS**: Storacha by Protocol Labs / Kubo HTTP API
- **Demo**: Vite, React, TypeScript

## License

MIT

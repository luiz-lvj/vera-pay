# VeraPay

**Stripe, but on-chain.** Subscription payments powered by stablecoins on [Flow Blockchain](https://flow.com), with immutable receipts on [IPFS](https://ipfs.io) via [Storacha](https://storacha.network) (Protocol Labs).

VeraPay is a TypeScript SDK (`@vera-pay/sdk`) that gives any dApp Stripe-like subscription billing — plan creation, one-click subscribe, ERC-20 payment pulling, IPFS receipts, and **fully on-chain scheduled recurring payments** using Flow's native Cadence scheduled transactions. No off-chain keepers or cron jobs required.

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

See the full SDK documentation in [`sdk/README.md`](./sdk/README.md) and [`docs/`](./docs/).

---

## Key Technologies

### Flow Blockchain

VeraPay leverages Flow's unique **dual-VM architecture**:

- **Flow EVM** — Runs the `VeraPay.sol` smart contract. Compatible with MetaMask, ethers.js, Foundry, and all EVM tooling.
- **Cadence** — Flow's native language powers [scheduled transactions](https://developers.flow.com/build/cadence/advanced-concepts/scheduled-transactions) and cross-VM calls via Cadence Owned Accounts (COAs), enabling autonomous recurring payments without off-chain infrastructure.

| Network | Chain ID | RPC Endpoint | Explorer |
|---------|----------|-------------|----------|
| Testnet | 545 | `https://testnet.evm.nodes.onflow.org` | [testnet.explorer.flow.com](https://testnet.explorer.flow.com) |
| Mainnet | 747 | `https://mainnet.evm.nodes.onflow.org` | [explorer.flow.com](https://explorer.flow.com) |

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
cd sdk && npm install && npm run build && cd ..
cd demo && npm install

# Optional: configure IPFS (see docs/storacha-setup.md)
# cp .env.example .env

# Start the demo
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Repository Structure

| Folder | Description | README |
|--------|-------------|--------|
| [`sdk/`](./sdk/) | `@vera-pay/sdk` npm package — the core product | [SDK docs](./sdk/README.md) |
| [`contracts/`](./contracts/) | Solidity smart contracts (Foundry) | [Contracts docs](./contracts/README.md) |
| [`vera-pay/`](./vera-pay/) | Cadence scheduled transaction handler | [Cadence docs](./vera-pay/README.md) |
| [`demo/`](./demo/) | Vite + React demo application | [Demo docs](./demo/README.md) |
| [`docs/`](./docs/) | Extended documentation | — |

---

## Deployed Contracts (Testnet)

| Contract | Address | Network |
|----------|---------|---------|
| VeraPay (EVM) | `0x24730C8387C11e6031f692Bf0B14000D93271766` | Flow EVM Testnet |
| Mock USDC (EVM) | `0x9C080703256BDF9Ea1b485aE72f13E31f74C558b` | Flow EVM Testnet |
| VeraPayScheduledPaymentHandler (Cadence) | `A.7c0bf27829276c6b.VeraPayScheduledPaymentHandler` | Flow Testnet |

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

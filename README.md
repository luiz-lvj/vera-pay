# VeraPay

**Stripe, but on-chain.** Subscription payments powered by stablecoins on [Flow EVM](https://developers.flow.com/evm/networks), with immutable receipts on [IPFS](https://ipfs.io) via Protocol Labs.

Integrators install the SDK as an npm package and get a drop-in checkout experience for recurring stablecoin payments — just like Stripe subscriptions, but fully on-chain.

---

## Architecture

```
vera-pay/
├── contracts/   Solidity smart contracts (Foundry) — deployed on Flow EVM
├── sdk/         TypeScript npm package — @verapay/sdk
└── demo/        Vite + React demo showing a streaming-platform checkout
```

### How it works

1. **Merchant** creates a subscription plan on-chain (token, price, interval, metadata).
2. **Subscriber** approves the ERC-20 stablecoin and subscribes — first payment is pulled immediately.
3. **Keeper / Relayer** (SDK-provided) monitors due payments and triggers them automatically.
4. Every payment emits an event; the SDK pins a receipt to **IPFS** for immutable proof.

```
┌──────────┐  createPlan()   ┌──────────────┐
│ Merchant │ ──────────────> │              │
└──────────┘                 │  VeraPay.sol │  ──> IPFS receipt
┌──────────┐  subscribe()    │  (Flow EVM)  │
│  User    │ ──────────────> │              │
└──────────┘                 └──────────────┘
                                    ▲
┌──────────┐  processPayment()      │
│  Keeper  │ ───────────────────────┘
└──────────┘  (SDK startKeeper)
```

### Flow Blockchain

VeraPay deploys on **Flow EVM** — an EVM-compatible environment running on Flow. Key advantages:

- **Low gas costs** — transactions cost fractions of a cent
- **EVM tooling** — works with MetaMask, Foundry, ethers.js, wagmi
- **Scheduled Transactions** — Flow's Cadence layer supports native [scheduled transactions](https://developers.flow.com/build/cadence/advanced-concepts/scheduled-transactions) for future autonomous payment processing via cross-VM calls

| Network  | Chain ID | RPC Endpoint                            |
| -------- | -------- | --------------------------------------- |
| Testnet  | 545      | `https://testnet.evm.nodes.onflow.org`  |
| Mainnet  | 747      | `https://mainnet.evm.nodes.onflow.org`  |

### IPFS & Protocol Labs

Every payment receipt is pinned to IPFS for **immutability and verifiability**. The SDK supports multiple IPFS backends:

- **`createW3upAdapter()`** — Protocol Labs' [w3up-client](https://www.npmjs.com/package/@web3-storage/w3up-client) (recommended for production)
- **`createKuboAdapter()`** — Any Kubo-compatible IPFS HTTP API
- **`createMemoryAdapter()`** — In-memory store for testing

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) >= 18
- [Foundry](https://getfoundry.sh) (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- A wallet with Flow testnet tokens ([Flow Faucet](https://faucet.flow.com))

### 1. Smart Contracts

```bash
cd contracts

# Build
forge build

# Test (16 tests)
forge test -vvv

# Deploy to Flow Testnet
cp .env.example .env
# Edit .env with your private key and fee recipient address
source .env
forge script script/Deploy.s.sol \
  --broadcast \
  --rpc-url https://testnet.evm.nodes.onflow.org \
  --private-key $PRIVATE_KEY \
  --legacy
```

### 2. SDK

```bash
cd sdk
npm install
npm run build
```

**Usage in your project:**

```ts
import { VeraPayClient, createW3upAdapter } from "@verapay/sdk";
import { ethers } from "ethers";

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const veraPay = VeraPayClient.fromNetwork(
  "flow-testnet",
  "0xYourDeployedContract",
  signer,
  createW3upAdapter(w3upClient)
);

// Create a plan (merchant)
const { planId } = await veraPay.createPlan({
  paymentToken: "0xd431955D55a99EF69BEb96BA34718d0f9fBc91b1", // USDC on Flow Testnet
  amount: ethers.parseUnits("9.99", 6),
  interval: 30n * 24n * 3600n, // monthly
  name: "Pro Plan",
});

// Subscribe (user) — handles approval + first payment
const { subscriptionId, receipt } = await veraPay.subscribeWithApproval(planId);

// Auto-process future payments (keeper)
const stop = veraPay.startKeeper([subscriptionId], 60_000, (receipt) => {
  console.log("Payment processed, IPFS CID:", receipt.ipfsCid);
});
```

### 3. Demo

```bash
cd demo
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to see the checkout demo.

---

## Smart Contract API

| Function                  | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `createPlan()`            | Merchant creates a subscription plan                |
| `togglePlan()`            | Enable/disable a plan                               |
| `subscribe()`             | User subscribes and pays first installment          |
| `processPayment()`        | Anyone can trigger a due payment                    |
| `batchProcessPayments()`  | Process multiple due payments in one tx             |
| `cancelSubscription()`    | Subscriber or merchant cancels                      |
| `isPaymentDue()`          | Check if a subscription payment is due              |
| `getDuePayments()`        | Batch-check which subscriptions are due             |

Protocol fee: configurable 0–10% (default 0.5%), split from each payment.

---

## Tech Stack

- **Smart Contracts**: Solidity 0.8.24, OpenZeppelin, Foundry
- **Blockchain**: Flow EVM (Testnet Chain ID 545 / Mainnet 747)
- **SDK**: TypeScript, ethers.js v6, tsup
- **IPFS**: Protocol Labs w3up-client / Kubo HTTP API
- **Demo**: Vite, React, TypeScript

---

## License

MIT

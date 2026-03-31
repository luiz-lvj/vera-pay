# @verapay/sdk

On-chain subscription payments SDK for [Flow Blockchain](https://flow.com). Create plans, accept recurring stablecoin payments, schedule autonomous on-chain payment processing, and pin immutable receipts to IPFS via [Storacha](https://storacha.network) (Protocol Labs).

## Installation

```bash
npm install @verapay/sdk ethers
```

`ethers` v6 is a peer dependency.

## Overview

The SDK provides two main classes:

| Class | Purpose |
|-------|---------|
| `VeraPayClient` | Interact with the VeraPay EVM smart contract — create plans, subscribe, process payments |
| `FlowScheduler` | Schedule autonomous recurring payments using Flow's native Cadence scheduled transactions |

Both support optional IPFS integration for pinning payment receipts.

---

## Quick Start

### 1. Connect to VeraPay

```typescript
import { VeraPayClient, createStorachaAdapter, DEPLOYED_CONTRACTS } from "@verapay/sdk";
import { ethers } from "ethers";

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Optional: IPFS adapter for receipt pinning
const ipfs = createStorachaAdapter({
  key: process.env.STORACHA_KEY!,
  proof: process.env.STORACHA_PROOF!,
});

const client = VeraPayClient.fromNetwork(
  "flow-testnet",
  DEPLOYED_CONTRACTS["flow-testnet"],
  signer,
  ipfs
);
```

### 2. Create a Subscription Plan (Merchant)

```typescript
import { KNOWN_TOKENS } from "@verapay/sdk";

const { planId } = await client.createPlan({
  paymentToken: KNOWN_TOKENS["flow-testnet"].USDC,
  amount: ethers.parseUnits("9.99", 18),
  interval: 30n * 24n * 3600n, // 30 days
  name: "Pro Plan",
});

console.log("Plan created:", planId);
```

### 3. Subscribe (User)

```typescript
// Handles ERC-20 approval + subscription in one call
const { subscriptionId, receipt } = await client.subscribeWithApproval(planId);

console.log("Subscription ID:", subscriptionId);
console.log("IPFS receipt:", receipt.ipfsCid);
```

### 4. Schedule Recurring Payments (No Keeper Needed)

```typescript
import { FlowScheduler, CADENCE_HANDLERS } from "@verapay/sdk";

const scheduler = new FlowScheduler({
  network: "testnet",
  handlerAddress: CADENCE_HANDLERS["flow-testnet"],
  evmContractAddress: DEPLOYED_CONTRACTS["flow-testnet"],
  ipfsAdapter: ipfs,
});

// Authenticate with a Flow wallet (Blocto, Lilico, etc.)
await scheduler.authenticate();

// One-time setup: create a Cadence Owned Account + init handler
await scheduler.setup();

// Approve the stablecoin for the COA
await scheduler.approveERC20(KNOWN_TOKENS["flow-testnet"].USDC);

// Subscribe to a plan AND schedule the next payment — single transaction
const result = await scheduler.subscribeAndSchedule({
  planId: "0",
  intervalSeconds: "2592000.0", // 30 days in seconds
});

console.log("Flow TX:", result.flowTxId);
console.log("Scheduled TX:", result.scheduledTxId);
console.log("IPFS CID:", result.ipfsCid);
```

---

## API Reference

### `VeraPayClient`

#### Factory

| Method | Description |
|--------|-------------|
| `VeraPayClient.fromNetwork(network, contractAddress, signerOrProvider, ipfsAdapter?)` | Create a client configured for a known Flow network |
| `new VeraPayClient(config, signerOrProvider, ipfsAdapter?)` | Create with manual config |

#### Merchant

| Method | Returns | Description |
|--------|---------|-------------|
| `createPlan(params)` | `{ planId, tx }` | Create a subscription plan |
| `togglePlan(planId)` | `TransactionResponse` | Enable/disable a plan |
| `getMerchantPlans(address)` | `bigint[]` | List plan IDs for a merchant |

#### Subscriber

| Method | Returns | Description |
|--------|---------|-------------|
| `subscribeWithApproval(planId, options?)` | `{ subscriptionId, receipt, tx }` | Approve tokens + subscribe (recommended) |
| `subscribe(planId)` | `{ subscriptionId, receipt, tx }` | Subscribe (requires prior approval) |
| `cancelSubscription(subId)` | `TransactionResponse` | Cancel a subscription |
| `getSubscriberSubscriptions(address)` | `bigint[]` | List subscription IDs for a subscriber |

#### Keeper / Relayer

| Method | Returns | Description |
|--------|---------|-------------|
| `processPayment(subId)` | `{ receipt, tx }` | Process a single due payment |
| `batchProcessPayments(subIds)` | `TransactionResponse` | Process multiple due payments |
| `isPaymentDue(subId)` | `boolean` | Check if a payment is due |
| `getDuePayments(subIds)` | `bigint[]` | Filter to due subscriptions |
| `startKeeper(subIds, intervalMs, callback)` | `() => void` | Start an auto-processing loop (returns stop function) |

#### Read-Only

| Method | Returns | Description |
|--------|---------|-------------|
| `listActivePlans()` | `Plan[]` | All active plans |
| `getPlan(planId)` | `Plan` | Single plan details |
| `getSubscription(subId)` | `Subscription` | Single subscription details |
| `getNextPlanId()` | `bigint` | Next plan ID counter |
| `getNextSubscriptionId()` | `bigint` | Next subscription ID counter |

#### IPFS

| Method | Returns | Description |
|--------|---------|-------------|
| `hasIPFS` | `boolean` | Whether an IPFS adapter is configured |
| `pinReceipt(receipt)` | `string` | Pin a receipt to IPFS, returns CID |
| `fetchReceipt(cid)` | `PaymentReceipt` | Fetch a receipt from IPFS |

#### Events

| Method | Description |
|--------|-------------|
| `onPaymentProcessed(callback, filter?)` | Listen for payment events (auto-pins to IPFS) |
| `removeAllListeners()` | Remove all event listeners |

---

### `FlowScheduler`

Manages Flow Cadence interactions for scheduled payments. Uses [FCL](https://github.com/onflow/fcl-js) for wallet authentication.

#### Constructor

```typescript
new FlowScheduler({
  network: "testnet" | "mainnet",
  handlerAddress: string,       // Cadence handler deployer address (without 0x)
  evmContractAddress: string,   // VeraPay EVM contract address (with 0x)
  ipfsAdapter?: IPFSAdapter,    // Optional IPFS adapter
})
```

#### Wallet

| Method | Returns | Description |
|--------|---------|-------------|
| `authenticate()` | `{ addr }` | Connect Flow wallet (Blocto, Lilico, etc.) |
| `unauthenticate()` | `void` | Disconnect wallet |
| `currentUser()` | `string \| null` | Get connected Flow address |

#### Account Setup

| Method | Returns | Description |
|--------|---------|-------------|
| `setupCOA(fundAmount?)` | `string` | Create a Cadence Owned Account (funds with FLOW for EVM gas) |
| `initHandler()` | `string` | Initialize the VeraPay payment handler on your account |
| `setup(fundAmount?)` | `{ coaTxId, handlerTxId }` | Convenience: COA + handler in sequence |

#### EVM via COA

| Method | Returns | Description |
|--------|---------|-------------|
| `approveERC20(tokenAddress, amount?)` | `string` | Approve VeraPay to spend tokens from the COA |
| `subscribeToPlan(planId)` | `string` | Subscribe the COA to a plan |
| `subscribeAndSchedule(params)` | `SubscribeAndScheduleResult` | Subscribe + schedule next payment in one transaction |

#### Scheduling

| Method | Returns | Description |
|--------|---------|-------------|
| `schedulePayment(params)` | `string` | Schedule a future payment for an existing subscription |
| `cancelScheduledPayment(txId)` | `string` | Cancel a scheduled payment |

#### Utilities

| Method | Returns | Description |
|--------|---------|-------------|
| `getCoaEvmAddress(flowAddress?)` | `string \| null` | Get the COA's EVM address |
| `waitForTransaction(txId)` | `{ status, events }` | Wait for a Cadence transaction to seal |
| `FlowScheduler.extractScheduledTxId(events)` | `string \| undefined` | Extract scheduled tx ID from events (static) |

---

## IPFS Integration (Storacha / Protocol Labs)

VeraPay pins payment receipts to [IPFS](https://ipfs.io) via [Storacha](https://storacha.network), built by Protocol Labs (the creators of IPFS and Filecoin). Receipts are content-addressed JSON documents that serve as permanent, verifiable proof of payment.

### Setup Storacha

```bash
npm install -g @storacha/cli

storacha login you@email.com
storacha space create verapay-receipts

# Generate a signing key
storacha key create --json
# { "did": "did:key:z6Mk...", "key": "MgCaT7Se2QX9..." }

# Delegate capabilities
storacha delegation create did:key:z6Mk... \
  -c space/blob/add -c space/index/add \
  -c filecoin/offer -c upload/add --base64
# mAYIEAP8OEaJlcm9v...
```

### Use in Code

```typescript
import { createStorachaAdapter } from "@verapay/sdk";

const ipfs = createStorachaAdapter({
  key: "MgCaT7Se2QX9...",    // from `storacha key create`
  proof: "mAYIEAP8OEaJl...", // from `storacha delegation create`
});

// Pass to VeraPayClient or FlowScheduler
const client = VeraPayClient.fromNetwork("flow-testnet", addr, signer, ipfs);
```

### Pluggable Adapters

| Adapter | Usage |
|---------|-------|
| `createStorachaAdapter({ key, proof })` | Production — Storacha (Protocol Labs) |
| `createKuboAdapter(apiUrl)` | Self-hosted IPFS node (Kubo HTTP API) |
| `createMemoryAdapter()` | In-memory store for testing |

### Receipt Format

```json
{
  "subscriptionId": "1",
  "planId": "0",
  "subscriber": "0x...",
  "merchant": "0x...",
  "amount": "9990000000000000000",
  "protocolFee": "49950000000000000",
  "timestamp": 1711900000,
  "txHash": "0x...",
  "blockNumber": 12345678,
  "chainId": 545,
  "ipfsCid": "bafybeig..."
}
```

Receipts are viewable at `https://storacha.link/ipfs/<CID>`.

---

## Flow Blockchain: Dual-VM Architecture

VeraPay uniquely leverages Flow's dual-VM architecture:

### Flow EVM

The `VeraPay.sol` smart contract runs on Flow EVM — a full EVM environment on Flow. Works with all standard EVM tooling: MetaMask, ethers.js, Foundry, wagmi.

### Cadence Scheduled Transactions

Flow's native Cadence layer provides [scheduled transactions](https://developers.flow.com/build/cadence/advanced-concepts/scheduled-transactions) — the ability to schedule code execution at a future time, directly on-chain. VeraPay uses this to:

1. Schedule `processPayment()` calls at the subscription interval
2. Execute via a **Cadence Owned Account (COA)** that bridges Cadence to EVM
3. Pull the ERC-20 payment from the subscriber to the merchant

This replaces off-chain keepers, cron jobs, and Chainlink Automation with a fully on-chain solution native to Flow.

---

## Constants & Exports

```typescript
import {
  // Deployed contract addresses
  DEPLOYED_CONTRACTS,  // { "flow-testnet": "0x2473..." }
  CADENCE_HANDLERS,    // { "flow-testnet": "7c0bf2..." }
  KNOWN_TOKENS,        // { "flow-testnet": { USDC: "0x9C08..." } }
  NETWORKS,            // { "flow-testnet": { chainId, rpcUrl, ... } }

  // IPFS
  DEFAULT_IPFS_GATEWAY,
  ipfsGatewayUrl,

  // ABIs
  VERA_PAY_ABI,
  ERC20_ABI,
} from "@verapay/sdk";
```

---

## Types

```typescript
interface Plan {
  planId: bigint;
  merchant: string;
  paymentToken: string;
  amount: bigint;
  interval: bigint;
  name: string;
  metadataURI: string;
  active: boolean;
}

interface Subscription {
  subscriptionId: bigint;
  planId: bigint;
  subscriber: string;
  startTime: bigint;
  lastPaymentTime: bigint;
  paymentsCount: bigint;
  active: boolean;
}

interface PaymentReceipt {
  subscriptionId: string;
  planId: string;
  subscriber: string;
  merchant: string;
  amount: string;
  protocolFee: string;
  timestamp: number;
  txHash: string;
  blockNumber: number;
  chainId: number;
  ipfsCid?: string;
}

interface SubscribeAndScheduleResult {
  flowTxId: string;
  scheduledTxId?: string;
  receipt?: PaymentReceipt;
  ipfsCid?: string;
}
```

## License

MIT

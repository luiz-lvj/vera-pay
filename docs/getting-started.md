# Getting Started with @vera-pay/sdk

This guide walks you through integrating VeraPay subscription payments into your dApp.

## Prerequisites

- Node.js >= 18
- A wallet with Flow testnet tokens ([Flow Faucet](https://faucet.flow.com))
- Basic familiarity with ethers.js

## Installation

```bash
npm install @vera-pay/sdk ethers
```

## 1. Initialize the Client

```typescript
import {
  VeraPayClient,
  DEPLOYED_CONTRACTS,
  KNOWN_TOKENS,
} from "@vera-pay/sdk";
import { ethers } from "ethers";

// Browser (MetaMask)
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Or Node.js
// const provider = new ethers.JsonRpcProvider("https://testnet.evm.nodes.onflow.org");
// const signer = new ethers.Wallet(PRIVATE_KEY, provider);

const client = VeraPayClient.fromNetwork(
  "flow-testnet",
  DEPLOYED_CONTRACTS["flow-testnet"],
  signer
);
```

## 2. Create a Subscription Plan (Merchant)

```typescript
const { planId, tx } = await client.createPlan({
  paymentToken: KNOWN_TOKENS["flow-testnet"].USDC,
  amount: ethers.parseUnits("9.99", 18), // 9.99 USDC
  interval: 30n * 24n * 3600n,           // 30 days in seconds
  name: "Pro Plan",
});

console.log(`Plan #${planId} created in tx ${tx.hash}`);
```

## 3. Subscribe (User)

The simplest path — approves the token and subscribes in one call:

```typescript
const { subscriptionId, receipt, tx } = await client.subscribeWithApproval(planId);

console.log(`Subscribed! ID: ${subscriptionId}`);
console.log(`First payment tx: ${tx.hash}`);
```

If you want to handle approval separately:

```typescript
// Manual approval
const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
await (await token.approve(client.contractAddress, amount)).wait();

// Then subscribe
const { subscriptionId } = await client.subscribe(planId);
```

## 4. Process Payments

### Option A: Off-chain Keeper (simple)

```typescript
const stop = client.startKeeper(
  [subscriptionId],
  60_000, // check every 60 seconds
  (receipt) => {
    console.log(`Payment processed: ${receipt.txHash}`);
  }
);

// Later: stop the keeper
stop();
```

### Option B: On-chain Scheduled Transactions (recommended)

No off-chain infrastructure needed. Uses Flow's native Cadence scheduled transactions:

```typescript
import { FlowScheduler, CADENCE_HANDLERS } from "@vera-pay/sdk";

const scheduler = new FlowScheduler({
  network: "testnet",
  handlerAddress: CADENCE_HANDLERS["flow-testnet"],
  evmContractAddress: DEPLOYED_CONTRACTS["flow-testnet"],
});

// Connect Flow wallet
await scheduler.authenticate();

// One-time setup
await scheduler.setup(); // Creates COA + initializes handler

// Approve token spending from COA
await scheduler.approveERC20(KNOWN_TOKENS["flow-testnet"].USDC);

// Subscribe AND schedule future payment in one transaction
const result = await scheduler.subscribeAndSchedule({
  planId: planId.toString(),
  intervalSeconds: "2592000.0", // 30 days
});

console.log("Scheduled TX ID:", result.scheduledTxId);
```

## 5. Add IPFS Receipts (Optional)

Pin every payment receipt to IPFS via Storacha (Protocol Labs):

```typescript
import { createStorachaAdapter } from "@vera-pay/sdk";

const ipfs = createStorachaAdapter({
  key: process.env.STORACHA_KEY!,
  proof: process.env.STORACHA_PROOF!,
});

// Pass to client
const client = VeraPayClient.fromNetwork(
  "flow-testnet",
  DEPLOYED_CONTRACTS["flow-testnet"],
  signer,
  ipfs
);

// Receipts are auto-pinned
const { receipt } = await client.subscribeWithApproval(planId);
console.log("IPFS CID:", receipt.ipfsCid);
// View at: https://storacha.link/ipfs/<CID>
```

See [Storacha Setup](./storacha-setup.md) for how to obtain the key and proof.

## 6. Query Data

```typescript
// List all active plans
const plans = await client.listActivePlans();

// Get a specific plan
const plan = await client.getPlan(0n);

// Get subscription details
const sub = await client.getSubscription(1n);

// Check if a payment is due
const isDue = await client.isPaymentDue(1n);

// Get subscriber's subscriptions
const subIds = await client.getSubscriberSubscriptions(address);

// Get merchant's plans
const planIds = await client.getMerchantPlans(address);
```

## 7. Listen for Events

```typescript
client.onPaymentProcessed((receipt) => {
  console.log("Payment:", receipt);
  console.log("IPFS:", receipt.ipfsCid);
});

// With filter (specific subscription)
client.onPaymentProcessed(
  (receipt) => console.log(receipt),
  { subscriptionId: 1n }
);

// Clean up
client.removeAllListeners();
```

## Next Steps

- [Architecture Overview](./architecture.md) — Understand the full system
- [Flow Integration](./flow-integration.md) — Deep dive into Flow's dual-VM
- [Storacha Setup](./storacha-setup.md) — Configure IPFS receipt pinning
- [SDK API Reference](../sdk/README.md) — Full API documentation

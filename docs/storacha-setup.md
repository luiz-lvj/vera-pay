# Storacha Setup (IPFS via Protocol Labs)

VeraPay pins payment receipts to [IPFS](https://ipfs.io) using [Storacha](https://storacha.network) — a storage service by [Protocol Labs](https://protocol.ai), the creators of IPFS and Filecoin. Receipts are permanent, content-addressed JSON documents that serve as immutable proof of payment.

## Prerequisites

- Node.js >= 18
- An email address for Storacha account creation

## Step-by-Step Setup

### 1. Install the Storacha CLI

```bash
npm install -g @storacha/cli
```

### 2. Create an Account

```bash
storacha login you@email.com
```

Check your inbox and click the confirmation link.

### 3. Create a Storage Space

```bash
storacha space create verapay-receipts
```

### 4. Generate a Signing Key

```bash
storacha key create --json
```

Output:

```json
{
  "did": "did:key:z6Mk...",
  "key": "MgCaT7Se2QX9..."
}
```

Save the `key` value — this is your `STORACHA_KEY`.

### 5. Delegate Capabilities

```bash
storacha delegation create did:key:z6Mk... \
  -c space/blob/add \
  -c space/index/add \
  -c filecoin/offer \
  -c upload/add \
  --base64
```

Output: a long base64 string like `mAYIEAP8OEaJlcm9v...`

Save this — this is your `STORACHA_PROOF`.

## Using in the SDK

```typescript
import { createStorachaAdapter, VeraPayClient, DEPLOYED_CONTRACTS } from "@vera-pay/sdk";

const ipfs = createStorachaAdapter({
  key: "MgCaT7Se2QX9...",       // STORACHA_KEY
  proof: "mAYIEAP8OEaJlcm9v...", // STORACHA_PROOF
});

const client = VeraPayClient.fromNetwork(
  "flow-testnet",
  DEPLOYED_CONTRACTS["flow-testnet"],
  signer,
  ipfs
);

// Receipts are automatically pinned when processing payments
const { receipt } = await client.processPayment(subscriptionId);
console.log("IPFS CID:", receipt.ipfsCid);
// View at: https://storacha.link/ipfs/<CID>
```

## Using in the Demo

Add these values to `demo/.env`:

```
VITE_STORACHA_KEY=MgCaT7Se2QX9...
VITE_STORACHA_PROOF=mAYIEAP8OEaJlcm9v...
```

The demo will automatically configure the Storacha adapter when these environment variables are present.

## Alternative IPFS Backends

The SDK supports pluggable IPFS adapters:

### Kubo (self-hosted IPFS node)

```typescript
import { createKuboAdapter } from "@vera-pay/sdk";

const ipfs = createKuboAdapter("http://localhost:5001");
```

### In-Memory (testing)

```typescript
import { createMemoryAdapter } from "@vera-pay/sdk";

const ipfs = createMemoryAdapter();
```

## Receipt Format

Every receipt is a JSON document with the following structure:

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

## Viewing Receipts

Receipts are viewable at:

```
https://storacha.link/ipfs/<CID>
```

Since they are stored on IPFS, they can also be accessed through any IPFS gateway:

```
https://ipfs.io/ipfs/<CID>
https://dweb.link/ipfs/<CID>
```

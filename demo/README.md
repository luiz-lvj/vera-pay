# VeraPay Demo

A React + Vite demo application showcasing `@verapay/sdk` integration. Demonstrates a streaming-platform checkout experience with both EVM (MetaMask) and Cadence (Flow wallet) payment flows.

## Features

- **Merchant Panel** — Create subscription plans, mint test USDC
- **Pricing Cards** — Browse and subscribe to plans via MetaMask
- **Cadence Scheduler** — Connect a Flow wallet, subscribe & schedule recurring payments using Flow's native scheduled transactions
- **Payment History** — View past payments with links to block explorer and IPFS receipts
- **Code Preview** — Copy-pasteable SDK integration example

## Running

```bash
# First, build the SDK (from repo root)
cd sdk && npm install && npm run build && cd ..

# Then run the demo
cd demo
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Environment Variables

Create a `.env` file (optional — IPFS features are disabled without these):

```
VITE_STORACHA_KEY=MgCaT7Se2QX9...
VITE_STORACHA_PROOF=mAYIEAP8OEaJlcm9v...
```

See the [Storacha setup guide](../docs/storacha-setup.md) for how to obtain these.

## SDK Usage

The demo consumes `@verapay/sdk` for all blockchain interactions:

| Component | SDK Usage |
|-----------|-----------|
| `App.tsx` | `VeraPayClient.fromNetwork()`, `createStorachaAdapter()`, `listActivePlans()` |
| `MerchantPanel` | `client.createPlan()` |
| `CheckoutModal` | `client.subscribeWithApproval()` |
| `SchedulerPanel` | `FlowScheduler` — `authenticate`, `setup`, `approveERC20`, `subscribeAndSchedule`, `schedulePayment` |
| `PaymentHistory` | Displays `PaymentReceipt` with IPFS links via `ipfsGatewayUrl()` |

## Tech Stack

- Vite + React + TypeScript
- `@verapay/sdk` for all VeraPay logic
- `ethers` v6 for EVM wallet interaction
- `@onflow/fcl` (via SDK) for Flow wallet interaction

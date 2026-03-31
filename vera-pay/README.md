# VeraPay Cadence — Scheduled Payments on Flow

This Cadence project enables **autonomous recurring subscription payments** on Flow using native [Scheduled Transactions](https://developers.flow.com/build/cadence/advanced-concepts/scheduled-transactions). A Cadence handler calls `processPayment(uint256)` on the VeraPay EVM contract via a Cadence Owned Account (COA), so payments execute at the scheduled time without any external keeper or cron job.

## How It Works

```
Subscriber                     VeraPay.sol (Flow EVM)
    │  subscribe(planId)           │
    └─────────────────────────────►│
                                   │
Flow Scheduler                     │
    │  (at scheduled time)         │
    ▼                              │
VeraPayScheduledPaymentHandler.cdc │
    │  coa.call(processPayment)    │
    └─────────────────────────────►│  pulls tokens from subscriber
                                   │
```

The `VeraPayScheduledPaymentHandler` contract implements `FlowTransactionScheduler.TransactionHandler`. When the Flow protocol triggers `executeTransaction()`, it encodes `processPayment(uint256)` via `EVM.encodeABIWithSignature` and calls it through a COA — bridging Cadence to EVM in a single on-chain operation.

## Prerequisites

- [Flow CLI](https://developers.flow.com/tools/flow-cli/install) >= 2.7.1 (`brew install flow-cli`)
- A Flow Cadence testnet account with FLOW tokens from [faucet.flow.com](https://faucet.flow.com)
- The VeraPay EVM contract deployed on Flow EVM Testnet

```bash
flow version
```

## Project Structure

```
vera-pay/
├── flow.json                          # Flow project config
├── cadence/
│   ├── contracts/
│   │   └── VeraPayScheduledPaymentHandler.cdc   # Scheduled payment handler
│   └── transactions/
│       ├── SetupCOA.cdc               # Create + fund a Cadence Owned Account
│       ├── InitVeraPayHandler.cdc     # Initialize handler with VeraPay address
│       ├── ReInitVeraPayHandler.cdc   # Re-initialize with a new VeraPay address
│       ├── SchedulePayment.cdc        # Schedule a payment for a subscription
│       └── CancelScheduledPayment.cdc # Cancel a scheduled payment
└── imports/                           # Cached dependency contracts
```

## Deploy to Flow Testnet

### Step 1: Deploy the handler contract

```bash
flow accounts add-contract cadence/contracts/VeraPayScheduledPaymentHandler.cdc \
  --signer admin -n testnet
```

### Step 2: Create a COA and fund it with FLOW

The COA is the bridge between Cadence and EVM. It needs FLOW to pay for EVM gas when calling `processPayment`.

```bash
flow transactions send cadence/transactions/SetupCOA.cdc \
  --args-json '[{"type": "UFix64", "value": "1.0"}]' \
  --signer admin -n testnet
```

### Step 3: Initialize the handler

Point the handler at your deployed VeraPay EVM contract (with the `0x` prefix):

```bash
flow transactions send cadence/transactions/InitVeraPayHandler.cdc \
  --args-json '[{"type": "String", "value": "0x24730C8387C11e6031f692Bf0B14000D93271766"}]' \
  --signer admin -n testnet
```

### Step 4: Schedule a payment

Schedule a subscription payment to be processed at a future time:

```bash
# Args: subscriptionId (UInt256), delaySeconds (UFix64), priority (UInt8), executionEffort (UInt64)
# Priority: 0 = High, 1 = Medium, 2 = Low
flow transactions send cadence/transactions/SchedulePayment.cdc \
  --args-json '[
    {"type": "UInt256", "value": "1"},
    {"type": "UFix64", "value": "3600.0"},
    {"type": "UInt8", "value": "1"},
    {"type": "UInt64", "value": "1000"}
  ]' \
  --signer admin -n testnet
```

This schedules subscription #1 to be processed in 1 hour with medium priority.

### Step 5 (optional): Cancel a scheduled payment

```bash
flow transactions send cadence/transactions/CancelScheduledPayment.cdc \
  --args-json '[{"type": "UInt64", "value": "42"}]' \
  --signer admin -n testnet
```

A partial fee refund (currently 50%) is deposited back to your vault.

### Re-initialize the handler (new VeraPay address)

If you redeploy the VeraPay EVM contract, use `ReInitVeraPayHandler.cdc` to point the handler at the new address. This destroys the old handler resource and creates a new one:

```bash
flow transactions send cadence/transactions/ReInitVeraPayHandler.cdc \
  --args-json '[{"type": "String", "value": "0xNEW_VERAPAY_ADDRESS"}]' \
  --signer admin -n testnet
```

## SDK Integration

The `@verapay/sdk` wraps all these Cadence transactions via `FlowScheduler`:

```typescript
import { FlowScheduler, CADENCE_HANDLERS, DEPLOYED_CONTRACTS } from "@verapay/sdk";

const scheduler = new FlowScheduler({
  network: "testnet",
  handlerAddress: CADENCE_HANDLERS["flow-testnet"],
  evmContractAddress: DEPLOYED_CONTRACTS["flow-testnet"],
});

await scheduler.authenticate();
await scheduler.setup();           // COA + handler in one call
await scheduler.approveERC20(tokenAddress);

const result = await scheduler.subscribeAndSchedule({
  planId: "0",
  intervalSeconds: "2592000.0",
});
```

See [`sdk/README.md`](../sdk/README.md) for full API documentation.

## Monitoring Events

```bash
flow events get \
  A.8c5303eaa26202d6.FlowTransactionScheduler.Scheduled \
  A.8c5303eaa26202d6.FlowTransactionScheduler.Executed \
  A.8c5303eaa26202d6.FlowTransactionScheduler.Canceled \
  --last 200 -n testnet
```

## Scheduling Fees

Scheduled transactions require upfront FLOW fees with a priority multiplier:

| Priority | Multiplier | Use case |
|----------|------------|----------|
| High | 10x | Time-critical payments |
| Medium | 5x | Standard recurring payments |
| Low | 2x | Best-effort, cheapest |

## Contract Addresses (Testnet)

| Contract | Address |
|----------|---------|
| VeraPayScheduledPaymentHandler | `A.7c0bf27829276c6b.VeraPayScheduledPaymentHandler` |
| FlowTransactionScheduler | `0x8c5303eaa26202d6` |
| FlowTransactionSchedulerUtils | `0x8c5303eaa26202d6` |
| EVM | `0x8c5303eaa26202d6` |
| FlowToken | `0x7e60df042a9c0868` |

## Local Development (Emulator)

```bash
flow emulator --scheduled-transactions
flow project deploy

flow transactions send cadence/transactions/SetupCOA.cdc \
  --args-json '[{"type": "UFix64", "value": "100.0"}]'
```

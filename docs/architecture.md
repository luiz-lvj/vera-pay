# VeraPay Architecture

## System Overview

VeraPay is an on-chain subscription payment protocol deployed on Flow Blockchain. It uses a dual-VM architecture that combines Solidity smart contracts (Flow EVM) with Cadence scheduled transactions for autonomous payment processing, and IPFS (via Storacha/Protocol Labs) for immutable payment receipts.

```
┌─────────────────────────────────────────────────────────────────┐
│                        @vera-pay/sdk                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  VeraPayClient   │  │  FlowScheduler   │  │ IPFS Adapters│  │
│  │  (ethers.js)     │  │  (FCL)           │  │ (Storacha)   │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘  │
└───────────┼──────────────────────┼───────────────────┼──────────┘
            │                      │                   │
    ┌───────▼───────┐     ┌───────▼────────┐   ┌──────▼───────┐
    │  Flow EVM     │     │  Flow Cadence  │   │  IPFS        │
    │  VeraPay.sol  │◄────│  COA + Handler │   │  (Storacha)  │
    │  MockERC20    │     │  Scheduled Txs │   │              │
    └───────────────┘     └────────────────┘   └──────────────┘
```

## Components

### 1. VeraPay.sol (Flow EVM)

The Solidity smart contract that manages the core subscription logic:

- **Plans** — Merchants create plans with a token, amount, interval, and name. Plan IDs are sequential starting at 0.
- **Subscriptions** — Users subscribe to plans by calling `subscribe(planId)`. The first payment is pulled immediately. Subscription IDs start at 1.
- **Payment Processing** — `processPayment(subId)` pulls the next payment from a subscriber. It checks that the subscription is active and the interval has elapsed. This function is permissionless — anyone (or any contract) can call it.
- **Protocol Fee** — A configurable fee (0-10%, default 0.5%) is split from each payment and sent to the protocol fee recipient.

### 2. FlowScheduler + VeraPayScheduledPaymentHandler (Cadence)

Flow's Cadence layer provides **native scheduled transactions** — the ability to schedule code execution at a specific future time, directly on-chain.

The `VeraPayScheduledPaymentHandler` contract:
1. Implements `FlowTransactionScheduler.TransactionHandler`
2. Stores the VeraPay EVM contract address
3. When `executeTransaction()` is triggered by the Flow protocol at the scheduled time:
   - Encodes `processPayment(uint256)` using `EVM.encodeABIWithSignature`
   - Calls it through a **Cadence Owned Account (COA)** which bridges Cadence to EVM
   - The EVM call pulls the stablecoin payment from subscriber to merchant

This replaces off-chain keepers entirely. The payment processing is fully on-chain and autonomous.

### 3. IPFS via Storacha (Protocol Labs)

Every payment receipt is a JSON document pinned to IPFS through Storacha (by Protocol Labs, creators of IPFS and Filecoin). Receipts contain:

- Subscription and plan identifiers
- Subscriber and merchant addresses
- Payment amount and protocol fee
- Transaction hash, block number, chain ID
- Timestamp

Receipts are content-addressed (CID) and permanently verifiable.

## Payment Flow: EVM Path

```
1. Merchant calls createPlan(token, amount, interval, name)
2. User approves ERC-20 spending (via subscribeWithApproval)
3. User calls subscribe(planId)
   → First payment pulled immediately
   → IPFS receipt pinned
4. Anyone calls processPayment(subId) when interval elapses
   → Next payment pulled
   → IPFS receipt pinned
```

## Payment Flow: Cadence Scheduled Path

```
1. User connects Flow wallet (Blocto, Lilico, etc.)
2. User sets up COA (Cadence Owned Account) + funds with FLOW
3. User initializes VeraPayScheduledPaymentHandler
4. User approves ERC-20 from COA to VeraPay
5. User calls subscribeAndSchedule(planId, interval)
   → Cadence transaction:
     a. Encodes subscribe(planId) → calls via COA
     b. Decodes subscriptionId from return data
     c. Schedules FlowTransactionScheduler with interval
   → IPFS receipt pinned
6. At scheduled time, Flow protocol triggers executeTransaction()
   → processPayment called via COA
   → Payment pulled automatically
```

## Cross-VM Communication

Flow's unique architecture allows seamless communication between Cadence and EVM:

- **COA (Cadence Owned Account)**: An EVM account controlled by a Cadence resource. Cadence code can call any EVM contract through a COA.
- **EVM.call()**: Cadence function that executes an EVM transaction
- **EVM.encodeABIWithSignature()**: Encodes function calls for EVM
- **EVM.decodeABI()**: Decodes return values from EVM calls

This enables the scheduled payment handler to be written entirely in Cadence while interacting with EVM contracts.

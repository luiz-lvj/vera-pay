# Flow Blockchain Integration

VeraPay is built on [Flow Blockchain](https://flow.com), leveraging its unique dual-VM architecture that combines a full EVM environment with Cadence — Flow's native smart contract language.

## Why Flow?

### Dual-VM Architecture

Flow runs both an EVM and a Cadence VM side by side. This gives VeraPay:

1. **EVM compatibility** — The core `VeraPay.sol` contract runs on Flow EVM. Users interact via MetaMask, ethers.js, and all standard EVM tooling.
2. **Cadence Scheduled Transactions** — Flow's native scheduler enables autonomous payment execution at future times, directly on-chain. No off-chain keepers, no cron jobs.
3. **Cross-VM Communication** — Cadence can call EVM contracts through Cadence Owned Accounts (COAs), enabling the scheduled handler to trigger `processPayment()` on the EVM contract.

### Low Gas Costs

Flow EVM transactions cost fractions of a cent, making micro-payments and frequent subscription billing economically viable.

## Network Configuration

| Network | Chain ID | RPC Endpoint | Explorer |
|---------|----------|-------------|----------|
| Testnet | 545 | `https://testnet.evm.nodes.onflow.org` | [testnet.explorer.flow.com](https://testnet.explorer.flow.com) |
| Mainnet | 747 | `https://mainnet.evm.nodes.onflow.org` | [explorer.flow.com](https://explorer.flow.com) |

For EVM accounts:
- Testnet: [testnet.evm.flow.com](https://testnet.evm.flow.com)
- Mainnet: [evm.flow.com](https://evm.flow.com)

## Flow EVM

The `VeraPay.sol` Solidity contract is deployed on Flow EVM. From a developer perspective, this is standard EVM:

```typescript
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://testnet.evm.nodes.onflow.org");
```

Users connect with MetaMask (add Flow EVM Testnet as a custom network: Chain ID 545, RPC URL above).

## Cadence Scheduled Transactions

Flow's Cadence layer provides [scheduled transactions](https://developers.flow.com/build/cadence/advanced-concepts/scheduled-transactions) — the ability to schedule code execution at a specific future time.

### How Scheduled Transactions Work

1. A user schedules a transaction by calling `FlowTransactionScheduler.schedule()` on the Cadence side
2. The user provides a `TransactionHandler` resource that implements `executeTransaction()`
3. At the scheduled time, the Flow protocol calls `executeTransaction()` on the handler
4. The handler executes whatever logic it needs — in VeraPay's case, it calls `processPayment()` on the EVM contract

### VeraPay's Scheduled Handler

```cadence
access(all) contract VeraPayScheduledPaymentHandler {
    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {
        access(all) let verapayAddress: String

        access(all) fun executeTransaction(
            executionContext: &FlowTransactionScheduler.ExecutionContext
        ) {
            // Encode processPayment(subscriptionId)
            let calldata = EVM.encodeABIWithSignature(
                "processPayment(uint256)",
                [subscriptionId]
            )

            // Call via COA (Cadence → EVM bridge)
            let result = coa.call(
                to: verapayEvmAddress,
                data: calldata,
                gasLimit: 500000,
                value: EVM.Balance(attoflow: 0)
            )
        }
    }
}
```

### Cadence Owned Accounts (COA)

A COA is an EVM account controlled by a Cadence resource. It serves as the bridge between Cadence and EVM:

- Created via a Cadence transaction
- Has an EVM address that can hold tokens and interact with EVM contracts
- Cadence code can call `coa.call()` to execute EVM transactions
- The COA's EVM address needs ERC-20 approval to pull payments

### Scheduling Fees

Scheduling a transaction requires an upfront FLOW fee based on priority:

| Priority | Multiplier | Use Case |
|----------|------------|----------|
| High (0) | 10x | Time-critical payments |
| Medium (1) | 5x | Standard recurring payments |
| Low (2) | 2x | Best-effort scheduling |

A partial refund (currently 50%) is available if the scheduled transaction is cancelled before execution.

## Flow Wallet Integration

The SDK uses [FCL (Flow Client Library)](https://github.com/onflow/fcl-js) for Flow wallet connections:

```typescript
import { FlowScheduler } from "@vera-pay/sdk";

const scheduler = new FlowScheduler({ /* ... */ });

// Opens wallet selection (Blocto, Lilico, etc.)
await scheduler.authenticate();

// Get the connected Flow address
const flowAddress = await scheduler.currentUser();
// e.g., "0x1234567890abcdef"

// Get the COA's EVM address
const evmAddress = await scheduler.getCoaEvmAddress();
// e.g., "0x000000000000000000000002c5ea5e29d44742fa"
```

## Getting Testnet Tokens

1. **FLOW tokens**: [faucet.flow.com](https://faucet.flow.com)
2. **Test USDC**: Use the demo's "Mint Test USDC" feature, or call the MockERC20 contract directly

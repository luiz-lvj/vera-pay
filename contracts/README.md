# VeraPay Smart Contracts

Solidity smart contracts for on-chain subscription payments, deployed on [Flow EVM](https://developers.flow.com/evm/networks).

Built with [Foundry](https://getfoundry.sh) and [OpenZeppelin](https://openzeppelin.com).

## Contracts

### `VeraPay.sol`

The core subscription engine. Manages plans, subscriptions, and payment processing.

| Function | Description |
|----------|-------------|
| `createPlan(token, amount, interval, name, metadataURI)` | Merchant creates a subscription plan |
| `togglePlan(planId)` | Enable/disable a plan |
| `subscribe(planId)` | Subscribe and pay the first installment |
| `processPayment(subId)` | Pull a due payment (callable by anyone) |
| `batchProcessPayments(subIds)` | Process multiple due payments in one tx |
| `cancelSubscription(subId)` | Cancel (subscriber or merchant) |
| `isPaymentDue(subId)` | Check if a payment is due |
| `getDuePayments(subIds)` | Batch check which subscriptions are due |

**Key design decisions:**
- Plan IDs start at 0, subscription IDs start at 1 (0 means "none")
- First payment is pulled immediately on `subscribe()`
- Anyone can call `processPayment()` — permissionless keeper design
- Protocol fee: configurable 0-10%, split from each payment

### `MockERC20.sol`

A minimal ERC-20 for testing. Anyone can mint. Deployed on testnet as test USDC.

## Deployed Addresses (Flow EVM Testnet)

| Contract | Address |
|----------|---------|
| VeraPay | `0x24730C8387C11e6031f692Bf0B14000D93271766` |
| Mock USDC | `0x9C080703256BDF9Ea1b485aE72f13E31f74C558b` |

## Development

### Prerequisites

- [Foundry](https://getfoundry.sh): `curl -L https://foundry.paradigm.xyz | bash && foundryup`

### Build

```bash
forge build
```

### Test

```bash
forge test -vvv
```

### Deploy to Flow EVM Testnet

```bash
cp .env.example .env
# Edit .env: PRIVATE_KEY, PROTOCOL_FEE_RECIPIENT, PROTOCOL_FEE_BPS

source .env
forge script script/Deploy.s.sol \
  --broadcast \
  --rpc-url https://testnet.evm.nodes.onflow.org \
  --private-key $PRIVATE_KEY \
  --legacy
```

### Deploy Mock USDC

```bash
forge create src/mocks/MockERC20.sol:MockERC20 \
  --rpc-url https://testnet.evm.nodes.onflow.org \
  --private-key $PRIVATE_KEY \
  --constructor-args "Test USDC" "USDC" 18 \
  --legacy
```

## Flow EVM

| Network | Chain ID | RPC | Explorer |
|---------|----------|-----|----------|
| Testnet | 545 | `https://testnet.evm.nodes.onflow.org` | [testnet.evm.flow.com](https://testnet.evm.flow.com) |
| Mainnet | 747 | `https://mainnet.evm.nodes.onflow.org` | [evm.flow.com](https://evm.flow.com) |

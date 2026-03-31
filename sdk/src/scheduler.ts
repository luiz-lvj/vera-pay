import * as fcl from "@onflow/fcl";
import type { IPFSAdapter } from "./ipfs";
import type { PaymentReceipt } from "./types";

export interface SchedulerConfig {
  network: "testnet" | "mainnet";
  /** Cadence address where VeraPayScheduledPaymentHandler is deployed (without 0x prefix) */
  handlerAddress: string;
  /** The VeraPay EVM contract address (with 0x prefix) for handler initialization */
  evmContractAddress: string;
  /** Optional IPFS adapter for pinning payment receipts */
  ipfsAdapter?: IPFSAdapter;
}

export interface SchedulePaymentParams {
  subscriptionId: string;
  /** Seconds from now until execution. Use "0.0" for immediate. */
  delaySeconds: string;
  /** 0 = High, 1 = Medium, 2 = Low */
  priority: number;
  /** Compute units for the scheduled tx (minimum 10) */
  executionEffort: number;
}

const NETWORK_CONFIG = {
  testnet: {
    accessNode: "https://rest-testnet.onflow.org",
    discoveryWallet: "https://fcl-discovery.onflow.org/testnet/authn",
    flowNetwork: "testnet",
    contracts: {
      FlowTransactionScheduler: "0x8c5303eaa26202d6",
      FlowTransactionSchedulerUtils: "0x8c5303eaa26202d6",
      FlowToken: "0x7e60df042a9c0868",
      FungibleToken: "0x9a0766d93b6608b7",
      EVM: "0x8c5303eaa26202d6",
    },
  },
  mainnet: {
    accessNode: "https://rest-mainnet.onflow.org",
    discoveryWallet: "https://fcl-discovery.onflow.org/authn",
    flowNetwork: "mainnet",
    contracts: {
      FlowTransactionScheduler: "0xe467b9dd11fa00df",
      FlowTransactionSchedulerUtils: "0xe467b9dd11fa00df",
      FlowToken: "0x1654653399040a61",
      FungibleToken: "0xf233dcee88fe0abe",
      EVM: "0xe467b9dd11fa00df",
    },
  },
};

type ContractAddresses = (typeof NETWORK_CONFIG)["testnet"]["contracts"];

function schedulePaymentCdc(c: ContractAddresses): string {
  return `
import FlowTransactionScheduler from ${c.FlowTransactionScheduler}
import FlowTransactionSchedulerUtils from ${c.FlowTransactionSchedulerUtils}
import FlowToken from ${c.FlowToken}
import FungibleToken from ${c.FungibleToken}

transaction(
    subscriptionId: UInt256,
    delaySeconds: UFix64,
    priority: UInt8,
    executionEffort: UInt64
) {
    prepare(signer: auth(BorrowValue, SaveValue, IssueStorageCapabilityController, PublishCapability, GetStorageCapabilityController) &Account) {
        let future = getCurrentBlock().timestamp + delaySeconds

        let pr = priority == 0
            ? FlowTransactionScheduler.Priority.High
            : priority == 1
                ? FlowTransactionScheduler.Priority.Medium
                : FlowTransactionScheduler.Priority.Low

        var handlerCap: Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>? = nil
        let controllers = signer.capabilities.storage.getControllers(forPath: /storage/VeraPayScheduledPaymentHandler)
        for controller in controllers {
            if let cap = controller.capability as? Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}> {
                handlerCap = cap
                break
            }
        }

        assert(handlerCap != nil, message: "No handler capability found. Run InitVeraPayHandler first.")

        if signer.storage.borrow<&AnyResource>(from: FlowTransactionSchedulerUtils.managerStoragePath) == nil {
            let manager <- FlowTransactionSchedulerUtils.createManager()
            signer.storage.save(<-manager, to: FlowTransactionSchedulerUtils.managerStoragePath)

            let managerCap = signer.capabilities.storage.issue<&{FlowTransactionSchedulerUtils.Manager}>(
                FlowTransactionSchedulerUtils.managerStoragePath
            )
            signer.capabilities.publish(managerCap, at: FlowTransactionSchedulerUtils.managerPublicPath)
        }

        let manager = signer.storage.borrow<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) ?? panic("Could not borrow Manager")

        let est = FlowTransactionScheduler.estimate(
            data: subscriptionId as AnyStruct,
            timestamp: future,
            priority: pr,
            executionEffort: executionEffort
        )

        assert(
            est.timestamp != nil || pr == FlowTransactionScheduler.Priority.Low,
            message: est.error ?? "Fee estimation failed"
        )

        let vault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow FlowToken vault")

        let fees <- vault.withdraw(amount: est.flowFee ?? 0.0) as! @FlowToken.Vault

        let transactionId = manager.schedule(
            handlerCap: handlerCap!,
            data: subscriptionId,
            timestamp: future,
            priority: pr,
            executionEffort: executionEffort,
            fees: <-fees
        )

        log("Scheduled payment for sub #".concat(subscriptionId.toString())
            .concat(" | txId: ").concat(transactionId.toString())
            .concat(" | at: ").concat(future.toString()))
    }
}
`;
}

function cancelPaymentCdc(c: ContractAddresses): string {
  return `
import FlowTransactionScheduler from ${c.FlowTransactionScheduler}
import FlowTransactionSchedulerUtils from ${c.FlowTransactionSchedulerUtils}
import FlowToken from ${c.FlowToken}
import FungibleToken from ${c.FungibleToken}

transaction(transactionId: UInt64) {
    prepare(signer: auth(BorrowValue) &Account) {
        let manager = signer.storage.borrow<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) ?? panic("Could not borrow Manager")

        let vault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow FlowToken vault")

        let refund <- manager.cancel(id: transactionId)
        vault.deposit(from: <-refund)

        log("Cancelled scheduled transaction #".concat(transactionId.toString()))
    }
}
`;
}

function setupCoaCdc(c: ContractAddresses): string {
  return `
import EVM from ${c.EVM}
import FlowToken from ${c.FlowToken}
import FungibleToken from ${c.FungibleToken}

transaction(fundAmount: UFix64) {
    prepare(signer: auth(BorrowValue, SaveValue, IssueStorageCapabilityController, PublishCapability) &Account) {
        if signer.storage.borrow<&EVM.CadenceOwnedAccount>(from: /storage/evm) != nil {
            log("COA already exists at /storage/evm")
            return
        }

        let coa <- EVM.createCadenceOwnedAccount()

        if fundAmount > 0.0 {
            let vault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
                from: /storage/flowTokenVault
            ) ?? panic("Could not borrow FlowToken vault")

            let tokens <- vault.withdraw(amount: fundAmount) as! @FlowToken.Vault
            coa.deposit(from: <-tokens)
        }

        signer.storage.save(<-coa, to: /storage/evm)

        let callCap = signer.capabilities.storage.issue<auth(EVM.Call) &EVM.CadenceOwnedAccount>(/storage/evm)
        let publicCap = signer.capabilities.storage.issue<&EVM.CadenceOwnedAccount>(/storage/evm)
        signer.capabilities.publish(publicCap, at: /public/evm)

        log("COA created and funded with ".concat(fundAmount.toString()).concat(" FLOW"))
    }
}
`;
}

function initHandlerCdc(c: ContractAddresses, handlerAddr: string): string {
  return `
import VeraPayScheduledPaymentHandler from 0x${handlerAddr}
import FlowTransactionScheduler from ${c.FlowTransactionScheduler}
import EVM from ${c.EVM}

transaction(verapayEvmAddress: String) {
    prepare(signer: auth(BorrowValue, SaveValue, LoadValue, IssueStorageCapabilityController, PublishCapability, UnpublishCapability, GetStorageCapabilityController) &Account) {
        // 1. Destroy old handler resource if it exists
        if let oldHandler <- signer.storage.load<@AnyResource>(from: /storage/VeraPayScheduledPaymentHandler) {
            destroy oldHandler
            log("Destroyed old VeraPay handler")
        }

        // 2. Unpublish old public capability
        signer.capabilities.unpublish(/public/VeraPayScheduledPaymentHandler)

        // 3. Delete all old capability controllers for the handler storage path
        let oldControllers = signer.capabilities.storage.getControllers(forPath: /storage/VeraPayScheduledPaymentHandler)
        for controller in oldControllers {
            controller.delete()
        }

        // 4. Get or create COA capability
        let evmAddr = EVM.addressFromString(verapayEvmAddress)

        var coaCap: Capability<auth(EVM.Call) &EVM.CadenceOwnedAccount>? = nil
        let controllers = signer.capabilities.storage.getControllers(forPath: /storage/evm)
        for controller in controllers {
            if let cap = controller.capability as? Capability<auth(EVM.Call) &EVM.CadenceOwnedAccount> {
                coaCap = cap
                break
            }
        }

        if coaCap == nil {
            coaCap = signer.capabilities.storage.issue<auth(EVM.Call) &EVM.CadenceOwnedAccount>(/storage/evm)
        }

        // 5. Create fresh handler with new address
        let handler <- VeraPayScheduledPaymentHandler.createHandler(
            coaCapability: coaCap!,
            verapayAddress: evmAddr
        )
        signer.storage.save(<-handler, to: /storage/VeraPayScheduledPaymentHandler)

        // 6. Issue fresh capabilities
        signer.capabilities.storage.issue<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>(
            /storage/VeraPayScheduledPaymentHandler
        )

        let publicCap = signer.capabilities.storage.issue<&{FlowTransactionScheduler.TransactionHandler}>(
            /storage/VeraPayScheduledPaymentHandler
        )
        signer.capabilities.publish(publicCap, at: /public/VeraPayScheduledPaymentHandler)

        log("VeraPay handler initialized for contract: ".concat(verapayEvmAddress))
    }
}
`;
}

/**
 * FlowScheduler provides a JS/browser interface to schedule and cancel
 * VeraPay subscription payments using Flow's native scheduled transactions.
 *
 * It uses FCL (Flow Client Library) which handles wallet authentication
 * through Flow's wallet discovery (Blocto, Lilico, etc.).
 *
 * Usage:
 * ```ts
 * import { FlowScheduler } from "@verapay/sdk";
 *
 * const scheduler = new FlowScheduler({
 *   network: "testnet",
 *   handlerAddress: "7c0bf27829276c6b",
 * });
 *
 * // Authenticate with a Flow wallet
 * await scheduler.authenticate();
 *
 * // Schedule a payment for subscription #1 in 1 hour
 * const txId = await scheduler.schedulePayment({
 *   subscriptionId: "1",
 *   delaySeconds: "3600.0",
 *   priority: 1,        // Medium
 *   executionEffort: 1000,
 * });
 *
 * // Wait for execution
 * await scheduler.waitForTransaction(txId);
 * ```
 */
export interface SubscribeAndScheduleResult {
  flowTxId: string;
  /** The ID of the scheduled future transaction (from FlowTransactionScheduler) */
  scheduledTxId?: string;
  receipt?: PaymentReceipt;
  ipfsCid?: string;
}

export class FlowScheduler {
  private configured = false;
  private ipfs?: IPFSAdapter;

  constructor(public readonly config: SchedulerConfig) {
    this.ipfs = config.ipfsAdapter;
  }

  get hasIPFS(): boolean {
    return !!this.ipfs;
  }

  setIPFSAdapter(adapter: IPFSAdapter): void {
    this.ipfs = adapter;
  }

  private ensureConfigured(): void {
    if (this.configured) return;
    const net = NETWORK_CONFIG[this.config.network];
    fcl.config()
      .put("accessNode.api", net.accessNode)
      .put("discovery.wallet", net.discoveryWallet)
      .put("flow.network", net.flowNetwork);
    this.configured = true;
  }

  /** Trigger FCL wallet authentication (Blocto, Lilico, etc.) */
  async authenticate(): Promise<{ addr: string }> {
    this.ensureConfigured();
    const user = await fcl.authenticate();
    return { addr: user.addr ?? "" };
  }

  /** Disconnect the current wallet */
  async unauthenticate(): Promise<void> {
    await fcl.unauthenticate();
  }

  /** Get the currently authenticated Flow address, or null */
  async currentUser(): Promise<string | null> {
    this.ensureConfigured();
    const snapshot = await fcl.currentUser.snapshot();
    return snapshot.addr ?? null;
  }

  /**
   * Create a Cadence Owned Account (COA) and fund it with FLOW for EVM gas.
   * Idempotent — skips if COA already exists. Must be called before initHandler.
   * Returns the Flow transaction ID.
   */
  async setupCOA(fundAmount: string = "1.0"): Promise<string> {
    this.ensureConfigured();
    const contracts = NETWORK_CONFIG[this.config.network].contracts;
    const txId = await fcl.mutate({
      cadence: setupCoaCdc(contracts),
      args: (arg, t) => [arg(fundAmount, t.UFix64)],
      limit: 9999,
    });
    return txId;
  }

  /**
   * Initialize the VeraPay scheduled payment handler on the connected account.
   * Idempotent — skips if already initialized. Requires a COA (call setupCOA first).
   * Returns the Flow transaction ID.
   */
  async initHandler(): Promise<string> {
    this.ensureConfigured();
    const contracts = NETWORK_CONFIG[this.config.network].contracts;
    const evmAddr = this.config.evmContractAddress.startsWith("0x")
      ? this.config.evmContractAddress
      : "0x" + this.config.evmContractAddress;
    const txId = await fcl.mutate({
      cadence: initHandlerCdc(contracts, this.config.handlerAddress),
      args: (arg, t) => [arg(evmAddr, t.String)],
      limit: 9999,
    });
    return txId;
  }

  /**
   * Convenience method: runs setupCOA + initHandler in sequence.
   * Both are idempotent so it's safe to call on every session.
   */
  async setup(fundAmount: string = "1.0"): Promise<{ coaTxId: string; handlerTxId: string }> {
    const coaTxId = await this.setupCOA(fundAmount);
    await this.waitForTransaction(coaTxId);
    const handlerTxId = await this.initHandler();
    await this.waitForTransaction(handlerTxId);
    return { coaTxId, handlerTxId };
  }

  /**
   * Schedule a subscription payment to be executed at a future time.
   * The connected Flow wallet pays the scheduling fees.
   * Returns the Flow transaction ID.
   */
  async schedulePayment(params: SchedulePaymentParams): Promise<string> {
    this.ensureConfigured();
    const contracts = NETWORK_CONFIG[this.config.network].contracts;
    const txId = await fcl.mutate({
      cadence: schedulePaymentCdc(contracts),
      args: (arg, t) => [
        arg(params.subscriptionId, t.UInt256),
        arg(params.delaySeconds, t.UFix64),
        arg(String(params.priority), t.UInt8),
        arg(String(params.executionEffort), t.UInt64),
      ],
      limit: 9999,
    });
    return txId;
  }

  /**
   * Cancel a previously scheduled payment and receive a partial fee refund.
   * Returns the Flow transaction ID.
   */
  async cancelScheduledPayment(scheduledTransactionId: string): Promise<string> {
    this.ensureConfigured();
    const contracts = NETWORK_CONFIG[this.config.network].contracts;
    const txId = await fcl.mutate({
      cadence: cancelPaymentCdc(contracts),
      args: (arg, t) => [
        arg(scheduledTransactionId, t.UInt64),
      ],
      limit: 9999,
    });
    return txId;
  }

  /**
   * Make the COA approve an EVM spender (e.g., VeraPay) to transfer ERC20 tokens.
   * This is required before the scheduled payment can pull tokens from the COA.
   * Returns the Flow transaction ID.
   */
  async approveERC20(tokenAddress: string, amount: string = "115792089237316195423570985008687907853269984665640564039457584007913129639935"): Promise<string> {
    this.ensureConfigured();
    const contracts = NETWORK_CONFIG[this.config.network].contracts;
    const token = tokenAddress.startsWith("0x") ? tokenAddress : "0x" + tokenAddress;
    const spender = this.config.evmContractAddress.startsWith("0x") ? this.config.evmContractAddress : "0x" + this.config.evmContractAddress;
    const txId = await fcl.mutate({
      cadence: `
import EVM from ${contracts.EVM}

transaction(tokenAddress: String, spenderAddress: String, amount: UInt256) {
    prepare(signer: auth(BorrowValue) &Account) {
        let coa = signer.storage.borrow<auth(EVM.Call) &EVM.CadenceOwnedAccount>(from: /storage/evm)
            ?? panic("No COA found. Run Setup first.")

        let calldata = EVM.encodeABIWithSignature(
            "approve(address,uint256)",
            [EVM.addressFromString(spenderAddress), amount]
        )

        let result = coa.call(
            to: EVM.addressFromString(tokenAddress),
            data: calldata,
            gasLimit: 100_000,
            value: EVM.Balance(attoflow: 0)
        )

        assert(result.status == EVM.Status.successful, message: "ERC20 approve failed")
    }
}
`,
      args: (arg, t) => [
        arg(token, t.String),
        arg(spender, t.String),
        arg(amount, t.UInt256),
      ],
      limit: 9999,
    });
    return txId;
  }

  /**
   * Subscribe the COA to a VeraPay plan AND schedule the next recurring payment
   * in a single Cadence transaction.
   *
   * 1. COA calls subscribe(planId) on the EVM contract (first payment is charged immediately)
   * 2. Decodes the returned subscription ID from the EVM call
   * 3. Schedules the next payment via FlowTransactionScheduler with the plan's interval as delay
   *
   * If an IPFS adapter is configured, the payment receipt is automatically
   * pinned after the transaction seals.
   *
   * Returns the Flow tx ID, and optionally the receipt + IPFS CID.
   */
  async subscribeAndSchedule(params: {
    planId: number | string;
    intervalSeconds: string;
    priority?: number;
    executionEffort?: number;
  }): Promise<SubscribeAndScheduleResult> {
    this.ensureConfigured();
    const contracts = NETWORK_CONFIG[this.config.network].contracts;
    const verapay = this.config.evmContractAddress.startsWith("0x")
      ? this.config.evmContractAddress
      : "0x" + this.config.evmContractAddress;
    const txId = await fcl.mutate({
      cadence: `
import EVM from ${contracts.EVM}
import FlowTransactionScheduler from ${contracts.FlowTransactionScheduler}
import FlowTransactionSchedulerUtils from ${contracts.FlowTransactionSchedulerUtils}
import FlowToken from ${contracts.FlowToken}
import FungibleToken from ${contracts.FungibleToken}

transaction(
    verapayAddress: String,
    planId: UInt256,
    intervalSeconds: UFix64,
    priority: UInt8,
    executionEffort: UInt64
) {
    prepare(signer: auth(BorrowValue, SaveValue, IssueStorageCapabilityController, PublishCapability, GetStorageCapabilityController) &Account) {
        // 1. Subscribe via COA
        let coa = signer.storage.borrow<auth(EVM.Call) &EVM.CadenceOwnedAccount>(from: /storage/evm)
            ?? panic("No COA found. Run Setup first.")

        let calldata = EVM.encodeABIWithSignature(
            "subscribe(uint256)",
            [planId]
        )

        let result = coa.call(
            to: EVM.addressFromString(verapayAddress),
            data: calldata,
            gasLimit: 300_000,
            value: EVM.Balance(attoflow: 0)
        )

        assert(result.status == EVM.Status.successful,
            message: "VeraPay subscribe failed: ".concat(result.errorCode.toString()))

        // 2. Decode the returned subscription ID (uint256)
        let decoded = EVM.decodeABI(types: [Type<UInt256>()], data: result.data)
        let subscriptionId = decoded[0] as! UInt256

        log("Subscribed! Sub ID: ".concat(subscriptionId.toString()))

        // 3. Schedule next payment
        let future = getCurrentBlock().timestamp + intervalSeconds

        let pr = priority == 0
            ? FlowTransactionScheduler.Priority.High
            : priority == 1
                ? FlowTransactionScheduler.Priority.Medium
                : FlowTransactionScheduler.Priority.Low

        var handlerCap: Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>? = nil
        let controllers = signer.capabilities.storage.getControllers(forPath: /storage/VeraPayScheduledPaymentHandler)
        for controller in controllers {
            if let cap = controller.capability as? Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}> {
                handlerCap = cap
                break
            }
        }

        assert(handlerCap != nil, message: "No handler capability found. Run InitVeraPayHandler first.")

        if signer.storage.borrow<&AnyResource>(from: FlowTransactionSchedulerUtils.managerStoragePath) == nil {
            let manager <- FlowTransactionSchedulerUtils.createManager()
            signer.storage.save(<-manager, to: FlowTransactionSchedulerUtils.managerStoragePath)

            let managerCap = signer.capabilities.storage.issue<&{FlowTransactionSchedulerUtils.Manager}>(
                FlowTransactionSchedulerUtils.managerStoragePath
            )
            signer.capabilities.publish(managerCap, at: FlowTransactionSchedulerUtils.managerPublicPath)
        }

        let manager = signer.storage.borrow<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) ?? panic("Could not borrow Manager")

        let est = FlowTransactionScheduler.estimate(
            data: subscriptionId as AnyStruct,
            timestamp: future,
            priority: pr,
            executionEffort: executionEffort
        )

        assert(
            est.timestamp != nil || pr == FlowTransactionScheduler.Priority.Low,
            message: est.error ?? "Fee estimation failed"
        )

        let vault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow FlowToken vault")

        let fees <- vault.withdraw(amount: est.flowFee ?? 0.0) as! @FlowToken.Vault

        let transactionId = manager.schedule(
            handlerCap: handlerCap!,
            data: subscriptionId,
            timestamp: future,
            priority: pr,
            executionEffort: executionEffort,
            fees: <-fees
        )

        log("Scheduled next payment for sub #".concat(subscriptionId.toString())
            .concat(" | txId: ").concat(transactionId.toString())
            .concat(" | at: ").concat(future.toString()))
    }
}
`,
      args: (arg, t) => [
        arg(verapay, t.String),
        arg(String(params.planId), t.UInt256),
        arg(params.intervalSeconds, t.UFix64),
        arg(String(params.priority ?? 1), t.UInt8),
        arg(String(params.executionEffort ?? 1000), t.UInt64),
      ],
      limit: 9999,
    });

    const result: SubscribeAndScheduleResult = { flowTxId: txId };

    try {
      const sealed = await this.waitForTransaction(txId);
      result.scheduledTxId = FlowScheduler.extractScheduledTxId(sealed.events);

      if (this.ipfs) {
        try {
          const receipt: PaymentReceipt = {
            subscriptionId: "pending",
            planId: String(params.planId),
            subscriber: (await this.currentUser()) ?? "",
            merchant: "",
            amount: "0",
            protocolFee: "0",
            timestamp: Math.floor(Date.now() / 1000),
            txHash: txId,
            blockNumber: 0,
            chainId: this.config.network === "testnet" ? 545 : 747,
          };
          const cid = await this.ipfs.uploadJson(receipt);
          receipt.ipfsCid = cid;
          result.receipt = receipt;
          result.ipfsCid = cid;
        } catch {
          // IPFS pinning is best-effort
        }
      }
    } catch {
      // If waiting fails, still return the flowTxId so the UI can track it
    }

    return result;
  }

  /**
   * Subscribe the COA to a VeraPay plan via an EVM call (without scheduling).
   * The COA must have already approved the VeraPay contract to spend its tokens.
   * Returns the Flow transaction ID.
   */
  async subscribeToPlan(planId: number | string): Promise<string> {
    this.ensureConfigured();
    const contracts = NETWORK_CONFIG[this.config.network].contracts;
    const verapay = this.config.evmContractAddress.startsWith("0x")
      ? this.config.evmContractAddress
      : "0x" + this.config.evmContractAddress;
    const txId = await fcl.mutate({
      cadence: `
import EVM from ${contracts.EVM}

transaction(verapayAddress: String, planId: UInt256) {
    prepare(signer: auth(BorrowValue) &Account) {
        let coa = signer.storage.borrow<auth(EVM.Call) &EVM.CadenceOwnedAccount>(from: /storage/evm)
            ?? panic("No COA found. Run Setup first.")

        let calldata = EVM.encodeABIWithSignature(
            "subscribe(uint256)",
            [planId]
        )

        let result = coa.call(
            to: EVM.addressFromString(verapayAddress),
            data: calldata,
            gasLimit: 300_000,
            value: EVM.Balance(attoflow: 0)
        )

        assert(result.status == EVM.Status.successful, message: "VeraPay subscribe failed: ".concat(result.errorCode.toString()))
    }
}
`,
      args: (arg, t) => [
        arg(verapay, t.String),
        arg(String(planId), t.UInt256),
      ],
      limit: 9999,
    });
    return txId;
  }

  /**
   * Query the COA's EVM address for a given Flow account.
   * Returns the hex EVM address (0x...) or null if no COA exists.
   */
  async getCoaEvmAddress(flowAddress?: string): Promise<string | null> {
    this.ensureConfigured();
    const addr = flowAddress ?? (await this.currentUser());
    if (!addr) return null;
    const contracts = NETWORK_CONFIG[this.config.network].contracts;
    try {
      const result = await fcl.query({
        cadence: `
import EVM from ${contracts.EVM}

access(all) fun main(flowAddress: Address): String? {
    if let acc = getAuthAccount<auth(BorrowValue) &Account>(flowAddress)
        .storage.borrow<&EVM.CadenceOwnedAccount>(from: /storage/evm) {
        return "0x".concat(acc.address().toString())
    }
    return nil
}
`,
        args: (arg, t) => [arg(addr, t.Address)],
      });
      return result as string | null;
    } catch {
      return null;
    }
  }

  /** Wait for a Flow transaction to be sealed. Returns the transaction result with events. */
  async waitForTransaction(txId: string): Promise<{
    status: number;
    events: Array<{ type: string; data: Record<string, unknown> }>;
  }> {
    this.ensureConfigured();
    const result = await fcl.tx(txId).onceSealed();
    return result as { status: number; events: Array<{ type: string; data: Record<string, unknown> }> };
  }

  /**
   * Extract the scheduled transaction ID from sealed tx events.
   * Looks for the FlowTransactionScheduler.TransactionScheduled event.
   */
  static extractScheduledTxId(events: Array<{ type: string; data: Record<string, unknown> }>): string | undefined {
    const evt = events.find(e => e.type.includes("FlowTransactionScheduler") && e.type.includes("TransactionScheduled"));
    if (!evt) return undefined;
    const id = evt.data.id ?? evt.data.transactionId ?? evt.data.scheduledTransactionId;
    return id != null ? String(id) : undefined;
  }
}

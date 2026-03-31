import { ethers } from "ethers";
import { VERA_PAY_ABI, ERC20_ABI } from "./abi";
import { NETWORKS } from "./constants";
import { buildPaymentReceipt, type IPFSAdapter } from "./ipfs";
import type {
  Plan,
  Subscription,
  PaymentReceipt,
  CreatePlanParams,
  VeraPayConfig,
  NetworkName,
} from "./types";

export class VeraPayClient {
  public readonly contract: ethers.Contract;
  public readonly provider: ethers.Provider;
  public readonly config: VeraPayConfig;
  private signer?: ethers.Signer;
  private ipfs?: IPFSAdapter;

  constructor(
    config: VeraPayConfig,
    signerOrProvider: ethers.Signer | ethers.Provider,
    ipfsAdapter?: IPFSAdapter,
  ) {
    this.config = config;
    this.ipfs = ipfsAdapter;

    if ("getAddress" in signerOrProvider) {
      this.signer = signerOrProvider as ethers.Signer;
      this.provider = (signerOrProvider as ethers.Signer).provider!;
    } else {
      this.provider = signerOrProvider as ethers.Provider;
    }

    this.contract = new ethers.Contract(
      config.contractAddress,
      VERA_PAY_ABI,
      this.signer ?? this.provider,
    );
  }

  /**
   * Convenience factory that auto-configures for a known Flow network.
   */
  static fromNetwork(
    network: NetworkName,
    contractAddress: string,
    signerOrProvider: ethers.Signer | ethers.Provider,
    ipfsAdapter?: IPFSAdapter,
  ): VeraPayClient {
    const net = NETWORKS[network];
    return new VeraPayClient(
      { contractAddress, rpcUrl: net.rpcUrl, chainId: net.chainId },
      signerOrProvider,
      ipfsAdapter,
    );
  }

  // ── Merchant API ─────────────────────────────────────────────────────

  async createPlan(params: CreatePlanParams): Promise<{
    planId: bigint;
    tx: ethers.TransactionResponse;
  }> {
    this.requireSigner();
    const tx = await this.contract.createPlan(
      params.paymentToken,
      params.amount,
      params.interval,
      params.name,
      params.metadataURI ?? "",
    );
    const receipt = await tx.wait();
    const log = receipt.logs.find(
      (l: ethers.Log) =>
        l.topics[0] === ethers.id(
          "PlanCreated(uint256,address,address,uint256,uint256,string,string)",
        ),
    );
    const planId = log ? BigInt(log.topics[1]) : 0n;
    return { planId, tx };
  }

  async togglePlan(planId: bigint): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.contract.togglePlan(planId);
  }

  async getMerchantPlans(merchant: string): Promise<bigint[]> {
    return this.contract.getMerchantPlans(merchant);
  }

  // ── Subscriber API ───────────────────────────────────────────────────

  /**
   * Approve the VeraPay contract to pull `amount` of the given ERC-20 token,
   * then subscribe to the plan. Returns subscription ID and the payment receipt
   * (optionally pinned to IPFS).
   */
  async subscribeWithApproval(
    planId: bigint,
    options?: { approveMax?: boolean },
  ): Promise<{
    subscriptionId: bigint;
    receipt: PaymentReceipt;
    tx: ethers.TransactionResponse;
  }> {
    this.requireSigner();
    const plan = await this.getPlan(planId);

    const token = new ethers.Contract(
      plan.paymentToken,
      ERC20_ABI,
      this.signer,
    );

    const approveAmount = options?.approveMax
      ? ethers.MaxUint256
      : plan.amount * 12n; // approve for ~12 billing cycles
    const approveTx = await token.approve(
      this.config.contractAddress,
      approveAmount,
    );
    await approveTx.wait();

    return this.subscribe(planId);
  }

  async subscribe(planId: bigint): Promise<{
    subscriptionId: bigint;
    receipt: PaymentReceipt;
    tx: ethers.TransactionResponse;
  }> {
    this.requireSigner();
    const tx = await this.contract.subscribe(planId);
    const txReceipt = await tx.wait();

    const paymentReceipt = await this.extractPaymentReceipt(txReceipt);
    const subLog = txReceipt.logs.find(
      (l: ethers.Log) =>
        l.topics[0] === ethers.id("Subscribed(uint256,uint256,address)"),
    );
    const subscriptionId = subLog ? BigInt(subLog.topics[1]) : 0n;

    return { subscriptionId, receipt: paymentReceipt, tx };
  }

  async cancelSubscription(
    subscriptionId: bigint,
  ): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.contract.cancelSubscription(subscriptionId);
  }

  async getSubscriberSubscriptions(subscriber: string): Promise<bigint[]> {
    return this.contract.getSubscriberSubscriptions(subscriber);
  }

  // ── Keeper / Relayer API ─────────────────────────────────────────────

  async processPayment(subscriptionId: bigint): Promise<{
    receipt: PaymentReceipt;
    tx: ethers.TransactionResponse;
  }> {
    this.requireSigner();
    const tx = await this.contract.processPayment(subscriptionId);
    const txReceipt = await tx.wait();
    const receipt = await this.extractPaymentReceipt(txReceipt);
    return { receipt, tx };
  }

  async batchProcessPayments(
    subscriptionIds: bigint[],
  ): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.contract.batchProcessPayments(subscriptionIds);
  }

  async isPaymentDue(subscriptionId: bigint): Promise<boolean> {
    return this.contract.isPaymentDue(subscriptionId);
  }

  async getDuePayments(subscriptionIds: bigint[]): Promise<bigint[]> {
    return this.contract.getDuePayments(subscriptionIds);
  }

  /**
   * Start a polling loop that checks for due payments and processes them.
   * Returns a cleanup function to stop the loop.
   */
  startKeeper(
    subscriptionIds: bigint[],
    intervalMs = 60_000,
    onPayment?: (receipt: PaymentReceipt) => void,
    onError?: (err: unknown) => void,
  ): () => void {
    let running = true;

    const tick = async () => {
      if (!running) return;
      try {
        const due = await this.getDuePayments(subscriptionIds);
        for (const subId of due) {
          const { receipt } = await this.processPayment(subId);
          onPayment?.(receipt);
        }
      } catch (err) {
        onError?.(err);
      }
      if (running) setTimeout(tick, intervalMs);
    };

    tick();
    return () => {
      running = false;
    };
  }

  // ── Read helpers ─────────────────────────────────────────────────────

  async getPlan(planId: bigint): Promise<Plan> {
    const raw = await this.contract.getPlan(planId);
    return {
      planId,
      merchant: raw.merchant,
      paymentToken: raw.paymentToken,
      amount: raw.amount,
      interval: raw.interval,
      name: raw.name,
      metadataURI: raw.metadataURI,
      active: raw.active,
    };
  }

  async getSubscription(subscriptionId: bigint): Promise<Subscription> {
    const raw = await this.contract.getSubscription(subscriptionId);
    return {
      subscriptionId,
      planId: raw.planId,
      subscriber: raw.subscriber,
      startTime: raw.startTime,
      lastPaymentTime: raw.lastPaymentTime,
      paymentsCount: raw.paymentsCount,
      active: raw.active,
    };
  }

  async getProtocolFeeBps(): Promise<bigint> {
    return this.contract.protocolFeeBps();
  }

  // ── IPFS ─────────────────────────────────────────────────────────────

  /**
   * Pin a payment receipt to IPFS and return the CID.
   */
  async pinReceipt(receipt: PaymentReceipt): Promise<string> {
    if (!this.ipfs) throw new Error("No IPFS adapter configured");
    const cid = await this.ipfs.uploadJson(receipt);
    receipt.ipfsCid = cid;
    return cid;
  }

  async fetchReceipt(cid: string): Promise<PaymentReceipt> {
    if (!this.ipfs) throw new Error("No IPFS adapter configured");
    return this.ipfs.fetchJson<PaymentReceipt>(cid);
  }

  setIPFSAdapter(adapter: IPFSAdapter): void {
    this.ipfs = adapter;
  }

  // ── Listeners ────────────────────────────────────────────────────────

  onPaymentProcessed(
    callback: (receipt: PaymentReceipt) => void,
    filter?: { subscriptionId?: bigint; planId?: bigint; subscriber?: string },
  ): ethers.Contract {
    const eventFilter = this.contract.filters.PaymentProcessed(
      filter?.subscriptionId ?? null,
      filter?.planId ?? null,
      filter?.subscriber ?? null,
    );

    this.contract.on(
      eventFilter,
      async (
        subscriptionId: bigint,
        planId: bigint,
        subscriber: string,
        merchant: string,
        amount: bigint,
        protocolFee: bigint,
        timestamp: bigint,
        event: ethers.EventLog,
      ) => {
        const receipt = buildPaymentReceipt(
          { subscriptionId, planId, subscriber, merchant, amount, protocolFee, timestamp },
          event.transactionHash,
          event.blockNumber,
          this.config.chainId ?? 0,
        );

        if (this.ipfs) {
          try {
            receipt.ipfsCid = await this.ipfs.uploadJson(receipt);
          } catch {
            // IPFS pinning is best-effort
          }
        }

        callback(receipt);
      },
    );

    return this.contract;
  }

  removeAllListeners(): void {
    this.contract.removeAllListeners();
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private requireSigner(): void {
    if (!this.signer) {
      throw new Error("A signer is required for write operations");
    }
  }

  private async extractPaymentReceipt(
    txReceipt: ethers.TransactionReceipt,
  ): Promise<PaymentReceipt> {
    const iface = new ethers.Interface(VERA_PAY_ABI);
    const paymentTopic = ethers.id(
      "PaymentProcessed(uint256,uint256,address,address,uint256,uint256,uint256)",
    );

    for (const log of txReceipt.logs) {
      if (log.topics[0] === paymentTopic) {
        const parsed = iface.parseLog({
          topics: [...log.topics],
          data: log.data,
        });
        if (!parsed) continue;

        const receipt = buildPaymentReceipt(
          {
            subscriptionId: BigInt(log.topics[1]),
            planId: BigInt(log.topics[2]),
            subscriber: ethers.getAddress("0x" + log.topics[3].slice(26)),
            merchant: parsed.args.merchant,
            amount: parsed.args.amount,
            protocolFee: parsed.args.protocolFee,
            timestamp: parsed.args.timestamp,
          },
          txReceipt.hash,
          txReceipt.blockNumber,
          this.config.chainId ?? 0,
        );

        if (this.ipfs) {
          try {
            receipt.ipfsCid = await this.ipfs.uploadJson(receipt);
          } catch {
            // best-effort
          }
        }

        return receipt;
      }
    }

    return {
      subscriptionId: "0",
      planId: "0",
      subscriber: "",
      merchant: "",
      amount: "0",
      protocolFee: "0",
      timestamp: 0,
      txHash: txReceipt.hash,
      blockNumber: txReceipt.blockNumber,
      chainId: this.config.chainId ?? 0,
    };
  }
}

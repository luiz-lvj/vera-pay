export interface Plan {
  planId: bigint;
  merchant: string;
  paymentToken: string;
  amount: bigint;
  interval: bigint;
  name: string;
  metadataURI: string;
  active: boolean;
}

export interface Subscription {
  subscriptionId: bigint;
  planId: bigint;
  subscriber: string;
  startTime: bigint;
  lastPaymentTime: bigint;
  paymentsCount: bigint;
  active: boolean;
}

export interface PaymentReceipt {
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

export interface CreatePlanParams {
  paymentToken: string;
  amount: bigint;
  interval: bigint;
  name: string;
  metadataURI?: string;
}

export interface VeraPayConfig {
  contractAddress: string;
  rpcUrl?: string;
  chainId?: number;
  ipfsGateway?: string;
}

export type NetworkName = "flow-testnet" | "flow-mainnet";

export interface NetworkConfig {
  chainId: number;
  rpcUrl: string;
  blockExplorer: string;
  name: string;
}

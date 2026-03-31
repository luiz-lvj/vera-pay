export interface OnChainPlan {
  planId: number;
  merchant: string;
  paymentToken: string;
  amount: bigint;
  interval: bigint;
  name: string;
  metadataURI: string;
  active: boolean;
}

export interface PlanDisplay {
  id: number;
  name: string;
  price: string;
  interval: string;
  features: string[];
  highlighted: boolean;
  onChain?: OnChainPlan;
}

export interface PaymentRecord {
  subscriptionId: string;
  planName: string;
  amount: string;
  txHash: string;
  timestamp: number;
  ipfsCid?: string;
  status: "success" | "pending" | "failed";
}

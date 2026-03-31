import type { Plan } from "@verapay/sdk";

export interface PlanDisplay {
  id: number;
  name: string;
  price: string;
  interval: string;
  features: string[];
  highlighted: boolean;
  onChain?: Plan;
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

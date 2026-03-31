import { useState, useEffect, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import { VeraPayClient, createStorachaAdapter, ERC20_ABI } from "@vera-pay/sdk";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { PricingCards } from "./components/PricingCards";
import { CheckoutModal } from "./components/CheckoutModal";
import { PaymentHistory } from "./components/PaymentHistory";
import { MerchantPanel } from "./components/MerchantPanel";
import { SchedulerPanel } from "./components/SchedulerPanel";
import { CodePreview } from "./components/CodePreview";
import { Footer } from "./components/Footer";
import { connectWallet, onAccountsChanged, onChainChanged } from "./lib/wallet";
import { VERA_PAY_ADDRESS, TEST_USDC_ADDRESS, FLOW_TESTNET } from "./lib/contracts";
import type { PlanDisplay, PaymentRecord } from "./lib/types";

function intervalToLabel(seconds: bigint): string {
  const s = Number(seconds);
  if (s >= 2592000) return "month";
  if (s >= 604800) return "week";
  if (s >= 86400) return "day";
  if (s >= 3600) return "hour";
  return `${s}s`;
}

function compactPrice(raw: string): string {
  if (!raw.includes(".")) return raw;
  const [int, dec] = raw.split(".");
  if (!dec || dec.length <= 6) return raw;
  const leadingZeros = dec.match(/^0*/)?.[0].length ?? 0;
  if (leadingZeros <= 3) return `${int}.${dec.slice(0, 6)}`;
  const significant = dec.slice(leadingZeros, leadingZeros + 2) || "0";
  return `${int}.${"0".repeat(Math.min(leadingZeros, 3))}…${significant}`;
}

function buildIpfsAdapter() {
  const key = import.meta.env.VITE_STORACHA_KEY;
  const proof = import.meta.env.VITE_STORACHA_PROOF;
  if (!key || !proof) return undefined;
  return createStorachaAdapter({ key, proof });
}

export default function App() {
  const [selectedPlan, setSelectedPlan] = useState<PlanDisplay | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [walletAddress, setWalletAddress] = useState("");
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [usdcBalance, setUsdcBalance] = useState("0");
  const [plans, setPlans] = useState<PlanDisplay[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  const walletConnected = !!walletAddress;

  const ipfsAdapter = useMemo(() => buildIpfsAdapter(), []);

  // Read-only client for fetching plans (no signer needed)
  const readClient = useMemo(
    () => {
      const provider = new ethers.JsonRpcProvider(FLOW_TESTNET.rpcUrl);
      return VeraPayClient.fromNetwork("flow-testnet", VERA_PAY_ADDRESS, provider, ipfsAdapter);
    },
    [ipfsAdapter],
  );

  // Write client — only available when wallet is connected
  const writeClient = useMemo(
    () => signer ? VeraPayClient.fromNetwork("flow-testnet", VERA_PAY_ADDRESS, signer, ipfsAdapter) : null,
    [signer, ipfsAdapter],
  );

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const activePlans = await readClient.listActivePlans();
      const loaded: PlanDisplay[] = activePlans.map((plan, idx) => {
        const rawPrice = ethers.formatUnits(plan.amount, 18);
        const price = compactPrice(rawPrice);
        return {
          id: Number(plan.planId),
          name: plan.name || `Plan #${plan.planId}`,
          price,
          interval: intervalToLabel(plan.interval),
          features: [
            `${price} USDC / ${intervalToLabel(plan.interval)}`,
            `Token: ${plan.paymentToken.slice(0, 6)}...${plan.paymentToken.slice(-4)}`,
            `Merchant: ${plan.merchant.slice(0, 6)}...${plan.merchant.slice(-4)}`,
          ],
          highlighted: idx === 0,
          onChain: plan,
        };
      });
      setPlans(loaded);
    } catch (err) {
      console.error("Failed to load plans:", err);
    } finally {
      setLoadingPlans(false);
    }
  }, [readClient]);

  const loadBalance = useCallback(async (addr: string) => {
    try {
      const provider = new ethers.JsonRpcProvider(FLOW_TESTNET.rpcUrl);
      const token = new ethers.Contract(TEST_USDC_ADDRESS, ERC20_ABI, provider);
      const bal: bigint = await token.balanceOf(addr);
      setUsdcBalance(compactPrice(ethers.formatUnits(bal, 18)));
    } catch {
      setUsdcBalance("0");
    }
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);
  useEffect(() => { if (walletAddress) loadBalance(walletAddress); }, [walletAddress, loadBalance]);

  useEffect(() => {
    const unsub1 = onAccountsChanged((accounts) => {
      if (accounts.length === 0) { setWalletAddress(""); setSigner(null); }
      else setWalletAddress(accounts[0]);
    });
    const unsub2 = onChainChanged(() => {
      if (walletAddress) loadBalance(walletAddress);
      loadPlans();
    });
    return () => { unsub1(); unsub2(); };
  }, [walletAddress, loadBalance, loadPlans]);

  const handleConnect = async () => {
    try {
      const result = await connectWallet();
      setWalletAddress(result.address);
      setSigner(result.signer);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to connect wallet");
    }
  };

  const handleSubscribe = (plan: PlanDisplay) => {
    if (!plan.onChain) { alert("This plan is not on-chain."); return; }
    setSelectedPlan(plan);
  };

  const handlePaymentComplete = (record: PaymentRecord) => {
    setPayments((prev) => [record, ...prev]);
    setSelectedPlan(null);
    if (walletAddress) loadBalance(walletAddress);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header
        walletConnected={walletConnected}
        walletAddress={walletAddress}
        usdcBalance={usdcBalance}
        onConnect={handleConnect}
      />
      <main style={{ flex: 1 }}>
        <Hero />

        {walletConnected && writeClient && (
          <MerchantPanel client={writeClient} onPlanCreated={loadPlans} />
        )}

        <PricingCards
          plans={plans}
          loading={loadingPlans}
          onSubscribe={handleSubscribe}
          walletConnected={walletConnected}
          onConnect={handleConnect}
        />

        {payments.length > 0 && <PaymentHistory payments={payments} />}
        <SchedulerPanel readClient={readClient} ipfsAdapter={ipfsAdapter} />
        <CodePreview />
      </main>
      <Footer />

      {selectedPlan && writeClient && (
        <CheckoutModal
          plan={selectedPlan}
          walletAddress={walletAddress}
          client={writeClient}
          onClose={() => setSelectedPlan(null)}
          onComplete={handlePaymentComplete}
        />
      )}
    </div>
  );
}

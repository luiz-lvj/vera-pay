import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { PricingCards } from "./components/PricingCards";
import { CheckoutModal } from "./components/CheckoutModal";
import { PaymentHistory } from "./components/PaymentHistory";
import { MerchantPanel } from "./components/MerchantPanel";
import { CodePreview } from "./components/CodePreview";
import { Footer } from "./components/Footer";
import { connectWallet, onAccountsChanged, onChainChanged } from "./lib/wallet";
import {
  VERA_PAY_ADDRESS,
  TEST_USDC_ADDRESS,
  VERA_PAY_ABI,
  ERC20_ABI,
} from "./lib/contracts";
import type { PlanDisplay, PaymentRecord, OnChainPlan } from "./lib/types";

function intervalToLabel(seconds: bigint): string {
  const s = Number(seconds);
  if (s >= 2592000) return "month";
  if (s >= 604800) return "week";
  if (s >= 86400) return "day";
  if (s >= 3600) return "hour";
  return `${s}s`;
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

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const provider = new ethers.JsonRpcProvider("https://testnet.evm.nodes.onflow.org");
      const contract = new ethers.Contract(VERA_PAY_ADDRESS, VERA_PAY_ABI, provider);
      const nextId: bigint = await contract.nextPlanId();

      const loaded: PlanDisplay[] = [];
      for (let i = 0n; i < nextId; i++) {
        try {
          const raw = await contract.getPlan(i);
          if (!raw.active) continue;
          const onChain: OnChainPlan = {
            planId: Number(i),
            merchant: raw.merchant,
            paymentToken: raw.paymentToken,
            amount: raw.amount,
            interval: raw.interval,
            name: raw.name,
            metadataURI: raw.metadataURI,
            active: raw.active,
          };

          const decimals = 6;
          const price = ethers.formatUnits(raw.amount, decimals);
          loaded.push({
            id: Number(i),
            name: raw.name || `Plan #${i}`,
            price,
            interval: intervalToLabel(raw.interval),
            features: [`${ethers.formatUnits(raw.amount, decimals)} USDC / ${intervalToLabel(raw.interval)}`, `Token: ${raw.paymentToken.slice(0, 6)}...${raw.paymentToken.slice(-4)}`, `Merchant: ${raw.merchant.slice(0, 6)}...${raw.merchant.slice(-4)}`],
            highlighted: loaded.length === 0,
            onChain,
          });
        } catch {
          // plan might not exist or be invalid
        }
      }

      setPlans(loaded);
    } catch (err) {
      console.error("Failed to load plans:", err);
    } finally {
      setLoadingPlans(false);
    }
  }, []);

  const loadBalance = useCallback(async (addr: string) => {
    try {
      const provider = new ethers.JsonRpcProvider("https://testnet.evm.nodes.onflow.org");
      const token = new ethers.Contract(TEST_USDC_ADDRESS, ERC20_ABI, provider);
      const bal: bigint = await token.balanceOf(addr);
      setUsdcBalance(ethers.formatUnits(bal, 6));
    } catch {
      setUsdcBalance("0");
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (walletAddress) loadBalance(walletAddress);
  }, [walletAddress, loadBalance]);

  useEffect(() => {
    const unsub1 = onAccountsChanged((accounts) => {
      if (accounts.length === 0) {
        setWalletAddress("");
        setSigner(null);
      } else {
        setWalletAddress(accounts[0]);
      }
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
    if (!plan.onChain) {
      alert("This plan is not on-chain.");
      return;
    }
    setSelectedPlan(plan);
  };

  const handlePaymentComplete = (record: PaymentRecord) => {
    setPayments((prev) => [record, ...prev]);
    setSelectedPlan(null);
    if (walletAddress) loadBalance(walletAddress);
  };

  const handlePlanCreated = () => {
    loadPlans();
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

        {walletConnected && signer && (
          <MerchantPanel signer={signer} onPlanCreated={handlePlanCreated} />
        )}

        <PricingCards
          plans={plans}
          loading={loadingPlans}
          onSubscribe={handleSubscribe}
          walletConnected={walletConnected}
          onConnect={handleConnect}
        />

        {payments.length > 0 && <PaymentHistory payments={payments} />}
        <CodePreview />
      </main>
      <Footer />

      {selectedPlan && signer && (
        <CheckoutModal
          plan={selectedPlan}
          walletAddress={walletAddress}
          signer={signer}
          onClose={() => setSelectedPlan(null)}
          onComplete={handlePaymentComplete}
        />
      )}
    </div>
  );
}

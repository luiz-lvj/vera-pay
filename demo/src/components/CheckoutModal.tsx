import { useState } from "react";
import { ethers } from "ethers";
import { css } from "../lib/css";
import { FLOW_TESTNET } from "../lib/contracts";
import type { VeraPayClient } from "@verapay/sdk";
import { ipfsGatewayUrl, ERC20_ABI } from "@verapay/sdk";
import type { PlanDisplay, PaymentRecord } from "../lib/types";

interface Props {
  plan: PlanDisplay;
  walletAddress: string;
  client: VeraPayClient;
  onClose: () => void;
  onComplete: (record: PaymentRecord) => void;
}

type Step = "confirm" | "approving" | "subscribing" | "done";

export function CheckoutModal({ plan, walletAddress, client, onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>("confirm");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [ipfsCid, setIpfsCid] = useState("");

  const handleCheckout = async () => {
    if (!plan.onChain) return;
    setError("");

    try {
      // Step 1: Approve tokens
      setStep("approving");
      const signer = (client.contract.runner as ethers.Signer);
      const token = new ethers.Contract(plan.onChain.paymentToken, ERC20_ABI, signer);
      const approveAmount = plan.onChain.amount * 12n;
      const approveTx = await token.approve(client.contractAddress, approveAmount);
      await approveTx.wait();

      // Step 2: Subscribe on-chain (SDK handles the tx + auto-pins receipt to IPFS)
      setStep("subscribing");
      const result = await client.subscribe(plan.onChain.planId);
      setTxHash(result.tx.hash);

      if (result.receipt.ipfsCid) {
        setIpfsCid(result.receipt.ipfsCid);
      }

      setStep("done");

      const record: PaymentRecord = {
        subscriptionId: result.subscriptionId.toString(),
        planName: plan.name,
        amount: plan.price,
        txHash: result.tx.hash,
        timestamp: Date.now(),
        ipfsCid: result.receipt.ipfsCid,
        status: "success",
      };

      setTimeout(() => onComplete(record), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      const short = msg.length > 120 ? msg.slice(0, 120) + "..." : msg;
      setError(short);
      setStep("confirm");
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.close} onClick={onClose}>&times;</button>

        <div style={styles.header}>
          <div style={styles.iconWrap}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </div>
          <h3 style={styles.title}>Checkout</h3>
          <p style={styles.subtitle}>Subscribe to {plan.name}</p>
        </div>

        <div style={styles.details}>
          <div style={styles.row}>
            <span style={styles.label}>Plan</span>
            <span style={styles.value}>{plan.name}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Amount</span>
            <span style={styles.value}>{plan.price} USDC / {plan.interval}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Network</span>
            <span style={styles.value}>Flow EVM Testnet</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Wallet</span>
            <span style={{ ...styles.value, fontFamily: "monospace", fontSize: 12 }}>
              {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
            </span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Contract</span>
            <span style={{ ...styles.value, fontFamily: "monospace", fontSize: 12 }}>
              {client.contractAddress.slice(0, 8)}...{client.contractAddress.slice(-6)}
            </span>
          </div>
        </div>

        {step === "confirm" && (
          <>
            <div style={styles.info}>
              Your wallet will request two transactions: ERC-20 token approval, then
              the on-chain subscription. The first payment is charged immediately.
              {client.hasIPFS && " A receipt will be pinned to IPFS automatically."}
            </div>
            {error && <div style={styles.error}>{error}</div>}
            <button style={styles.payButton} onClick={handleCheckout}>
              Pay {plan.price} USDC
            </button>
          </>
        )}

        {step !== "confirm" && (
          <div style={styles.progress}>
            <StepIndicator
              label="Approve USDC spending"
              status={step === "approving" ? "active" : "done"}
            />
            <StepIndicator
              label={client.hasIPFS ? "Subscribe + pin receipt to IPFS" : "Subscribe on-chain"}
              status={
                step === "subscribing"
                  ? "active"
                  : step === "approving"
                    ? "pending"
                    : "done"
              }
            />
            {step === "done" && (
              <>
                <div style={styles.successMsg}>
                  <span style={{ fontSize: 24 }}>&#10003;</span>
                  <span>Subscription active!</span>
                </div>
                {txHash && (
                  <a
                    href={`${FLOW_TESTNET.blockExplorer}/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.txLink}
                  >
                    View on Flowscan &#8599;
                  </a>
                )}
                {ipfsCid && (
                  <a
                    href={ipfsGatewayUrl(ipfsCid)}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.txLink}
                  >
                    View receipt on IPFS &#8599;
                  </a>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ label, status }: { label: string; status: "pending" | "active" | "done" }) {
  return (
    <div style={stepStyles.row}>
      <div
        style={{
          ...stepStyles.dot,
          ...(status === "active" ? stepStyles.dotActive : {}),
          ...(status === "done" ? stepStyles.dotDone : {}),
        }}
      >
        {status === "done" && "\u2713"}
        {status === "active" && <div style={stepStyles.spinner} />}
      </div>
      <span
        style={{
          ...stepStyles.label,
          color: status === "pending" ? "var(--text-muted)" : "var(--text)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

const styles = css({
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    backdropFilter: "blur(4px)",
  },
  modal: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    width: "100%",
    maxWidth: 440,
    padding: "32px 28px",
    position: "relative" as const,
  },
  close: {
    position: "absolute" as const,
    top: 16,
    right: 16,
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 24,
    lineHeight: 1,
  },
  header: { textAlign: "center" as const, marginBottom: 24 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: "rgba(108, 92, 231, 0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
    color: "var(--accent-light)",
  },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 14, color: "var(--text-muted)" },
  details: {
    background: "var(--bg)",
    borderRadius: 10,
    padding: "16px 18px",
    marginBottom: 20,
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 13, color: "var(--text-muted)" },
  value: { fontSize: 14, fontWeight: 600 },
  info: {
    fontSize: 13,
    color: "var(--text-muted)",
    background: "rgba(108, 92, 231, 0.06)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 16,
    lineHeight: 1.6,
    border: "1px solid rgba(108, 92, 231, 0.15)",
  },
  error: {
    fontSize: 13,
    color: "var(--error)",
    background: "rgba(255, 107, 107, 0.08)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 12,
    border: "1px solid rgba(255, 107, 107, 0.2)",
    wordBreak: "break-word" as const,
  },
  payButton: {
    width: "100%",
    padding: "14px 0",
    borderRadius: 10,
    background: "var(--gradient)",
    color: "#fff",
    border: "none",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  progress: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
    padding: "8px 0",
  },
  successMsg: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    color: "var(--success)",
    fontWeight: 700,
    fontSize: 16,
    marginTop: 8,
  },
  txLink: {
    display: "block",
    textAlign: "center" as const,
    color: "var(--accent-light)",
    fontSize: 13,
    marginTop: 8,
    textDecoration: "none",
  },
});

const stepStyles = css({
  row: { display: "flex", alignItems: "center", gap: 12 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
    flexShrink: 0,
  },
  dotActive: {
    background: "rgba(108, 92, 231, 0.2)",
    border: "2px solid var(--accent)",
    color: "var(--accent-light)",
  },
  dotDone: { background: "var(--success)", color: "#fff" },
  label: { fontSize: 14, fontWeight: 500 },
  spinner: {
    width: 14,
    height: 14,
    border: "2px solid var(--accent-light)",
    borderTopColor: "transparent",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
});

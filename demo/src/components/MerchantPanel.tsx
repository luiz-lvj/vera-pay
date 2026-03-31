import { useState } from "react";
import { ethers } from "ethers";
import { css } from "../lib/css";
import {
  VERA_PAY_ADDRESS,
  TEST_USDC_ADDRESS,
  VERA_PAY_ABI,
  ERC20_ABI,
} from "../lib/contracts";

interface Props {
  signer: ethers.JsonRpcSigner;
  onPlanCreated: () => void;
}

export function MerchantPanel({ signer, onPlanCreated }: Props) {
  const [planName, setPlanName] = useState("Pro Streaming");
  const [planPrice, setPlanPrice] = useState("10");
  const [planInterval, setPlanInterval] = useState("3600");
  const [creating, setCreating] = useState(false);
  const [minting, setMinting] = useState(false);
  const [status, setStatus] = useState("");

  const handleCreatePlan = async () => {
    setCreating(true);
    setStatus("");
    try {
      const contract = new ethers.Contract(VERA_PAY_ADDRESS, VERA_PAY_ABI, signer);
      const amount = ethers.parseUnits(planPrice, 6);
      const tx = await contract.createPlan(
        TEST_USDC_ADDRESS,
        amount,
        BigInt(planInterval),
        planName,
        "",
      );
      setStatus("Waiting for confirmation...");
      await tx.wait();
      setStatus("Plan created on-chain!");
      onPlanCreated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      setStatus("Error: " + (msg.length > 80 ? msg.slice(0, 80) + "..." : msg));
    } finally {
      setCreating(false);
    }
  };

  const handleMintUSDC = async () => {
    setMinting(true);
    setStatus("");
    try {
      const token = new ethers.Contract(TEST_USDC_ADDRESS, ERC20_ABI, signer);
      const addr = await signer.getAddress();
      const tx = await token.mint(addr, ethers.parseUnits("1000", 6));
      setStatus("Minting 1,000 test USDC...");
      await tx.wait();
      setStatus("Minted 1,000 test USDC!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      setStatus("Error: " + (msg.length > 80 ? msg.slice(0, 80) + "..." : msg));
    } finally {
      setMinting(false);
    }
  };

  return (
    <section style={styles.section}>
      <h2 style={styles.heading}>Setup &amp; Test</h2>
      <p style={styles.subheading}>
        Mint test USDC and create subscription plans on the live Flow EVM Testnet contract.
      </p>

      <div style={styles.grid}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Mint Test USDC</h3>
          <p style={styles.cardDesc}>
            Get 1,000 test USDC tokens to your wallet for testing subscriptions.
          </p>
          <button
            style={styles.btn}
            onClick={handleMintUSDC}
            disabled={minting}
          >
            {minting ? "Minting..." : "Mint 1,000 USDC"}
          </button>
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Create Plan</h3>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Name</label>
            <input
              style={styles.input}
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="Plan name"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Price (USDC)</label>
            <input
              style={styles.input}
              value={planPrice}
              onChange={(e) => setPlanPrice(e.target.value)}
              placeholder="10.00"
              type="number"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Interval (seconds)</label>
            <select
              style={styles.input}
              value={planInterval}
              onChange={(e) => setPlanInterval(e.target.value)}
            >
              <option value="3600">1 Hour (testing)</option>
              <option value="86400">1 Day</option>
              <option value="604800">1 Week</option>
              <option value="2592000">30 Days</option>
            </select>
          </div>
          <button
            style={styles.btnPrimary}
            onClick={handleCreatePlan}
            disabled={creating}
          >
            {creating ? "Creating..." : "Create Plan On-Chain"}
          </button>
        </div>
      </div>

      {status && (
        <div style={{
          ...styles.status,
          borderColor: status.startsWith("Error") ? "rgba(255,107,107,0.3)" : "rgba(0,184,148,0.3)",
          color: status.startsWith("Error") ? "var(--error)" : "var(--success)",
        }}>
          {status}
        </div>
      )}
    </section>
  );
}

const styles = css({
  section: {
    padding: "40px 24px",
    maxWidth: 1200,
    margin: "0 auto",
  },
  heading: {
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    marginBottom: 4,
  },
  subheading: {
    color: "var(--text-muted)",
    fontSize: 14,
    marginBottom: 24,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "24px",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginBottom: 16,
    lineHeight: 1.5,
  },
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: 4,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: 14,
    outline: "none",
  },
  btn: {
    width: "100%",
    padding: "10px 0",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontSize: 14,
    fontWeight: 600,
  },
  btnPrimary: {
    width: "100%",
    padding: "10px 0",
    borderRadius: 8,
    border: "none",
    background: "var(--gradient)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    marginTop: 4,
  },
  status: {
    marginTop: 16,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid",
    fontSize: 13,
    fontWeight: 500,
    textAlign: "center" as const,
    wordBreak: "break-word" as const,
  },
});

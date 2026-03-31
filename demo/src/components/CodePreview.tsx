import { css } from "../lib/css";

const CODE_EXAMPLE = `import {
  VeraPayClient, FlowScheduler, createStorachaAdapter,
  DEPLOYED_CONTRACTS, CADENCE_HANDLERS, KNOWN_TOKENS,
} from "@verapay/sdk";
import { ethers } from "ethers";

// 1. Connect to VeraPay on Flow EVM
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const ipfs = createStorachaAdapter({ key: "...", proof: "..." });

const veraPay = VeraPayClient.fromNetwork(
  "flow-testnet",
  DEPLOYED_CONTRACTS["flow-testnet"],
  signer,
  ipfs // receipts auto-pinned to IPFS via Storacha
);

// 2. Merchant: Create a subscription plan
const { planId } = await veraPay.createPlan({
  paymentToken: KNOWN_TOKENS["flow-testnet"].USDC,
  amount: ethers.parseUnits("14.99", 18),
  interval: 30n * 24n * 3600n, // 30 days
  name: "Pro Plan",
});

// 3. Subscriber: Approve token + subscribe (one call)
const { subscriptionId, receipt } =
  await veraPay.subscribeWithApproval(planId);
console.log("IPFS receipt:", receipt.ipfsCid);

// 4. Subscribe & schedule via Flow Cadence — no off-chain keeper!
const scheduler = new FlowScheduler({
  network: "testnet",
  handlerAddress: CADENCE_HANDLERS["flow-testnet"],
  evmContractAddress: DEPLOYED_CONTRACTS["flow-testnet"],
  ipfsAdapter: ipfs,
});
await scheduler.authenticate(); // Flow wallet (Blocto, Lilico)
await scheduler.setup();        // COA + handler (one-time)
await scheduler.approveERC20(KNOWN_TOKENS["flow-testnet"].USDC);

const result = await scheduler.subscribeAndSchedule({
  planId: planId.toString(),
  intervalSeconds: "2592000.0", // 30 days
});
console.log("Scheduled TX:", result.scheduledTxId);
console.log("IPFS CID:", result.ipfsCid);`;

export function CodePreview() {
  return (
    <section id="code" style={styles.section}>
      <div style={styles.inner}>
        <div style={styles.text}>
          <h2 style={styles.heading}>
            Integrate in
            <br />
            <span style={styles.highlight}>Minutes</span>
          </h2>
          <p style={styles.desc}>
            Install the SDK with npm, create a plan, and start accepting
            subscription payments. IPFS receipts are automatic.
          </p>
          <div style={styles.install}>
            <code style={styles.installCode}>npm install @verapay/sdk ethers</code>
          </div>
        </div>
        <div style={styles.codeWrap}>
          <div style={styles.codeHeader}>
            <div style={styles.dots}>
              <span style={{ ...styles.dot, background: "#ff5f57" }} />
              <span style={{ ...styles.dot, background: "#febc2e" }} />
              <span style={{ ...styles.dot, background: "#28c840" }} />
            </div>
            <span style={styles.fileName}>app.ts</span>
          </div>
          <pre style={styles.pre}>
            <code style={styles.code}>{CODE_EXAMPLE}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}

const styles = css({
  section: {
    padding: "80px 24px",
    background: "rgba(108, 92, 231, 0.03)",
    borderTop: "1px solid var(--border)",
  },
  inner: {
    maxWidth: 1200,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1fr 1.5fr",
    gap: 48,
    alignItems: "start",
  },
  text: {},
  heading: {
    fontSize: 36,
    fontWeight: 800,
    lineHeight: 1.15,
    letterSpacing: "-0.02em",
    marginBottom: 16,
  },
  highlight: {
    background: "var(--gradient)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  desc: {
    fontSize: 15,
    color: "var(--text-muted)",
    lineHeight: 1.7,
    marginBottom: 24,
  },
  install: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "12px 16px",
    display: "inline-block",
  },
  installCode: {
    fontSize: 14,
    color: "var(--accent-light)",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  },
  codeWrap: {
    background: "#0d0d14",
    border: "1px solid var(--border)",
    borderRadius: 12,
    overflow: "hidden",
  },
  codeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
  },
  dots: { display: "flex", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: "50%" },
  fileName: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontFamily: "monospace",
  },
  pre: {
    padding: "20px",
    overflow: "auto",
    maxHeight: 520,
  },
  code: {
    fontSize: 13,
    lineHeight: 1.7,
    color: "var(--text)",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    whiteSpace: "pre" as const,
  },
});

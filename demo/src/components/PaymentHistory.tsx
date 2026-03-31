import { css } from "../lib/css";
import { FLOW_TESTNET } from "../lib/contracts";
import { ipfsGatewayUrl } from "@verapay/sdk";
import type { PaymentRecord } from "../lib/types";

interface Props {
  payments: PaymentRecord[];
}

export function PaymentHistory({ payments }: Props) {
  return (
    <section style={styles.section}>
      <h2 style={styles.heading}>Payment History</h2>
      <p style={styles.subheading}>
        Real on-chain transactions on Flow EVM Testnet. Click a tx hash to verify on Flowscan.
      </p>
      <div style={styles.table}>
        <div style={styles.headerRow}>
          <span style={styles.th}>Plan</span>
          <span style={styles.th}>Amount</span>
          <span style={styles.th}>Sub ID</span>
          <span style={styles.th}>Tx Hash</span>
          <span style={styles.th}>IPFS</span>
          <span style={styles.th}>Status</span>
        </div>
        {payments.map((p) => (
          <div key={p.txHash} style={styles.row}>
            <span style={styles.td}>{p.planName}</span>
            <span style={styles.td}>{p.amount} USDC</span>
            <span style={{ ...styles.td, fontFamily: "monospace", fontSize: 12 }}>
              #{p.subscriptionId}
            </span>
            <span style={styles.td}>
              <a
                href={`${FLOW_TESTNET.blockExplorer}/tx/${p.txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--accent-light)", fontFamily: "monospace", fontSize: 12, textDecoration: "none" }}
              >
                {p.txHash.slice(0, 10)}... &#8599;
              </a>
            </span>
            <span style={styles.td}>
              {p.ipfsCid ? (
                <a
                  href={ipfsGatewayUrl(p.ipfsCid)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--accent-light)", fontFamily: "monospace", fontSize: 12, textDecoration: "none" }}
                >
                  {p.ipfsCid.slice(0, 12)}... &#8599;
                </a>
              ) : (
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
              )}
            </span>
            <span style={styles.td}>
              <span style={styles.statusBadge}>
                &#10003; {p.status}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const styles = css({
  section: {
    padding: "40px 24px 60px",
    maxWidth: 1200,
    margin: "0 auto",
  },
  heading: {
    fontSize: 24,
    fontWeight: 800,
    marginBottom: 4,
    letterSpacing: "-0.02em",
  },
  subheading: {
    color: "var(--text-muted)",
    fontSize: 14,
    marginBottom: 24,
  },
  table: {
    background: "var(--surface)",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    overflow: "hidden",
  },
  headerRow: {
    display: "grid",
    gridTemplateColumns: "1fr 0.8fr 0.8fr 1.5fr 1.5fr 0.8fr",
    padding: "14px 20px",
    borderBottom: "1px solid var(--border)",
    background: "rgba(255,255,255,0.02)",
  },
  th: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 0.8fr 0.8fr 1.5fr 1.5fr 0.8fr",
    padding: "14px 20px",
    borderBottom: "1px solid var(--border)",
    alignItems: "center",
  },
  td: {
    fontSize: 14,
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "rgba(0, 184, 148, 0.1)",
    color: "var(--success)",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
  },
});

import { css } from "../lib/css";

export function Hero() {
  return (
    <section style={styles.hero}>
      <div style={styles.inner}>
        <div style={styles.badge}>
          Built on Flow Blockchain + IPFS
        </div>
        <h1 style={styles.title}>
          Subscription Payments,
          <br />
          <span style={styles.highlight}>On-Chain</span>
        </h1>
        <p style={styles.subtitle}>
          VeraPay is the Stripe of Web3. Drop-in subscription billing powered by
          stablecoins on Flow EVM, with immutable receipts on IPFS.
        </p>
        <div style={styles.stats}>
          <div style={styles.stat}>
            <div style={styles.statValue}>0.5%</div>
            <div style={styles.statLabel}>Protocol Fee</div>
          </div>
          <div style={styles.divider} />
          <div style={styles.stat}>
            <div style={styles.statValue}>USDC</div>
            <div style={styles.statLabel}>Stablecoin Payments</div>
          </div>
          <div style={styles.divider} />
          <div style={styles.stat}>
            <div style={styles.statValue}>IPFS</div>
            <div style={styles.statLabel}>Immutable Receipts</div>
          </div>
        </div>
      </div>
    </section>
  );
}

const styles = css({
  hero: {
    padding: "100px 24px 60px",
    textAlign: "center" as const,
  },
  inner: { maxWidth: 800, margin: "0 auto" },
  badge: {
    display: "inline-block",
    padding: "6px 16px",
    borderRadius: 20,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--accent-light)",
    marginBottom: 28,
    letterSpacing: "0.02em",
  },
  title: {
    fontSize: "clamp(36px, 6vw, 64px)",
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: "-0.03em",
    marginBottom: 20,
  },
  highlight: {
    background: "var(--gradient)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    fontSize: 18,
    color: "var(--text-muted)",
    maxWidth: 550,
    margin: "0 auto 48px",
    lineHeight: 1.7,
  },
  stats: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 40,
    flexWrap: "wrap" as const,
  },
  stat: { textAlign: "center" as const },
  statValue: {
    fontSize: 28,
    fontWeight: 800,
    background: "var(--gradient)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  statLabel: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 },
  divider: {
    width: 1,
    height: 40,
    background: "var(--border)",
  },
});

import { css } from "../lib/css";

interface HeaderProps {
  walletConnected: boolean;
  walletAddress: string;
  usdcBalance: string;
  onConnect: () => void;
}

export function Header({ walletConnected, walletAddress, usdcBalance, onConnect }: HeaderProps) {
  return (
    <header style={styles.header}>
      <div style={styles.inner}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>V</div>
          <span style={styles.logoText}>VeraPay</span>
          <span style={styles.networkBadge}>Flow Testnet</span>
        </div>

        <nav style={styles.nav}>
          <a href="#pricing" style={styles.navLink}>Pricing</a>
          <a href="#code" style={styles.navLink}>Integrate</a>
          {walletConnected ? (
            <div style={styles.walletArea}>
              <div style={styles.balanceBadge}>
                {parseFloat(usdcBalance).toFixed(2)} USDC
              </div>
              <div style={styles.walletBadge}>
                <div style={styles.walletDot} />
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </div>
            </div>
          ) : (
            <button onClick={onConnect} style={styles.connectBtn}>
              Connect Wallet
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

const styles = css({
  header: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    background: "rgba(10, 10, 15, 0.85)",
    backdropFilter: "blur(20px)",
    borderBottom: "1px solid var(--border)",
  },
  inner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "16px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "var(--gradient)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 18,
    color: "#fff",
  },
  logoText: { fontWeight: 700, fontSize: 20, letterSpacing: "-0.02em" },
  networkBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--success)",
    background: "rgba(0, 184, 148, 0.1)",
    border: "1px solid rgba(0, 184, 148, 0.2)",
    borderRadius: 6,
    padding: "3px 8px",
    letterSpacing: "0.02em",
  },
  nav: { display: "flex", alignItems: "center", gap: 24 },
  navLink: {
    color: "var(--text-muted)",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 500,
    transition: "color 0.2s",
  },
  connectBtn: {
    background: "var(--gradient)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 20px",
    fontSize: 14,
    fontWeight: 600,
  },
  walletArea: { display: "flex", alignItems: "center", gap: 8 },
  balanceBadge: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent-light)",
    background: "rgba(108, 92, 231, 0.1)",
    border: "1px solid rgba(108, 92, 231, 0.2)",
    borderRadius: 8,
    padding: "8px 12px",
  },
  walletBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "monospace",
  },
  walletDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "var(--success)",
  },
});

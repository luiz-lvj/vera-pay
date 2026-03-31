import { css } from "../lib/css";

export function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.inner}>
        <div style={styles.left}>
          <div style={styles.brand}>
            <div style={styles.logo}>V</div>
            <span style={styles.name}>VeraPay</span>
          </div>
          <p style={styles.tagline}>
            On-chain subscription payments powered by Flow EVM &amp; IPFS
          </p>
        </div>
        <div style={styles.links}>
          <div style={styles.col}>
            <h4 style={styles.colTitle}>Built With</h4>
            <a href="https://flow.com" style={styles.link} target="_blank" rel="noreferrer">Flow Blockchain</a>
            <a href="https://ipfs.io" style={styles.link} target="_blank" rel="noreferrer">IPFS / Protocol Labs</a>
            <a href="https://getfoundry.sh" style={styles.link} target="_blank" rel="noreferrer">Foundry</a>
          </div>
          <div style={styles.col}>
            <h4 style={styles.colTitle}>Resources</h4>
            <a href="https://developers.flow.com" style={styles.link} target="_blank" rel="noreferrer">Flow Docs</a>
            <a href="https://docs-beta.web3.storage" style={styles.link} target="_blank" rel="noreferrer">web3.storage</a>
            <a href="https://testnet.explorer.flow.com" style={styles.link} target="_blank" rel="noreferrer">Flow Explorer</a>
          </div>
        </div>
      </div>
      <div style={styles.bottom}>
        <span style={styles.copy}>&copy; {new Date().getFullYear()} VeraPay. Built for the hackathon.</span>
      </div>
    </footer>
  );
}

const styles = css({
  footer: {
    borderTop: "1px solid var(--border)",
    padding: "48px 24px 24px",
  },
  inner: {
    maxWidth: 1200,
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    gap: 48,
    flexWrap: "wrap" as const,
    paddingBottom: 32,
  },
  left: {},
  brand: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "var(--gradient)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 16,
    color: "#fff",
  },
  name: { fontWeight: 700, fontSize: 18 },
  tagline: { color: "var(--text-muted)", fontSize: 14, maxWidth: 280 },
  links: { display: "flex", gap: 64 },
  col: { display: "flex", flexDirection: "column" as const, gap: 8 },
  colTitle: { fontSize: 13, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  link: { color: "var(--text-muted)", textDecoration: "none", fontSize: 14, transition: "color 0.2s" },
  bottom: {
    maxWidth: 1200,
    margin: "0 auto",
    borderTop: "1px solid var(--border)",
    paddingTop: 20,
    textAlign: "center" as const,
  },
  copy: { fontSize: 13, color: "var(--text-muted)" },
});

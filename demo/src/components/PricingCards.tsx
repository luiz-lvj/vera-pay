import { css } from "../lib/css";
import type { PlanDisplay } from "../lib/types";

interface Props {
  plans: PlanDisplay[];
  loading: boolean;
  onSubscribe: (plan: PlanDisplay) => void;
  walletConnected: boolean;
  onConnect: () => void;
}

export function PricingCards({ plans, loading, onSubscribe, walletConnected, onConnect }: Props) {
  return (
    <section id="pricing" style={styles.section}>
      <h2 style={styles.heading}>On-Chain Plans</h2>
      <p style={styles.subheading}>
        {loading
          ? "Loading plans from Flow EVM Testnet..."
          : plans.length === 0
            ? "No plans found. Connect your wallet and create one above!"
            : "These plans are live on Flow EVM Testnet. Subscribe to trigger a real blockchain transaction."}
      </p>
      <div style={styles.grid}>
        {plans.map((plan) => (
          <div
            key={plan.id}
            style={{
              ...styles.card,
              ...(plan.highlighted ? styles.cardHighlighted : {}),
            }}
          >
            {plan.highlighted && (
              <div style={styles.popular}>Most Popular</div>
            )}
            <h3 style={styles.planName}>{plan.name}</h3>
            <div style={styles.price}>
              <span style={styles.currency}>$</span>
              <span style={styles.amount}>{plan.price}</span>
              <span style={styles.interval}>/{plan.interval}</span>
            </div>
            <ul style={styles.features}>
              {plan.features.map((f) => (
                <li key={f} style={styles.feature}>
                  <span style={styles.check}>&#10003;</span> {f}
                </li>
              ))}
            </ul>
            <button
              style={{
                ...styles.button,
                ...(plan.highlighted ? styles.buttonHighlighted : {}),
              }}
              onClick={() => walletConnected ? onSubscribe(plan) : onConnect()}
            >
              {walletConnected ? "Subscribe with USDC" : "Connect Wallet"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

const styles = css({
  section: {
    padding: "40px 24px 80px",
    maxWidth: 1200,
    margin: "0 auto",
  },
  heading: {
    textAlign: "center" as const,
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    marginBottom: 8,
  },
  subheading: {
    textAlign: "center" as const,
    color: "var(--text-muted)",
    fontSize: 15,
    marginBottom: 48,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 24,
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "32px 28px",
    position: "relative" as const,
    transition: "border-color 0.2s, transform 0.2s",
  },
  cardHighlighted: {
    border: "1px solid var(--accent)",
    boxShadow: "0 0 40px rgba(108, 92, 231, 0.15)",
  },
  popular: {
    position: "absolute" as const,
    top: -12,
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--gradient)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 16px",
    borderRadius: 20,
    letterSpacing: "0.03em",
    textTransform: "uppercase" as const,
  },
  planName: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 16,
  },
  price: {
    display: "flex",
    alignItems: "baseline",
    gap: 2,
    marginBottom: 24,
  },
  currency: {
    fontSize: 20,
    fontWeight: 600,
    color: "var(--text-muted)",
    alignSelf: "flex-start",
    marginTop: 4,
  },
  amount: {
    fontSize: 48,
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: "-0.03em",
  },
  interval: {
    fontSize: 15,
    color: "var(--text-muted)",
    fontWeight: 500,
  },
  features: {
    listStyle: "none",
    marginBottom: 28,
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  feature: {
    fontSize: 14,
    color: "var(--text-muted)",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  check: {
    color: "var(--success)",
    fontWeight: 700,
    fontSize: 14,
  },
  button: {
    width: "100%",
    padding: "12px 0",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontSize: 14,
    fontWeight: 600,
    transition: "all 0.2s",
  },
  buttonHighlighted: {
    background: "var(--gradient)",
    color: "#fff",
    border: "none",
  },
});

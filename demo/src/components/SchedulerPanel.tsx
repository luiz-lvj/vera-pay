import { useState, useEffect, useCallback, useMemo } from "react";
import { FlowScheduler, CADENCE_HANDLERS, DEPLOYED_CONTRACTS, KNOWN_TOKENS, ipfsGatewayUrl } from "@vera-pay/sdk";
import type { VeraPayClient, Subscription, Plan, IPFSAdapter } from "@vera-pay/sdk";
import { css } from "../lib/css";

interface Props {
  readClient: VeraPayClient;
  ipfsAdapter?: IPFSAdapter;
}

interface SubOption {
  sub: Subscription;
  plan: Plan;
}

interface ScheduledItem {
  flowTxId: string;
  scheduledTxId?: string;
  subscriptionId: string;
  planName: string;
  delaySeconds: string;
  priority: string;
  timestamp: number;
  status: "pending" | "sealed" | "failed";
  ipfsCid?: string;
}

export function SchedulerPanel({ readClient, ipfsAdapter }: Props) {
  const scheduler = useMemo(() => new FlowScheduler({
    network: "testnet",
    handlerAddress: CADENCE_HANDLERS["flow-testnet"],
    evmContractAddress: DEPLOYED_CONTRACTS["flow-testnet"],
    ipfsAdapter,
  }), [ipfsAdapter]);
  const [flowAddr, setFlowAddr] = useState<string | null>(null);
  const [coaEvmAddr, setCoaEvmAddr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [approving, setApproving] = useState(false);
  const [isSetUp, setIsSetUp] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [status, setStatus] = useState("");
  const [scheduled, setScheduled] = useState<ScheduledItem[]>([]);

  const [subOptions, setSubOptions] = useState<SubOption[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [delaySeconds, setDelaySeconds] = useState("60.0");
  const [priority, setPriority] = useState("1");
  const [executionEffort, setExecutionEffort] = useState("1000");

  const checkAuth = useCallback(async () => {
    const addr = await scheduler.currentUser();
    setFlowAddr(addr);
  }, []);

  const loadSubscriptions = useCallback(async (evmAddr: string) => {
    setLoadingSubs(true);
    try {
      const subIds = await readClient.getSubscriberSubscriptions(evmAddr);
      const options: SubOption[] = [];
      for (const id of subIds) {
        const sub = await readClient.getSubscription(id);
        const plan = await readClient.getPlan(sub.planId);
        options.push({ sub, plan });
      }
      setSubOptions(options);
      if (options.length > 0 && !subscriptionId) {
        setSubscriptionId(options[0].sub.subscriptionId.toString());
      }
    } catch (err) {
      console.error("Failed to load subscriptions:", err);
    } finally {
      setLoadingSubs(false);
    }
  }, [readClient, subscriptionId]);

  const loadPlans = useCallback(async () => {
    try {
      const plans = await readClient.listActivePlans();
      setAvailablePlans(plans);
      if (plans.length > 0 && !selectedPlanId) {
        setSelectedPlanId(plans[0].planId.toString());
      }
    } catch (err) {
      console.error("Failed to load plans:", err);
    }
  }, [readClient, selectedPlanId]);

  const handleSubscribeAndSchedule = async () => {
    if (!selectedPlanId) return;
    const plan = availablePlans.find(p => p.planId.toString() === selectedPlanId);
    if (!plan) return;

    setSubscribing(true);
    setStatus("");
    try {
      const intervalSec = Number(plan.interval);
      setStatus(`Subscribing & scheduling next payment in ${intervalSec}s...`);
      const result = await scheduler.subscribeAndSchedule({
        planId: selectedPlanId,
        intervalSeconds: `${intervalSec.toFixed(1)}`,
        priority: 1,
        executionEffort: 1000,
      });

      const item: ScheduledItem = {
        flowTxId: result.flowTxId,
        scheduledTxId: result.scheduledTxId,
        subscriptionId: "new",
        planName: plan.name || `Plan #${plan.planId}`,
        delaySeconds: `${intervalSec}`,
        priority: "Medium",
        timestamp: Date.now(),
        status: result.scheduledTxId ? "sealed" : "pending",
        ipfsCid: result.ipfsCid,
      };
      setScheduled(prev => [item, ...prev]);
      if (coaEvmAddr) await loadSubscriptions(coaEvmAddr);

      const parts = ["Subscribed & scheduled!"];
      if (result.scheduledTxId) parts.push(`Scheduled TX: ${result.scheduledTxId}`);
      if (result.ipfsCid) parts.push(`IPFS: ${result.ipfsCid.slice(0, 16)}...`);
      setStatus(parts.join(" | "));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Subscribe failed";
      setStatus("Error: " + (msg.length > 150 ? msg.slice(0, 150) + "..." : msg));
    } finally {
      setSubscribing(false);
    }
  };

  useEffect(() => { checkAuth(); }, [checkAuth]);

  useEffect(() => {
    if (coaEvmAddr) loadSubscriptions(coaEvmAddr);
  }, [coaEvmAddr, loadSubscriptions]);

  useEffect(() => {
    if (isSetUp) loadPlans();
  }, [isSetUp, loadPlans]);

  const handleConnect = async () => {
    setConnecting(true);
    setStatus("");
    try {
      const { addr } = await scheduler.authenticate();
      setFlowAddr(addr || null);
      setIsSetUp(false);
      if (addr) {
        setStatus(`Connected: ${addr}`);
        const evmAddr = await scheduler.getCoaEvmAddress(addr);
        setCoaEvmAddr(evmAddr);
        if (evmAddr) setIsSetUp(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect";
      setStatus("Error: " + msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await scheduler.unauthenticate();
    setFlowAddr(null);
    setCoaEvmAddr(null);
    setIsSetUp(false);
    setStatus("Disconnected from Flow wallet");
  };

  const handleSetup = async () => {
    setSettingUp(true);
    setStatus("");
    try {
      setStatus("Step 1/2: Setting up COA (Cadence Owned Account)...");
      const coaTxId = await scheduler.setupCOA("1.0");
      setStatus("Step 1/2: Waiting for COA transaction to seal...");
      await scheduler.waitForTransaction(coaTxId);

      setStatus("Step 2/2: Initializing VeraPay handler...");
      const handlerTxId = await scheduler.initHandler();
      setStatus("Step 2/2: Waiting for handler transaction to seal...");
      await scheduler.waitForTransaction(handlerTxId);

      const evmAddr = await scheduler.getCoaEvmAddress();
      setCoaEvmAddr(evmAddr);
      setIsSetUp(true);
      setStatus(evmAddr
        ? `Setup complete! COA EVM address: ${evmAddr}`
        : "Account setup complete! You can now schedule payments."
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Setup failed";
      setStatus("Error: " + (msg.length > 150 ? msg.slice(0, 150) + "..." : msg));
    } finally {
      setSettingUp(false);
    }
  };

  const handleApproveUSDC = async () => {
    setApproving(true);
    setStatus("");
    try {
      const usdcAddr = KNOWN_TOKENS["flow-testnet"].USDC;
      setStatus("Approving VeraPay to spend USDC on behalf of your COA...");
      const txId = await scheduler.approveERC20(usdcAddr);
      await scheduler.waitForTransaction(txId);
      setStatus("Approved! VeraPay can now pull USDC from your COA for scheduled payments.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval failed";
      setStatus("Error: " + (msg.length > 150 ? msg.slice(0, 150) + "..." : msg));
    } finally {
      setApproving(false);
    }
  };

  const handleSchedule = async () => {
    setScheduling(true);
    setStatus("");
    try {
      const match = subOptions.find(o => o.sub.subscriptionId.toString() === subscriptionId);
      const planName = match ? (match.plan.name || `Plan #${match.plan.planId}`) : `Sub #${subscriptionId}`;
      const txId = await scheduler.schedulePayment({
        subscriptionId,
        delaySeconds,
        priority: Number(priority),
        executionEffort: Number(executionEffort),
      });

      const item: ScheduledItem = {
        flowTxId: txId,
        subscriptionId,
        planName,
        delaySeconds,
        priority: priority === "0" ? "High" : priority === "1" ? "Medium" : "Low",
        timestamp: Date.now(),
        status: "pending",
      };
      setScheduled(prev => [item, ...prev]);
      setStatus(`Submitted! Flow tx: ${txId.slice(0, 16)}...`);

      scheduler.waitForTransaction(txId).then((sealed) => {
        const schedId = FlowScheduler.extractScheduledTxId(sealed.events);
        setScheduled(prev => prev.map(s =>
          s.flowTxId === txId ? { ...s, status: "sealed" as const, scheduledTxId: schedId } : s
        ));
        if (schedId) setStatus(`Scheduled! TX ID: ${schedId}`);
      }).catch(() => {
        setScheduled(prev => prev.map(s =>
          s.flowTxId === txId ? { ...s, status: "failed" as const } : s
        ));
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      setStatus("Error: " + (msg.length > 150 ? msg.slice(0, 150) + "..." : msg));
    } finally {
      setScheduling(false);
    }
  };

  return (
    <section style={styles.section}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.heading}>Cadence Scheduled Payments</h2>
          <p style={styles.subheading}>
            Use Flow's native <strong>Scheduled Transactions</strong> to automatically
            process subscription payments — no off-chain keeper required.
          </p>
        </div>
        <div style={styles.badge}>FLOW CADENCE</div>
      </div>

      {!flowAddr ? (
        <div style={styles.connectCard}>
          <div style={styles.connectInfo}>
            <h3 style={styles.cardTitle}>Connect Flow Wallet</h3>
            <p style={styles.cardDesc}>
              Authenticate with a Cadence wallet (Blocto, Lilico, etc.) to schedule
              on-chain payments through the deployed handler at{" "}
              <code style={styles.code}>
                A.{CADENCE_HANDLERS["flow-testnet"]}.VeraPayScheduledPaymentHandler
              </code>
            </p>
          </div>
          <button style={styles.btnPrimary} onClick={handleConnect} disabled={connecting}>
            {connecting ? "Connecting..." : "Connect Flow Wallet"}
          </button>
        </div>
      ) : (
        <>
          <div style={styles.walletBar}>
            <div>
              <div style={styles.walletAddr}>
                <span style={styles.dot} /> <strong>Flow:</strong> {flowAddr}
              </div>
              {coaEvmAddr && (
                <div style={{ ...styles.walletAddr, marginTop: 4, color: "var(--text-muted)" }}>
                  <span style={{ ...styles.dot, background: "#6c5ce7" }} /> <strong>COA EVM:</strong>{" "}
                  <a
                    href={`https://testnet.evm.flow.com/address/${coaEvmAddr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#00ef8b", textDecoration: "none" }}
                  >
                    {coaEvmAddr}
                  </a>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.btnSmall} onClick={handleSetup} disabled={settingUp}>
                {settingUp ? "Setting up..." : "Re-init Handler"}
              </button>
              <button style={{ ...styles.btnSmall, borderColor: "#00ef8b44", color: "#00ef8b" }} onClick={handleApproveUSDC} disabled={approving}>
                {approving ? "Approving..." : "Approve USDC"}
              </button>
              <button style={styles.btnSmall} onClick={handleDisconnect}>Disconnect</button>
            </div>
          </div>

          {!isSetUp ? (
            <div style={styles.setupCard}>
              <div style={styles.setupIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00ef8b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={styles.cardTitle}>Account Setup Required</h3>
                <p style={styles.cardDesc}>
                  Before scheduling payments, your Flow account needs a one-time setup:
                </p>
                <div style={styles.setupSteps}>
                  <div style={styles.setupStep}>
                    <strong>1. Create COA</strong> — A Cadence Owned Account that bridges to Flow EVM (funds it with 1 FLOW for gas)
                  </div>
                  <div style={styles.setupStep}>
                    <strong>2. Init Handler</strong> — Links the VeraPay scheduled payment handler to your account
                  </div>
                </div>
                <p style={styles.cardDesc}>
                  Both steps are idempotent — if already done, they'll be skipped. This requires ~1 FLOW for COA gas funding.
                </p>
              </div>
              <button
                style={styles.btnSetup}
                onClick={handleSetup}
                disabled={settingUp}
              >
                {settingUp ? "Setting up..." : "Setup Account"}
              </button>
            </div>
          ) : (
            <>
              <div style={styles.grid}>
                <div style={styles.card}>
                  <h3 style={styles.cardTitle}>Subscribe & Schedule</h3>
                  <p style={styles.cardDesc}>
                    Pick a plan — your COA subscribes on EVM (first payment charged now)
                    and the next recurring payment is automatically scheduled on-chain.
                  </p>
                  <div style={styles.field}>
                    <label style={styles.fieldLabel}>Plan</label>
                    {availablePlans.length > 0 ? (
                      <select
                        style={styles.input}
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(e.target.value)}
                      >
                        {availablePlans.map((p) => {
                          const iv = Number(p.interval);
                          const ivLabel = iv >= 86400 ? `${iv / 86400}d` : iv >= 3600 ? `${iv / 3600}h` : `${iv}s`;
                          return (
                            <option key={p.planId.toString()} value={p.planId.toString()}>
                              #{p.planId.toString()} — {p.name || `Plan #${p.planId}`} (every {ivLabel})
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>
                        No plans found on-chain.
                      </div>
                    )}
                  </div>
                  <button
                    style={styles.btnPrimary}
                    onClick={handleSubscribeAndSchedule}
                    disabled={subscribing || !selectedPlanId}
                  >
                    {subscribing ? "Subscribing & Scheduling..." : "Subscribe & Schedule"}
                  </button>

                  {subOptions.length > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                      <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Active Subscriptions</h4>
                      {subOptions.map((o) => (
                        <div key={o.sub.subscriptionId.toString()} style={{
                          fontSize: 12, padding: "4px 0",
                          color: o.sub.active ? "var(--text)" : "var(--text-muted)",
                        }}>
                          {o.plan.name || `Plan #${o.plan.planId}`} (Plan #{o.plan.planId.toString()})
                          {o.sub.active
                            ? ` — ${o.sub.paymentsCount.toString()} payments`
                            : " — cancelled"}
                        </div>
                      ))}
                      <button
                        style={{ ...styles.btnSmall, marginTop: 8, fontSize: 11 }}
                        onClick={() => coaEvmAddr && loadSubscriptions(coaEvmAddr)}
                      >
                        Refresh
                      </button>
                    </div>
                  )}
                </div>

                <div style={styles.card}>
                  <h3 style={styles.cardTitle}>Schedule Existing</h3>
                  <p style={styles.cardDesc}>
                    Manually schedule the next payment for an existing subscription.
                  </p>
                  <div style={styles.field}>
                    <label style={styles.fieldLabel}>Subscription</label>
                    {loadingSubs ? (
                      <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>
                        Loading...
                      </div>
                    ) : subOptions.length > 0 ? (
                      <select
                        style={styles.input}
                        value={subscriptionId}
                        onChange={(e) => setSubscriptionId(e.target.value)}
                      >
                        {subOptions.filter(o => o.sub.active).map((o) => (
                          <option key={o.sub.subscriptionId.toString()} value={o.sub.subscriptionId.toString()}>
                            {o.plan.name || `Plan #${o.plan.planId}`} (Plan #{o.plan.planId.toString()})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>
                        No subscriptions yet — use Subscribe & Schedule first.
                      </div>
                    )}
                  </div>
                  <div style={styles.field}>
                    <label style={styles.fieldLabel}>Delay (seconds)</label>
                    <select
                      style={styles.input}
                      value={delaySeconds}
                      onChange={(e) => setDelaySeconds(e.target.value)}
                    >
                      <option value="0.0">Immediate</option>
                      <option value="15.0">15 seconds (demo)</option>
                      <option value="30.0">30 seconds (demo)</option>
                      <option value="60.0">1 minute</option>
                      <option value="300.0">5 minutes</option>
                      <option value="3600.0">1 hour</option>
                      <option value="86400.0">1 day</option>
                    </select>
                  </div>
                  <div style={styles.fieldRow}>
                    <div style={{ flex: 1 }}>
                      <label style={styles.fieldLabel}>Priority</label>
                      <select
                        style={styles.input}
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                      >
                        <option value="0">High</option>
                        <option value="1">Medium</option>
                        <option value="2">Low</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={styles.fieldLabel}>Execution Effort</label>
                      <input
                        style={styles.input}
                        value={executionEffort}
                        onChange={(e) => setExecutionEffort(e.target.value)}
                        type="number"
                        min={10}
                      />
                    </div>
                  </div>
                  <button
                    style={styles.btnPrimary}
                    onClick={handleSchedule}
                    disabled={scheduling || !subscriptionId}
                  >
                    {scheduling ? "Scheduling..." : "Schedule Payment"}
                  </button>
                </div>
              </div>

              <div style={{ ...styles.card, marginTop: 20 }}>
                <h3 style={styles.cardTitle}>How It Works</h3>
                <div style={{ display: "flex", gap: 32 }}>
                  <div style={styles.step}>
                    <span style={styles.stepNum}>1</span>
                    <div>
                      <strong>One Click</strong>
                      <p style={styles.stepDesc}>
                        Pick a plan and click <strong>Subscribe & Schedule</strong>.
                        A single Cadence transaction subscribes on EVM (first payment now)
                        and schedules the next recurring payment.
                      </p>
                    </div>
                  </div>
                  <div style={styles.step}>
                    <span style={styles.stepNum}>2</span>
                    <div>
                      <strong>Auto-Execute</strong>
                      <p style={styles.stepDesc}>
                        At the scheduled time, Flow automatically calls the handler
                        which uses your COA to invoke <code>processPayment()</code> on EVM.
                      </p>
                    </div>
                  </div>
                  <div style={styles.step}>
                    <span style={styles.stepNum}>3</span>
                    <div>
                      <strong>Settle</strong>
                      <p style={styles.stepDesc}>
                        The ERC20 transfer executes on Flow EVM — no off-chain keeper,
                        no cron job, fully on-chain.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {scheduled.length > 0 && (
            <div style={styles.historyCard}>
              <h3 style={styles.cardTitle}>Scheduled Payments</h3>
              <div style={styles.tableHeader}>
                <span>Plan</span>
                <span>Submit Tx</span>
                <span>Scheduled Tx</span>
                <span>IPFS</span>
                <span>Status</span>
              </div>
              {scheduled.map((item) => (
                <div key={item.flowTxId} style={styles.tableRow}>
                  <span>{item.planName}</span>
                  <span>
                    <a
                      href={`https://testnet.explorer.flow.com/tx/${item.flowTxId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.link}
                    >
                      {item.flowTxId.slice(0, 10)}...
                    </a>
                  </span>
                  <span>
                    {item.scheduledTxId ? (
                      <a
                        href={`https://testnet.explorer.flow.com/tx/${item.scheduledTxId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...styles.link, color: "#6c5ce7" }}
                      >
                        {item.scheduledTxId.length > 12 ? `${item.scheduledTxId.slice(0, 10)}...` : item.scheduledTxId}
                      </a>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: 11 }}>pending...</span>
                    )}
                  </span>
                  <span>
                    {item.ipfsCid ? (
                      <a
                        href={ipfsGatewayUrl(item.ipfsCid)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={styles.link}
                      >
                        {item.ipfsCid.slice(0, 10)}...
                      </a>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>
                    )}
                  </span>
                  <span style={{
                    color: item.status === "sealed" ? "var(--success)"
                      : item.status === "failed" ? "var(--error)"
                      : "var(--text-muted)",
                    fontWeight: 600,
                    textTransform: "capitalize" as const,
                  }}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {status && (
        <div style={{
          ...styles.statusBar,
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
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
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
    maxWidth: 600,
    lineHeight: 1.5,
  },
  badge: {
    background: "linear-gradient(135deg, #00ef8b22, #00ef8b11)",
    border: "1px solid #00ef8b44",
    color: "#00ef8b",
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: 6,
    letterSpacing: "0.06em",
    whiteSpace: "nowrap" as const,
  },
  connectCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: 24,
    display: "flex",
    alignItems: "center",
    gap: 24,
  },
  connectInfo: {
    flex: 1,
  },
  setupCard: {
    background: "var(--surface)",
    border: "1px solid rgba(0,239,139,0.2)",
    borderRadius: "var(--radius)",
    padding: 24,
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
  },
  setupIcon: {
    flexShrink: 0,
    marginTop: 2,
  },
  setupSteps: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 1.5,
  },
  setupStep: {
    color: "var(--text-muted)",
    paddingLeft: 8,
    borderLeft: "2px solid rgba(0,239,139,0.3)",
  },
  btnSetup: {
    padding: "10px 24px",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #00ef8b, #00b894)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
    alignSelf: "center",
  },
  walletBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "10px 16px",
    marginBottom: 20,
  },
  walletAddr: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "monospace",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#00ef8b",
    display: "inline-block",
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
    padding: 24,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 12,
  },
  cardDesc: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginBottom: 16,
    lineHeight: 1.5,
  },
  code: {
    fontSize: 11,
    background: "rgba(255,255,255,0.06)",
    padding: "2px 5px",
    borderRadius: 4,
    fontFamily: "monospace",
  },
  field: {
    marginBottom: 12,
  },
  fieldRow: {
    display: "flex",
    gap: 12,
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
  btnPrimary: {
    width: "100%",
    padding: "10px 0",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #00ef8b, #00b894)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    marginTop: 4,
    cursor: "pointer",
  },
  btnSmall: {
    padding: "5px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  steps: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  },
  step: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "rgba(0,239,139,0.12)",
    color: "#00ef8b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  stepDesc: {
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.5,
    marginTop: 2,
  },
  historyCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: 24,
    marginTop: 20,
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "minmax(80px, 1fr) minmax(110px, 1.2fr) minmax(110px, 1.2fr) minmax(100px, 1fr) 70px",
    gap: 12,
    padding: "8px 0",
    borderBottom: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "minmax(80px, 1fr) minmax(110px, 1.2fr) minmax(110px, 1.2fr) minmax(100px, 1fr) 70px",
    gap: 8,
    padding: "10px 0",
    borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.04))",
    fontSize: 13,
    alignItems: "center",
  },
  link: {
    color: "#00ef8b",
    textDecoration: "none",
    fontFamily: "monospace",
    fontSize: 12,
  },
  statusBar: {
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

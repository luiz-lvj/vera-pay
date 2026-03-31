export const VERA_PAY_ADDRESS = "0x0944830916CECb637613c9Fd0e8F6C21ccFFB4eF";
export const TEST_USDC_ADDRESS = "0x9C080703256BDF9Ea1b485aE72f13E31f74C558b";

export const FLOW_TESTNET = {
  chainId: 545,
  chainIdHex: "0x221",
  rpcUrl: "https://testnet.evm.nodes.onflow.org",
  blockExplorer: "https://evm-testnet.flowscan.io",
  name: "Flow EVM Testnet",
  currency: { name: "FLOW", symbol: "FLOW", decimals: 18 },
};

export const VERA_PAY_ABI = [
  "function createPlan(address _paymentToken, uint256 _amount, uint256 _interval, string _name, string _metadataURI) returns (uint256 planId)",
  "function togglePlan(uint256 _planId)",
  "function subscribe(uint256 _planId) returns (uint256 subId)",
  "function cancelSubscription(uint256 _subId)",
  "function processPayment(uint256 _subId)",
  "function batchProcessPayments(uint256[] _subIds)",
  "function getPlan(uint256 _planId) view returns (tuple(address merchant, address paymentToken, uint256 amount, uint256 interval, string name, string metadataURI, bool active))",
  "function getSubscription(uint256 _subId) view returns (tuple(uint256 planId, address subscriber, uint256 startTime, uint256 lastPaymentTime, uint256 paymentsCount, bool active))",
  "function getMerchantPlans(address _merchant) view returns (uint256[])",
  "function getSubscriberSubscriptions(address _subscriber) view returns (uint256[])",
  "function isPaymentDue(uint256 _subId) view returns (bool)",
  "function getDuePayments(uint256[] _subIds) view returns (uint256[] due)",
  "function nextPlanId() view returns (uint256)",
  "function nextSubscriptionId() view returns (uint256)",
  "function protocolFeeBps() view returns (uint256)",
  "function activeSub(uint256 planId, address subscriber) view returns (uint256 subId)",
  "event PlanCreated(uint256 indexed planId, address indexed merchant, address paymentToken, uint256 amount, uint256 interval, string name, string metadataURI)",
  "event Subscribed(uint256 indexed subscriptionId, uint256 indexed planId, address indexed subscriber)",
  "event PaymentProcessed(uint256 indexed subscriptionId, uint256 indexed planId, address indexed subscriber, address merchant, uint256 amount, uint256 protocolFee, uint256 timestamp)",
  "event SubscriptionCancelled(uint256 indexed subscriptionId, address indexed subscriber)",
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function mint(address to, uint256 amount)",
];

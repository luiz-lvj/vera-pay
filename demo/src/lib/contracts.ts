import { DEPLOYED_CONTRACTS, KNOWN_TOKENS, NETWORKS } from "@vera-pay/sdk";

export const VERA_PAY_ADDRESS = DEPLOYED_CONTRACTS["flow-testnet"];
export const TEST_USDC_ADDRESS = KNOWN_TOKENS["flow-testnet"].USDC;

const network = NETWORKS["flow-testnet"];

export const FLOW_TESTNET = {
  chainId: network.chainId,
  chainIdHex: "0x" + network.chainId.toString(16),
  rpcUrl: network.rpcUrl,
  blockExplorer: network.blockExplorer,
  evmBlockExplorer: network.evmBlockExplorer,
  name: network.name,
  currency: { name: "FLOW", symbol: "FLOW", decimals: 18 },
};

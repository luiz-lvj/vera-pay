import type { NetworkConfig, NetworkName } from "./types";

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  "flow-testnet": {
    chainId: 545,
    rpcUrl: "https://testnet.evm.nodes.onflow.org",
    blockExplorer: "https://testnet.explorer.flow.com",
    evmBlockExplorer: "https://testnet.evm.flow.com",
    name: "Flow EVM Testnet",
  },
  "flow-mainnet": {
    chainId: 747,
    rpcUrl: "https://mainnet.evm.nodes.onflow.org",
    blockExplorer: "https://explorer.flow.com",
    evmBlockExplorer: "https://evm.flow.com",
    name: "Flow EVM Mainnet",
  },
};

export const DEPLOYED_CONTRACTS: Record<string, string> = {
  "flow-testnet": "0x24730C8387C11e6031f692Bf0B14000D93271766",
};

export const KNOWN_TOKENS: Record<string, Record<string, string>> = {
  "flow-testnet": {
    USDC: "0x9C080703256BDF9Ea1b485aE72f13E31f74C558b",
    "USDC.e": "0x9B7550D337bB449b89C6f9C926C3b976b6f4095b",
  },
  "flow-mainnet": {
    USDT: "0x674843C06FF83502ddb4D37c2E09C01cdA38cbc8",
  },
};

export const CADENCE_HANDLERS: Record<string, string> = {
  "flow-testnet": "7c0bf27829276c6b",
};

export const DEFAULT_IPFS_GATEWAY = "https://storacha.link/ipfs";

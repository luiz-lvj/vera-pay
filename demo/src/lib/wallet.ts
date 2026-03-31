import { ethers } from "ethers";
import { FLOW_TESTNET } from "./contracts";

export async function connectWallet(): Promise<{ address: string; provider: ethers.BrowserProvider; signer: ethers.JsonRpcSigner }> {
  if (!window.ethereum) {
    throw new Error("No wallet found. Please install MetaMask.");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const accounts = (await provider.send("eth_requestAccounts", [])) as string[];

  if (accounts.length === 0) throw new Error("No accounts returned");

  await switchToFlowTestnet();

  const signer = await provider.getSigner();
  return { address: accounts[0], provider, signer };
}

export async function switchToFlowTestnet(): Promise<void> {
  if (!window.ethereum) return;

  const currentChainId = await window.ethereum.request({ method: "eth_chainId" }) as string;

  if (parseInt(currentChainId, 16) === FLOW_TESTNET.chainId) return;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: FLOW_TESTNET.chainIdHex }],
    });
  } catch (err: unknown) {
    const switchErr = err as { code?: number };
    if (switchErr.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: FLOW_TESTNET.chainIdHex,
          chainName: FLOW_TESTNET.name,
          rpcUrls: [FLOW_TESTNET.rpcUrl],
          blockExplorerUrls: [FLOW_TESTNET.evmBlockExplorer],
          nativeCurrency: FLOW_TESTNET.currency,
        }],
      });
    } else {
      throw err;
    }
  }
}

export function onAccountsChanged(cb: (accounts: string[]) => void): () => void {
  if (!window.ethereum) return () => {};
  const handler = (...args: unknown[]) => cb(args[0] as string[]);
  window.ethereum.on("accountsChanged", handler);
  return () => window.ethereum?.removeListener("accountsChanged", handler);
}

export function onChainChanged(cb: () => void): () => void {
  if (!window.ethereum) return () => {};
  window.ethereum.on("chainChanged", cb);
  return () => window.ethereum?.removeListener("chainChanged", cb);
}

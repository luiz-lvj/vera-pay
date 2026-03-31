import type { PaymentReceipt } from "./types";
import { DEFAULT_IPFS_GATEWAY } from "./constants";

export interface IPFSAdapter {
  uploadJson(data: unknown): Promise<string>;
  fetchJson<T = unknown>(cid: string): Promise<T>;
}

/**
 * Minimal adapter that talks to a Kubo-compatible IPFS HTTP API
 * (e.g. `http://localhost:5001`).
 */
export function createKuboAdapter(apiUrl: string): IPFSAdapter {
  return {
    async uploadJson(data: unknown): Promise<string> {
      const blob = new Blob([JSON.stringify(data)], {
        type: "application/json",
      });
      const form = new FormData();
      form.append("file", blob, "receipt.json");

      const res = await fetch(`${apiUrl}/api/v0/add?pin=true`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) throw new Error(`IPFS upload failed: ${res.statusText}`);
      const result = (await res.json()) as { Hash: string };
      return result.Hash;
    },

    async fetchJson<T = unknown>(cid: string): Promise<T> {
      const res = await fetch(`${DEFAULT_IPFS_GATEWAY}/${cid}`);
      if (!res.ok) throw new Error(`IPFS fetch failed: ${res.statusText}`);
      return res.json() as Promise<T>;
    },
  };
}

export interface StorachaConfig {
  key: string;
  proof: string;
}

/**
 * Creates an IPFS adapter backed by Storacha (formerly web3.storage).
 *
 * Accepts either a pre-built client (anything with `uploadFile`) or a
 * `{ key, proof }` config. When config is provided, the Storacha client
 * is lazily initialized on first upload using a memory store + Ed25519
 * principal — no interactive auth or email prompts.
 *
 * Setup (one-time, via Storacha CLI):
 * ```bash
 * storacha key create --json          # → { "did": "...", "key": "MgCa..." }
 * storacha delegation create <did> \
 *   -c space/blob/add -c space/index/add \
 *   -c filecoin/offer -c upload/add --base64   # → mAYIEAP8...
 * ```
 *
 * Usage:
 * ```ts
 * import { createStorachaAdapter } from "@verapay/sdk";
 *
 * const ipfs = createStorachaAdapter({
 *   key: process.env.STORACHA_KEY!,
 *   proof: process.env.STORACHA_PROOF!,
 * });
 * ```
 */
export function createStorachaAdapter(
  clientOrConfig:
    | { uploadFile: (file: Blob) => Promise<{ toString(): string }> }
    | StorachaConfig,
): IPFSAdapter {
  type UploadClient = { uploadFile: (file: Blob) => Promise<{ toString(): string }> };
  let resolvedClient: UploadClient | null = null;
  let initPromise: Promise<UploadClient> | null = null;

  async function getClient(): Promise<UploadClient> {
    if (resolvedClient) return resolvedClient;

    if ("uploadFile" in clientOrConfig) {
      resolvedClient = clientOrConfig;
      return resolvedClient;
    }

    if (!initPromise) {
      initPromise = (async () => {
        const { key, proof } = clientOrConfig;
        const Client = await import("@storacha/client");
        const ed25519 = await import("@storacha/client/principal/ed25519");
        const { StoreMemory } = await import("@storacha/client/stores/memory");
        const Proof = await import("@storacha/client/proof");

        const principal = ed25519.parse(key);
        const client = await Client.create({ principal, store: new StoreMemory() });
        const space = await client.addSpace(await Proof.parse(proof));
        await client.setCurrentSpace(space.did());
        resolvedClient = client;
        return client;
      })();
    }

    return initPromise;
  }

  return {
    async uploadJson(data: unknown): Promise<string> {
      const client = await getClient();
      if (!client) throw new Error("Storacha client failed to initialize");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const cid = await client.uploadFile(blob);
      return cid.toString();
    },

    async fetchJson<T = unknown>(cid: string): Promise<T> {
      const res = await fetch(`${DEFAULT_IPFS_GATEWAY}/${cid}`);
      if (!res.ok) throw new Error(`IPFS fetch failed: ${res.statusText}`);
      return res.json() as Promise<T>;
    },
  };
}

/**
 * In-memory adapter useful for tests and demos where no real IPFS node is available.
 */
export function createMemoryAdapter(): IPFSAdapter {
  const store = new Map<string, string>();
  let counter = 0;

  return {
    async uploadJson(data: unknown): Promise<string> {
      const json = JSON.stringify(data);
      const cid = `mem_${++counter}_${Date.now()}`;
      store.set(cid, json);
      return cid;
    },

    async fetchJson<T = unknown>(cid: string): Promise<T> {
      const json = store.get(cid);
      if (!json) throw new Error(`CID not found in memory store: ${cid}`);
      return JSON.parse(json) as T;
    },
  };
}

export function buildPaymentReceipt(
  event: {
    subscriptionId: bigint;
    planId: bigint;
    subscriber: string;
    merchant: string;
    amount: bigint;
    protocolFee: bigint;
    timestamp: bigint;
  },
  txHash: string,
  blockNumber: number,
  chainId: number,
): PaymentReceipt {
  return {
    subscriptionId: event.subscriptionId.toString(),
    planId: event.planId.toString(),
    subscriber: event.subscriber,
    merchant: event.merchant,
    amount: event.amount.toString(),
    protocolFee: event.protocolFee.toString(),
    timestamp: Number(event.timestamp),
    txHash,
    blockNumber,
    chainId,
  };
}

export function ipfsGatewayUrl(cid: string): string {
  return `${DEFAULT_IPFS_GATEWAY}/${cid}`;
}

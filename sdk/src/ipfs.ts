import type { PaymentReceipt } from "./types";
import { DEFAULT_IPFS_GATEWAY } from "./constants";

/**
 * IPFS storage adapter for VeraPay payment receipts.
 *
 * By default uses the built-in JSON-over-fetch approach that works with any
 * IPFS HTTP API (Kubo, Pinata, web3.storage gateway, etc.).
 *
 * For production, integrators can provide their own `uploadJson` / `fetchJson`
 * implementations backed by @web3-storage/w3up-client, Pinata SDK, etc.
 */
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

/**
 * Adapter that uses the w3up-client from Protocol Labs / web3.storage.
 *
 * Integrators call `createW3upAdapter` with an already-authenticated client
 * instance so that key management stays in their control.
 *
 * Usage:
 * ```ts
 * import { create } from "@web3-storage/w3up-client";
 * import { createW3upAdapter } from "@verapay/sdk";
 *
 * const w3 = await create();
 * // ... authenticate & set space ...
 * const adapter = createW3upAdapter(w3);
 * ```
 */
export function createW3upAdapter(client: {
  uploadFile: (file: Blob) => Promise<{ toString(): string }>;
}): IPFSAdapter {
  return {
    async uploadJson(data: unknown): Promise<string> {
      const blob = new Blob([JSON.stringify(data)], {
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

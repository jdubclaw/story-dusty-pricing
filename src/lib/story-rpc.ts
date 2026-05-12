import { BlockMetric, normalizeRpcBlock, RpcBlock } from "./gas-pricing";

export const STORY_MAINNET_RPC_URL = "https://mainnet.storyrpc.io";
export const STORY_MAINNET_CHAIN_ID = 1514;

type JsonRpcSuccess<T> = {
  jsonrpc: "2.0";
  id: number;
  result: T;
};

type JsonRpcFailure = {
  jsonrpc: "2.0";
  id: number;
  error: { code: number; message: string };
};

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure;

function toBlockTag(blockNumber: bigint): string {
  return `0x${blockNumber.toString(16)}`;
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}: ${response.statusText}`);
  }

  const payload = (await response.json()) as JsonRpcResponse<T>;
  if ("error" in payload) {
    throw new Error(`RPC ${payload.error.code}: ${payload.error.message}`);
  }

  return payload.result;
}

export async function fetchRecentBlocks(rpcUrl: string, count: number): Promise<BlockMetric[]> {
  const latestHex = await rpc<string>(rpcUrl, "eth_blockNumber", []);
  const latest = BigInt(latestHex);
  const safeCount = Math.max(1, Math.min(96, Math.floor(count)));
  const first = latest - BigInt(safeCount - 1) > 0n ? latest - BigInt(safeCount - 1) : 0n;

  const blocks = await Promise.all(
    Array.from({ length: Number(latest - first + 1n) }, async (_, index) => {
      const number = first + BigInt(index);
      return rpc<RpcBlock | null>(rpcUrl, "eth_getBlockByNumber", [toBlockTag(number), true]);
    }),
  );

  return blocks.filter((block): block is RpcBlock => block !== null).map(normalizeRpcBlock);
}

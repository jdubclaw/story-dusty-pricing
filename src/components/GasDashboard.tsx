"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BlockMetric,
  DEFAULT_LOW_UTILIZATION_GAS_PRICE,
  formatDusty,
  formatGweiLike,
  formatPercent,
  summarizeBlocks,
} from "@/lib/gas-pricing";
import { fetchRecentBlocks, STORY_MAINNET_RPC_URL } from "@/lib/story-rpc";

const SAMPLE_BLOCKS = 24;

function parseOptionalBigInt(value: string): bigint | undefined {
  const trimmed = value.trim().replaceAll(",", "");
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return undefined;
  return BigInt(trimmed);
}

function Metric({ label, value, subvalue }: { label: string; value: string; subvalue?: string }) {
  return (
    <div className="border border-zinc-200 bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-zinc-950">{value}</div>
      {subvalue ? <div className="mt-1 font-mono text-sm text-zinc-500">{subvalue}</div> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-zinc-200 py-3 text-sm last:border-b-0">
      <div className="text-zinc-500">{label}</div>
      <div className="font-mono text-zinc-950">{value}</div>
    </div>
  );
}

export function GasDashboard() {
  const [rpcUrl, setRpcUrl] = useState(STORY_MAINNET_RPC_URL);
  const [maxGasPerBlockInput, setMaxGasPerBlockInput] = useState("");
  const [manualGasPriceInput, setManualGasPriceInput] = useState(DEFAULT_LOW_UTILIZATION_GAS_PRICE.toString());
  const [blocks, setBlocks] = useState<BlockMetric[]>([]);
  const [status, setStatus] = useState("Loading");
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const maxGasPerBlock = useMemo(() => parseOptionalBigInt(maxGasPerBlockInput), [maxGasPerBlockInput]);
  const manualGasPrice = useMemo(
    () => parseOptionalBigInt(manualGasPriceInput) ?? DEFAULT_LOW_UTILIZATION_GAS_PRICE,
    [manualGasPriceInput],
  );
  const summary = useMemo(
    () => summarizeBlocks(blocks, maxGasPerBlock, { manualLowUtilizationGasPrice: manualGasPrice }),
    [blocks, manualGasPrice, maxGasPerBlock],
  );

  const loadBlocks = useCallback(async () => {
    try {
      const nextBlocks = await fetchRecentBlocks(rpcUrl.trim(), SAMPLE_BLOCKS);
      setBlocks(nextBlocks);
      setUpdatedAt(new Date());
      setError(null);
      setStatus("Live");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown RPC error");
      setStatus("RPC error");
    }
  }, [rpcUrl]);

  useEffect(() => {
    const initialId = window.setTimeout(() => void loadBlocks(), 0);
    const refreshId = window.setInterval(() => void loadBlocks(), 12_000);
    return () => {
      window.clearTimeout(initialId);
      window.clearInterval(refreshId);
    };
  }, [loadBlocks]);

  const latestBlockRows = [...blocks].reverse().slice(0, 6);
  const recommendationSource = summary?.spamFilterMode === "manual-low-utilization" ? "manual floor" : "observed median";

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <header className="border border-zinc-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Story gas price monitor</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Predicted gas price</h1>
            </div>
            <div className="text-right font-mono text-sm text-zinc-500">
              <div>{status}</div>
              <div>{updatedAt ? updatedAt.toLocaleTimeString() : "--"}</div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="border border-zinc-200 bg-white p-6">
            {summary ? (
              <>
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">recommended</div>
                <div className="mt-3 font-mono text-5xl font-semibold tracking-tight text-zinc-950 sm:text-7xl">
                  {formatGweiLike(summary.spamFilteredGasPrice)}
                </div>
                <div className="mt-3 font-mono text-base text-zinc-500">
                  {formatDusty(summary.spamFilteredGasPrice)} dusty / gas
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <Metric label="latest block" value={`#${summary.latestNumber.toLocaleString()}`} />
                  <Metric label="utilization" value={formatPercent(summary.latestUtilization)} />
                  <Metric label="source" value={recommendationSource} />
                </div>
              </>
            ) : (
              <div className="font-mono text-zinc-500">Waiting for latest block data...</div>
            )}
          </div>

          <div className="border border-zinc-200 bg-white p-5">
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500" htmlFor="rpc-url">
              RPC endpoint
            </label>
            <input
              id="rpc-url"
              className="mt-2 w-full border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-zinc-950"
              value={rpcUrl}
              onChange={(event) => setRpcUrl(event.target.value)}
            />

            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Manual low-use price, dusty / gas
              <input
                className="mt-2 w-full border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-zinc-950"
                inputMode="numeric"
                value={manualGasPriceInput}
                onChange={(event) => setManualGasPriceInput(event.target.value)}
              />
            </label>

            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Max gas / block override
              <input
                className="mt-2 w-full border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-zinc-950"
                placeholder="blank = RPC gasLimit"
                inputMode="numeric"
                value={maxGasPerBlockInput}
                onChange={(event) => setMaxGasPerBlockInput(event.target.value)}
              />
            </label>

            <button className="mt-4 w-full border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800" onClick={() => void loadBlocks()}>
              Refresh
            </button>
            {error ? <div className="mt-4 border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs text-zinc-800">{error}</div> : null}
          </div>
        </section>

        {summary ? (
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Metric label="observed latest" value={formatGweiLike(summary.latestObservedGasPrice)} subvalue={`${formatDusty(summary.latestObservedGasPrice)} dusty`} />
            <Metric label="gas used" value={formatDusty(summary.latestGasUsed)} subvalue={`/ ${formatDusty(maxGasPerBlock ?? summary.latestGasLimit)}`} />
            <Metric label="high-use blocks" value={formatPercent(summary.highUtilizationBlockRatio)} subvalue={`last ${blocks.length} blocks`} />
            <Metric label="avg utilization" value={formatPercent(summary.averageUtilization)} />
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="border border-zinc-200 bg-white p-5">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">latest blocks</div>
            {latestBlockRows.map((block) => (
              <div key={block.number} className="grid grid-cols-2 gap-2 border-b border-zinc-200 py-3 font-mono text-sm last:border-b-0 sm:grid-cols-4">
                <div>#{block.number.toLocaleString()}</div>
                <div>{formatGweiLike(block.observedGasPrice)}</div>
                <div>{formatPercent(block.utilization)}</div>
                <div className="truncate text-zinc-500">{block.hash ?? "--"}</div>
              </div>
            ))}
          </div>

          <div className="border border-zinc-200 bg-white p-5">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">units</div>
            <Row label="dusty" value="smallest gas price unit" />
            <Row label="1 gwei" value="1,000,000,000 dusty" />
            <Row label="0.0001 gwei" value="100,000 dusty" />
            <Row label="sample window" value={`${SAMPLE_BLOCKS} blocks`} />
            <Row label="trust observed if" value=">=60% blocks over 50% full" />
          </div>
        </section>
      </section>
    </main>
  );
}

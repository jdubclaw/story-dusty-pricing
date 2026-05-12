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

function parseOptionalBigInt(value: string): bigint | undefined {
  const trimmed = value.trim().replaceAll(",", "");
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return undefined;
  return BigInt(trimmed);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">{label}</p>
      <p className="mt-3 break-words text-2xl font-bold text-white">{value}</p>
      {hint ? <p className="mt-2 text-sm text-slate-300">{hint}</p> : null}
    </div>
  );
}

function SparkBars({ blocks }: { blocks: BlockMetric[] }) {
  const maxFee = blocks.reduce((max, block) => (block.observedGasPrice > max ? block.observedGasPrice : max), 1n);

  return (
    <div className="flex h-36 items-end gap-1 rounded-3xl border border-cyan-300/10 bg-slate-950/60 p-4">
      {blocks.map((block) => {
        const feeHeight = Number((block.observedGasPrice * 100n) / maxFee);
        const utilHeight = Math.max(3, Math.round(block.utilization * 100));
        return (
          <div key={block.number} className="flex min-w-1 flex-1 flex-col items-center justify-end gap-1" title={`#${block.number}: ${formatGweiLike(block.observedGasPrice)} · ${formatPercent(block.utilization)}`}>
            <div className="w-full rounded-t bg-fuchsia-400/80" style={{ height: `${Math.max(3, feeHeight)}%` }} />
            <div className="w-full rounded-t bg-cyan-300/80" style={{ height: `${utilHeight}%`, maxHeight: "42%" }} />
          </div>
        );
      })}
    </div>
  );
}

export function GasDashboard() {
  const [rpcUrl, setRpcUrl] = useState(STORY_MAINNET_RPC_URL);
  const [blockCount, setBlockCount] = useState(24);
  const [maxGasPerBlockInput, setMaxGasPerBlockInput] = useState("");
  const [manualGasPriceInput, setManualGasPriceInput] = useState(DEFAULT_LOW_UTILIZATION_GAS_PRICE.toString());
  const [blocks, setBlocks] = useState<BlockMetric[]>([]);
  const [status, setStatus] = useState("Ready");
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
      const nextBlocks = await fetchRecentBlocks(rpcUrl.trim(), blockCount);
      setBlocks(nextBlocks);
      setUpdatedAt(new Date());
      setError(null);
      setStatus(`Tracking ${nextBlocks.length} recent blocks`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown RPC error");
      setStatus("RPC fetch failed");
    }
  }, [blockCount, rpcUrl]);

  useEffect(() => {
    const initialId = window.setTimeout(() => void loadBlocks(), 0);
    const refreshId = window.setInterval(() => void loadBlocks(), 12_000);
    return () => {
      window.clearTimeout(initialId);
      window.clearInterval(refreshId);
    };
  }, [loadBlocks]);

  const latestBlockRows = [...blocks].reverse().slice(0, 8);

  return (
    <main className="min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.24),_transparent_34%),radial-gradient(circle_at_80%_20%,_rgba(217,70,239,0.2),_transparent_30%),linear-gradient(145deg,_#050816_0%,_#111827_45%,_#220a36_100%)]" />
      <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-12">
        <header className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <div className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100">
              Story mainnet · EIP-1559-style blockspace monitor
            </div>
            <h1 className="mt-6 max-w-4xl text-5xl font-black tracking-tight text-white sm:text-7xl">
              Dusty pricing for Story block space, live.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              A fully front-end Next.js dashboard that reads recent blocks from an EVM RPC, measures utilization, filters low-utilization 1 gwei spam, and only trusts observed gas prices when blockspace demand is sustained.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur">
            <label className="text-sm font-semibold text-cyan-100" htmlFor="rpc-url">RPC endpoint</label>
            <input
              id="rpc-url"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none ring-cyan-300/40 transition focus:ring-4"
              value={rpcUrl}
              onChange={(event) => setRpcUrl(event.target.value)}
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-cyan-100">
                Blocks: {blockCount}
                <input
                  className="mt-3 w-full accent-cyan-300"
                  type="range"
                  min="6"
                  max="72"
                  value={blockCount}
                  onChange={(event) => setBlockCount(Number(event.target.value))}
                />
              </label>
              <label className="text-sm font-semibold text-cyan-100">
                Story max gas / block override
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none ring-cyan-300/40 transition focus:ring-4"
                  placeholder="blank = RPC gasLimit"
                  inputMode="numeric"
                  value={maxGasPerBlockInput}
                  onChange={(event) => setMaxGasPerBlockInput(event.target.value)}
                />
              </label>
              <label className="text-sm font-semibold text-cyan-100 sm:col-span-2">
                Manual low-utilization gas price, dusty / gas
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none ring-cyan-300/40 transition focus:ring-4"
                  inputMode="numeric"
                  value={manualGasPriceInput}
                  onChange={(event) => setManualGasPriceInput(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200" onClick={() => void loadBlocks()}>
                Refresh now
              </button>
              <span className="text-sm text-slate-300">{status}</span>
              {updatedAt ? <span className="text-sm text-slate-400">Updated {updatedAt.toLocaleTimeString()}</span> : null}
            </div>
            {error ? <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}
          </div>
        </header>

        {summary ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Recommended gas price" value={formatGweiLike(summary.spamFilteredGasPrice)} hint={`${formatDusty(summary.spamFilteredGasPrice)} dusty / gas · ${summary.spamFilterMode === "manual-low-utilization" ? "spam filter active" : "observed price trusted"}`} />
              <StatCard label="Observed latest gas price" value={formatGweiLike(summary.latestObservedGasPrice)} hint="Median tx gas price in latest block" />
              <StatCard label="Latest utilization" value={formatPercent(summary.latestUtilization)} hint={`${formatDusty(summary.latestGasUsed)} / ${formatDusty(maxGasPerBlock ?? summary.latestGasLimit)} gas`} />
              <StatCard label="Sustained demand signal" value={formatPercent(summary.highUtilizationBlockRatio)} hint="Blocks over 50% utilization in this window" />
            </section>

            <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold">Recent block trend</h2>
                    <p className="text-sm text-slate-300">Fuchsia = observed gas price, cyan = gas utilization.</p>
                  </div>
                  <p className="text-sm text-slate-400">Latest #{summary.latestNumber.toLocaleString()}</p>
                </div>
                <SparkBars blocks={blocks} />
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
                <h2 className="text-2xl font-bold">Spam filter</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  One 1 gwei spam transaction in an otherwise empty block should not define the market price. The dashboard recommends the manual low-utilization price until at least 60% of the sampled blocks are above 50% utilization; only then does it trust the observed median transaction gas price.
                </p>
                <code className="mt-4 block rounded-2xl bg-slate-950/80 p-4 text-xs leading-6 text-cyan-100">
                  if sustainedUtilization &lt; 60% → use manual low price; else → use observed median gas price
                </code>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
              <h2 className="text-2xl font-bold">Latest blocks</h2>
              <div className="mt-4 grid gap-3">
                {latestBlockRows.map((block) => (
                  <div key={block.number} className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm md:grid-cols-4">
                    <span className="font-semibold text-white">#{block.number.toLocaleString()}</span>
                    <span className="text-slate-300">{formatGweiLike(block.observedGasPrice)} observed</span>
                    <span className="text-slate-300">{formatPercent(block.utilization)} full</span>
                    <span className="truncate text-slate-500">{block.hash ?? "pending hash"}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 text-slate-300">Waiting for block data…</div>
        )}
      </section>
    </main>
  );
}

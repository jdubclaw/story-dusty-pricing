export type RpcTransaction = {
  gasPrice?: string | null;
  maxFeePerGas?: string | null;
};

export type RpcBlock = {
  number: string;
  timestamp: string;
  gasUsed: string;
  gasLimit: string;
  baseFeePerGas?: string | null;
  hash?: string | null;
  transactions?: Array<string | RpcTransaction>;
};

export type BlockMetric = {
  number: number;
  timestamp: number;
  gasUsed: bigint;
  gasLimit: bigint;
  baseFeePerGas: bigint;
  observedGasPrice: bigint;
  utilization: number;
  hash?: string | null;
};

export type BaseFeeInput = {
  parentBaseFeePerGas: bigint;
  parentGasUsed: bigint;
  parentGasLimit: bigint;
  maxGasPerBlock?: bigint;
};

export type BlockSummary = {
  latestNumber: number;
  latestTimestamp: number;
  latestGasUsed: bigint;
  latestGasLimit: bigint;
  latestBaseFeePerGas: bigint;
  latestObservedGasPrice: bigint;
  latestUtilization: number;
  averageUtilization: number;
  averageBaseFeePerGas: bigint;
  projectedNextBaseFeePerGas: bigint;
  spamFilteredGasPrice: bigint;
  spamFilterMode: SpamFilterMode;
  highUtilizationBlockRatio: number;
  isSustainedHighUtilization: boolean;
};

export type SpamFilterMode = "manual-low-utilization" | "observed-sustained-utilization";

export type SpamFilterOptions = {
  manualLowUtilizationGasPrice?: bigint;
  highUtilizationThreshold?: number;
  sustainedHighUtilizationRatio?: number;
};

const BASE_FEE_MAX_CHANGE_DENOMINATOR = 8n;
const ELASTICITY_MULTIPLIER = 2n;
export const DEFAULT_LOW_UTILIZATION_GAS_PRICE = 100_000n; // 0.0001 Gdusty / gas.
const DEFAULT_HIGH_UTILIZATION_THRESHOLD = 0.5;
const DEFAULT_SUSTAINED_HIGH_UTILIZATION_RATIO = 0.6;

export function parseHexQuantity(value: string | null | undefined): bigint {
  if (!value) return 0n;
  return BigInt(value);
}

export function calculateNextBaseFeePerGas({
  parentBaseFeePerGas,
  parentGasUsed,
  parentGasLimit,
  maxGasPerBlock,
}: BaseFeeInput): bigint {
  const effectiveGasLimit = maxGasPerBlock && maxGasPerBlock > 0n ? maxGasPerBlock : parentGasLimit;
  const parentGasTarget = effectiveGasLimit / ELASTICITY_MULTIPLIER;

  if (parentGasTarget === 0n || parentGasUsed === parentGasTarget) {
    return parentBaseFeePerGas;
  }

  if (parentGasUsed > parentGasTarget) {
    const gasUsedDelta = parentGasUsed - parentGasTarget;
    const baseFeeDelta =
      (parentBaseFeePerGas * gasUsedDelta) /
      parentGasTarget /
      BASE_FEE_MAX_CHANGE_DENOMINATOR;
    return parentBaseFeePerGas + (baseFeeDelta > 0n ? baseFeeDelta : 1n);
  }

  const gasUsedDelta = parentGasTarget - parentGasUsed;
  const baseFeeDelta =
    (parentBaseFeePerGas * gasUsedDelta) /
    parentGasTarget /
    BASE_FEE_MAX_CHANGE_DENOMINATOR;
  return parentBaseFeePerGas > baseFeeDelta ? parentBaseFeePerGas - baseFeeDelta : 0n;
}

function medianBigInt(values: bigint[]): bigint {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor(sorted.length / 2)];
}

function getTransactionGasPrices(block: RpcBlock): bigint[] {
  return (block.transactions ?? [])
    .filter((transaction): transaction is RpcTransaction => typeof transaction === "object" && transaction !== null)
    .map((transaction) => parseHexQuantity(transaction.gasPrice ?? transaction.maxFeePerGas))
    .filter((gasPrice) => gasPrice > 0n);
}

export function normalizeRpcBlock(block: RpcBlock): BlockMetric {
  const gasUsed = parseHexQuantity(block.gasUsed);
  const gasLimit = parseHexQuantity(block.gasLimit);
  const baseFeePerGas = parseHexQuantity(block.baseFeePerGas);
  const transactionGasPrice = medianBigInt(getTransactionGasPrices(block));

  return {
    number: Number(parseHexQuantity(block.number)),
    timestamp: Number(parseHexQuantity(block.timestamp)),
    gasUsed,
    gasLimit,
    baseFeePerGas,
    observedGasPrice: transactionGasPrice > 0n ? transactionGasPrice : baseFeePerGas,
    utilization: gasLimit === 0n ? 0 : Number(gasUsed) / Number(gasLimit),
    hash: block.hash,
  };
}

export function estimateSpamFilteredGasPrice(
  blocks: BlockMetric[],
  options: SpamFilterOptions = {},
): {
  gasPrice: bigint;
  mode: SpamFilterMode;
  highUtilizationBlockRatio: number;
  isSustainedHighUtilization: boolean;
} {
  if (blocks.length === 0) {
    return {
      gasPrice: options.manualLowUtilizationGasPrice ?? DEFAULT_LOW_UTILIZATION_GAS_PRICE,
      mode: "manual-low-utilization",
      highUtilizationBlockRatio: 0,
      isSustainedHighUtilization: false,
    };
  }

  const highUtilizationThreshold = options.highUtilizationThreshold ?? DEFAULT_HIGH_UTILIZATION_THRESHOLD;
  const sustainedHighUtilizationRatio =
    options.sustainedHighUtilizationRatio ?? DEFAULT_SUSTAINED_HIGH_UTILIZATION_RATIO;
  const highUtilizationBlocks = blocks.filter((block) => block.utilization >= highUtilizationThreshold).length;
  const highUtilizationBlockRatio = highUtilizationBlocks / blocks.length;
  const isSustainedHighUtilization = highUtilizationBlockRatio >= sustainedHighUtilizationRatio;

  if (!isSustainedHighUtilization) {
    return {
      gasPrice: options.manualLowUtilizationGasPrice ?? DEFAULT_LOW_UTILIZATION_GAS_PRICE,
      mode: "manual-low-utilization",
      highUtilizationBlockRatio,
      isSustainedHighUtilization,
    };
  }

  const observedPrices = blocks.map((block) => block.observedGasPrice || block.baseFeePerGas).filter((price) => price > 0n);

  return {
    gasPrice: medianBigInt(observedPrices),
    mode: "observed-sustained-utilization",
    highUtilizationBlockRatio,
    isSustainedHighUtilization,
  };
}

export function summarizeBlocks(
  blocks: BlockMetric[],
  maxGasPerBlock?: bigint,
  spamFilterOptions?: SpamFilterOptions,
): BlockSummary | null {
  if (blocks.length === 0) return null;

  const sortedBlocks = [...blocks].sort((a, b) => a.number - b.number);
  const latest = sortedBlocks.at(-1)!;
  const averageUtilization =
    sortedBlocks.reduce((total, block) => total + block.utilization, 0) / sortedBlocks.length;
  const averageBaseFeePerGas =
    sortedBlocks.reduce((total, block) => total + block.baseFeePerGas, 0n) / BigInt(sortedBlocks.length);
  const spamFilter = estimateSpamFilteredGasPrice(sortedBlocks, spamFilterOptions);

  return {
    latestNumber: latest.number,
    latestTimestamp: latest.timestamp,
    latestGasUsed: latest.gasUsed,
    latestGasLimit: latest.gasLimit,
    latestBaseFeePerGas: latest.baseFeePerGas,
    latestObservedGasPrice: latest.observedGasPrice,
    latestUtilization: latest.utilization,
    averageUtilization,
    averageBaseFeePerGas,
    projectedNextBaseFeePerGas: calculateNextBaseFeePerGas({
      parentBaseFeePerGas: latest.baseFeePerGas,
      parentGasUsed: latest.gasUsed,
      parentGasLimit: latest.gasLimit,
      maxGasPerBlock,
    }),
    spamFilteredGasPrice: spamFilter.gasPrice,
    spamFilterMode: spamFilter.mode,
    highUtilizationBlockRatio: spamFilter.highUtilizationBlockRatio,
    isSustainedHighUtilization: spamFilter.isSustainedHighUtilization,
  };
}

export function formatDusty(value: bigint): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatGweiLike(value: bigint): string {
  if (value < 1_000_000_000n) {
    return `${formatDusty(value)} dusty`;
  }

  return `${(Number(value) / 1_000_000_000).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  })} Gdusty`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

export type RpcBlock = {
  number: string;
  timestamp: string;
  gasUsed: string;
  gasLimit: string;
  baseFeePerGas?: string | null;
  hash?: string | null;
};

export type BlockMetric = {
  number: number;
  timestamp: number;
  gasUsed: bigint;
  gasLimit: bigint;
  baseFeePerGas: bigint;
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
  latestUtilization: number;
  averageUtilization: number;
  averageBaseFeePerGas: bigint;
  projectedNextBaseFeePerGas: bigint;
};

const BASE_FEE_MAX_CHANGE_DENOMINATOR = 8n;
const ELASTICITY_MULTIPLIER = 2n;

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

export function normalizeRpcBlock(block: RpcBlock): BlockMetric {
  const gasUsed = parseHexQuantity(block.gasUsed);
  const gasLimit = parseHexQuantity(block.gasLimit);
  const baseFeePerGas = parseHexQuantity(block.baseFeePerGas);

  return {
    number: Number(parseHexQuantity(block.number)),
    timestamp: Number(parseHexQuantity(block.timestamp)),
    gasUsed,
    gasLimit,
    baseFeePerGas,
    utilization: gasLimit === 0n ? 0 : Number(gasUsed) / Number(gasLimit),
    hash: block.hash,
  };
}

export function summarizeBlocks(blocks: BlockMetric[], maxGasPerBlock?: bigint): BlockSummary | null {
  if (blocks.length === 0) return null;

  const sortedBlocks = [...blocks].sort((a, b) => a.number - b.number);
  const latest = sortedBlocks.at(-1)!;
  const averageUtilization =
    sortedBlocks.reduce((total, block) => total + block.utilization, 0) / sortedBlocks.length;
  const averageBaseFeePerGas =
    sortedBlocks.reduce((total, block) => total + block.baseFeePerGas, 0n) / BigInt(sortedBlocks.length);

  return {
    latestNumber: latest.number,
    latestTimestamp: latest.timestamp,
    latestGasUsed: latest.gasUsed,
    latestGasLimit: latest.gasLimit,
    latestBaseFeePerGas: latest.baseFeePerGas,
    latestUtilization: latest.utilization,
    averageUtilization,
    averageBaseFeePerGas,
    projectedNextBaseFeePerGas: calculateNextBaseFeePerGas({
      parentBaseFeePerGas: latest.baseFeePerGas,
      parentGasUsed: latest.gasUsed,
      parentGasLimit: latest.gasLimit,
      maxGasPerBlock,
    }),
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

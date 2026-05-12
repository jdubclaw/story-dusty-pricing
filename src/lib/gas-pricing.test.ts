import { describe, expect, it } from "vitest";
import {
  calculateNextBaseFeePerGas,
  DEFAULT_LOW_UTILIZATION_GAS_PRICE,
  estimateSpamFilteredGasPrice,
  formatDusty,
  normalizeRpcBlock,
  summarizeBlocks,
} from "./gas-pricing";

describe("calculateNextBaseFeePerGas", () => {
  it("keeps base fee unchanged when gas used equals target", () => {
    expect(
      calculateNextBaseFeePerGas({
        parentBaseFeePerGas: 100n,
        parentGasUsed: 50n,
        parentGasLimit: 100n,
      }),
    ).toBe(100n);
  });

  it("raises base fee by the Ethereum EIP-1559 delta when utilization is above target", () => {
    expect(
      calculateNextBaseFeePerGas({
        parentBaseFeePerGas: 1_000_000_000n,
        parentGasUsed: 80n,
        parentGasLimit: 100n,
      }),
    ).toBe(1_075_000_000n);
  });

  it("lowers base fee when utilization is below target", () => {
    expect(
      calculateNextBaseFeePerGas({
        parentBaseFeePerGas: 1_000_000_000n,
        parentGasUsed: 20n,
        parentGasLimit: 100n,
      }),
    ).toBe(925_000_000n);
  });

  it("uses a caller-provided lower max gas per block to model Story-specific block space", () => {
    expect(
      calculateNextBaseFeePerGas({
        parentBaseFeePerGas: 1_000_000_000n,
        parentGasUsed: 80n,
        parentGasLimit: 100n,
        maxGasPerBlock: 80n,
      }),
    ).toBe(1_125_000_000n);
  });
});

describe("normalizeRpcBlock", () => {
  it("converts hex RPC block fields into typed bigint metrics", () => {
    expect(
      normalizeRpcBlock({
        number: "0x10",
        timestamp: "0x65",
        gasUsed: "0x32",
        gasLimit: "0x64",
        baseFeePerGas: "0x3b9aca00",
        hash: "0xabc",
      }),
    ).toMatchObject({
      number: 16,
      timestamp: 101,
      gasUsed: 50n,
      gasLimit: 100n,
      baseFeePerGas: 1_000_000_000n,
      utilization: 0.5,
      hash: "0xabc",
    });
  });
});

describe("estimateSpamFilteredGasPrice", () => {
  it("returns a very low manual gas price when 1 gwei transactions appear in mostly empty blocks", () => {
    const blocks = Array.from({ length: 24 }, (_, index) => ({
      number: index + 1,
      timestamp: index + 1,
      gasUsed: 21_000n,
      gasLimit: 36_000_000n,
      baseFeePerGas: 1_000_000_000n,
      observedGasPrice: 1_000_000_000n,
      utilization: 21_000 / 36_000_000,
    }));

    expect(estimateSpamFilteredGasPrice(blocks)).toMatchObject({
      gasPrice: DEFAULT_LOW_UTILIZATION_GAS_PRICE,
      mode: "manual-low-utilization",
      isSustainedHighUtilization: false,
    });
  });

  it("trusts observed gas price when utilization is consistently high", () => {
    const blocks = Array.from({ length: 24 }, (_, index) => ({
      number: index + 1,
      timestamp: index + 1,
      gasUsed: 30_000_000n,
      gasLimit: 36_000_000n,
      baseFeePerGas: 1_000_000_000n,
      observedGasPrice: 1_000_000_000n,
      utilization: 30_000_000 / 36_000_000,
    }));

    expect(estimateSpamFilteredGasPrice(blocks)).toMatchObject({
      gasPrice: 1_000_000_000n,
      mode: "observed-sustained-utilization",
      isSustainedHighUtilization: true,
    });
  });
});

describe("summarizeBlocks", () => {
  it("returns latest, averages, an algorithmic next base fee estimate, and a spam-filtered gas price", () => {
    const blocks = [
      normalizeRpcBlock({ number: "0x1", timestamp: "0x1", gasUsed: "0x14", gasLimit: "0x64", baseFeePerGas: "0x3b9aca00" }),
      normalizeRpcBlock({ number: "0x2", timestamp: "0x2", gasUsed: "0x50", gasLimit: "0x64", baseFeePerGas: "0x3b9aca00" }),
    ];

    expect(summarizeBlocks(blocks)).toMatchObject({
      latestNumber: 2,
      averageUtilization: 0.5,
      averageBaseFeePerGas: 1_000_000_000n,
      projectedNextBaseFeePerGas: 1_075_000_000n,
      spamFilteredGasPrice: 100_000n,
    });
  });
});

describe("formatDusty", () => {
  it("formats integer dusty values with compact separators", () => {
    expect(formatDusty(1_234_567_890n)).toBe("1,234,567,890");
  });
});

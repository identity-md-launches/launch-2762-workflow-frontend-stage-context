import {
  decodeErrorResult,
  encodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  parseUnits,
  formatUnits,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import type { PoolKey } from "./config";
export const routerAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
  "error ExecutionFailed(uint256 commandIndex, bytes message)",
  "error WrappedError(address target, bytes4 selector, bytes reason, bytes details)",
  "error V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)",
  "error V4TooMuchRequested(uint256 maxAmountInRequested, uint256 amountRequested)",
]);
export const permitAbi = parseAbi([
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);
export const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
export const quoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)",
]);
export const poolParams =
  "(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)";
export function parseAmount(value: string, decimals: number) {
  if (
    !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ||
    value.split(".")[1]?.length > decimals
  )
    throw Error(`Enter a positive amount with at most ${decimals} decimals.`);
  const n = parseUnits(value, decimals);
  if (n <= 0n || n >= 2n ** 128n)
    throw Error("Enter a positive amount below the pool limit.");
  return n;
}
export function minimumOut(out: bigint, slippage: number) {
  if (!Number.isInteger(slippage) || slippage < 10 || slippage > 500)
    throw Error("Choose slippage between 0.1% and 5%.");
  return (out * BigInt(10000 - slippage)) / 10000n;
}
export function buildSwap(
  pool: PoolKey,
  input: Address,
  amount: bigint,
  minimum: bigint,
  extended = false,
) {
  if (
    input.toLowerCase() !== pool.currency0.toLowerCase() &&
    input.toLowerCase() !== pool.currency1.toLowerCase()
  )
    throw Error("Input currency does not belong to this pool.");
  const zeroForOne = input.toLowerCase() === pool.currency0.toLowerCase();
  const output = zeroForOne ? pool.currency1 : pool.currency0;
  const params0 = extended
    ? encodeAbiParameters(
        parseAbiParameters(
          `(${poolParams} poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, uint256 minHopPriceX36, bytes hookData)`,
        ),
        [
          {
            poolKey: pool,
            zeroForOne,
            amountIn: amount,
            amountOutMinimum: minimum,
            minHopPriceX36: 0n,
            hookData: "0x",
          },
        ],
      )
    : encodeAbiParameters(
        parseAbiParameters(
          `(${poolParams} poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData)`,
        ),
        [
          {
            poolKey: pool,
            zeroForOne,
            amountIn: amount,
            amountOutMinimum: minimum,
            hookData: "0x",
          },
        ],
      );
  const params = [
    params0,
    encodeAbiParameters(
      parseAbiParameters("address currency, uint256 amount"),
      [input, amount],
    ),
    encodeAbiParameters(
      parseAbiParameters("address currency, uint256 amount"),
      [output, minimum],
    ),
  ];
  return {
    commands: "0x10" as Hex,
    inputs: [
      encodeAbiParameters(parseAbiParameters("bytes actions, bytes[] params"), [
        "0x060c0f",
        params,
      ]),
    ],
    value: input.toLowerCase() === zeroAddress ? amount : 0n,
  };
}
export function amountLabel(n: bigint, decimals = 18, precision = 6) {
  const full = formatUnits(n, decimals);
  const [whole, fraction] = full.split(".");
  const f = fraction?.slice(0, precision).replace(/0+$/, "");
  if (n > 0n && whole === "0" && !f)
    return `<${formatUnits(10n ** BigInt(Math.max(0, decimals - precision)), decimals)}`;
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${f ? "." + f : ""}`;
}
export type LiveStatus = {
  state: "running" | "resting" | "stale" | "offline";
  observedAt?: string;
  rpm?: number;
};
export function parseLiveStatus(raw: unknown, now = Date.now()): LiveStatus {
  const d = raw as {
    schemaVersion?: number;
    measurement?: {
      freshness?: string;
      observedAt?: string;
      staleAfterSeconds?: number;
      rpmMilli?: number;
      coreStatus?: string;
    };
  };
  const m = d?.measurement;
  if (
    d?.schemaVersion !== 1 ||
    !m ||
    m.freshness === "offline" ||
    m.freshness === "unavailable"
  )
    return { state: "offline" };
  const t = Date.parse(m.observedAt ?? "");
  if (
    !Number.isFinite(t) ||
    now - t > (m.staleAfterSeconds ?? 120) * 1000 ||
    m.freshness !== "online" ||
    t > now + 30000
  )
    return { state: "stale", observedAt: m.observedAt };
  if (
    typeof m.rpmMilli !== "number" ||
    !Number.isFinite(m.rpmMilli) ||
    m.rpmMilli < 0
  )
    return { state: "offline" };
  return {
    state: m.rpmMilli > 0 ? "running" : "resting",
    observedAt: m.observedAt,
    rpm: m.rpmMilli / 1000,
  };
}
const translations: Record<string, string> = {
  CoreUnreadable:
    "The certified rounds are unavailable. Retry when SqueekCore recovers; sells remain available.",
  CoreNotStale: "The seven-day failsafe is not open. Refresh the game state.",
  NapsUnsettled: "Process the settled rounds first, then retry the failsafe.",
  GameNotStarted:
    "The first swap starts the game. There are no rounds to claim yet.",
  NothingOwed: "This wallet has no deferred payout or refund to withdraw.",
  NothingToPay: "There is no eligible payout yet. Refresh the game state.",
  NoQualifyingBuyer: "There is no qualifying buyer for this payout yet.",
  TransferFailed:
    "This wallet could not receive ETH. Check its receiving permissions before retrying.",
  NotSworn: "This wallet does not meet the first-game card requirement.",
  V4TooLittleReceived:
    "The price moved beyond your slippage limit. Refresh the quote and try again.",
  V4TooMuchRequested:
    "The trade needs more input than the reviewed limit. Refresh the quote and try again.",
  InsufficientBalance:
    "The balance is too low for this trade. Reduce the amount.",
};
export function friendlyError(
  error: unknown,
  implementationAbi: Abi = [],
  depth = 0,
): string {
  const fallback =
    "Unable to complete this request. Refresh the state and try again. No new transaction was confirmed.";
  if (depth > 6) return fallback;
  const e = error as {
    code?: number;
    shortMessage?: string;
    message?: string;
    cause?: unknown;
    data?: { errorName?: string; args?: unknown[] } | Hex;
  };
  const decoded =
    typeof e?.data === "string"
      ? (() => {
          try {
            return decodeErrorResult({
              abi: [...routerAbi, ...implementationAbi],
              data: e.data as Hex,
            });
          } catch {
            return undefined;
          }
        })()
      : e?.data;
  if (
    decoded?.errorName === "ExecutionFailed" ||
    decoded?.errorName === "WrappedError"
  ) {
    const bytes =
      decoded.args?.[decoded.errorName === "ExecutionFailed" ? 1 : 2];
    if (typeof bytes === "string")
      return friendlyError({ data: bytes }, implementationAbi, depth + 1);
  }
  const text = [e?.shortMessage, e?.message, decoded?.errorName]
    .filter(Boolean)
    .join(" ");
  if (e?.code === 4001 || /reject|denied|cancel/i.test(text))
    return "Request declined in the wallet. You can try again.";
  for (const [name, message] of Object.entries(translations))
    if (text.includes(name)) return message;
  if (/insufficient funds/i.test(text))
    return "Not enough Sepolia ETH for this action and gas. Reduce the amount or use a faucet.";
  if (e?.cause) {
    const nested = friendlyError(e.cause, implementationAbi, depth + 1);
    if (!nested.startsWith("Unable")) return nested;
  }
  if (
    /amount|decimals|slippage|balance|quote|pool limit|network|chain changed/i.test(
      text,
    ) &&
    text.length < 220
  )
    return text;
  return fallback;
}
export async function switchOrAdd(
  provider: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  },
  chainId: number,
  addChain: unknown,
) {
  const params = [{ chainId: `0x${chainId.toString(16)}` }];
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params });
  } catch (error) {
    const e = error as {
      code?: number;
      message?: string;
      cause?: { code?: number };
    };
    if (
      !(
        e.code === 4902 ||
        e.cause?.code === 4902 ||
        /unknown chain|unrecognized chain|not added/i.test(e.message ?? "")
      ) ||
      !addChain
    )
      throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [addChain],
    });
    await provider.request({ method: "wallet_switchEthereumChain", params });
  }
}

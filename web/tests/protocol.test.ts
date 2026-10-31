import test from "node:test";
import assert from "node:assert/strict";
import { decodeAbiParameters, parseAbiParameters, zeroAddress } from "viem";
import { readFileSync } from "node:fs";
import {
  buildSwap,
  friendlyError,
  minimumOut,
  parseAmount,
  parseLiveStatus,
  poolParams,
  switchOrAdd,
} from "../src/protocol";
import { hashAbi, type PoolKey } from "../src/config";
const h = JSON.parse(
  readFileSync(new URL("../deployment.handoff.json", import.meta.url), "utf8"),
);
const token = h.contracts.find(
  (c: { name: string }) => c.name === "NapToken",
).address;
const hook = h.contracts.find(
  (c: { name: string }) => c.name === "HamsterNapHook",
).address;
const pool: PoolKey = {
  currency0: zeroAddress,
  currency1: token,
  fee: h.manifest.pool.fee,
  tickSpacing: h.manifest.pool.tickSpacing,
  hooks: hook,
};
test("implementation-derived ABI hashes bind the exact deployed interfaces", () => {
  for (const c of h.contracts) {
    const abi = JSON.parse(
      readFileSync(
        new URL(`../public/abi/${c.name}.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(hashAbi(abi), c.abiHash);
  }
});
test("amount parsing rejects rounded extra precision, negative, zero and overflowing values", () => {
  assert.equal(parseAmount("0.001", 18), 1000000000000000n);
  assert.equal(parseAmount("1.5", 6), 1500000n);
  for (const s of ["0", "-1", "1e3", "NaN", "0.0000001", ""])
    assert.throws(() => parseAmount(s, 6));
  assert.throws(() => parseAmount((2n ** 128n).toString(), 0));
});
test("slippage preserves integer safety and bounded limits", () => {
  assert.equal(minimumOut(1000000n, 100), 990000n);
  assert.throws(() => minimumOut(1n, 0));
  assert.throws(() => minimumOut(1n, 501));
});
test("native buy encodes V4_SWAP, exact input, settlement and minimum take with native value", () => {
  const s = buildSwap(pool, zeroAddress, 1000n, 900n);
  assert.equal(s.commands, "0x10");
  assert.equal(s.value, 1000n);
  const [actions, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    s.inputs[0],
  );
  assert.equal(actions, "0x060c0f");
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      `(${poolParams} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`,
    ),
    params[0],
  );
  assert.equal(swap.poolKey.hooks.toLowerCase(), hook);
  assert.equal(swap.zeroForOne, true);
  assert.equal(swap.amountOutMinimum, 900n);
  assert.deepEqual(
    decodeAbiParameters(parseAbiParameters("address,uint256"), params[1]),
    [zeroAddress, 1000n],
  );
  assert.equal(
    decodeAbiParameters(parseAbiParameters("address,uint256"), params[2])[1],
    900n,
  );
});
test("token sell sends no ETH and reverses direction", () => {
  const s = buildSwap(pool, token, 100n, 90n);
  assert.equal(s.value, 0n);
  const [, p] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    s.inputs[0],
  );
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      `(${poolParams} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`,
    ),
    p[0],
  );
  assert.equal(swap.zeroForOne, false);
  assert.deepEqual(
    decodeAbiParameters(parseAbiParameters("address,uint256"), p[2]),
    [zeroAddress, 90n],
  );
});
test("extended tuple adds the zero price-limit field only when network requests it", () => {
  const s = buildSwap(pool, token, 100n, 90n, true);
  const [, p] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    s.inputs[0],
  );
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      `(${poolParams} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)`,
    ),
    p[0],
  );
  assert.equal(swap.minHopPriceX36, 0n);
});
test("live API distinguishes running, resting, stale and offline, rejects unsupported schemas", () => {
  const now = Date.now();
  const d = {
    schemaVersion: 1,
    measurement: {
      freshness: "online",
      observedAt: new Date(now).toISOString(),
      staleAfterSeconds: 120,
      rpmMilli: 9000,
    },
  };
  assert.equal(parseLiveStatus(d, now).state, "running");
  d.measurement.rpmMilli = 0;
  assert.equal(parseLiveStatus(d, now).state, "resting");
  assert.equal(parseLiveStatus(d, now + 121000).state, "stale");
  d.measurement.freshness = "offline";
  assert.equal(parseLiveStatus(d, now).state, "offline");
  assert.equal(parseLiveStatus({ schemaVersion: 2 }, now).state, "offline");
});
test("unknown chain triggers add with exact supplied parameters, then switches again", async () => {
  const calls: { method: string; params?: unknown[] }[] = [];
  const add = { chainId: "0xaa36a7", chainName: "Sepolia" };
  const p = {
    request: async (a: { method: string; params?: unknown[] }) => {
      calls.push(a);
      if (calls.length === 1) throw { code: 4902 };
      return null;
    },
  };
  await switchOrAdd(p, h.chainId, add);
  assert.deepEqual(
    calls.map((c) => c.method),
    [
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
    ],
  );
  assert.deepEqual(calls[1].params, [add]);
});
test("switch rejection does not attempt add-chain or signing", async () => {
  let calls = 0;
  await assert.rejects(() =>
    switchOrAdd(
      {
        request: async () => {
          calls++;
          throw { code: 4001 };
        },
      },
      h.chainId,
      {},
    ),
  );
  assert.equal(calls, 1);
});
test("contract and wallet errors produce persistent recovery instructions", () => {
  assert.match(friendlyError({ code: 4001 }), /declined/);
  assert.match(
    friendlyError({ message: "execution reverted: NapsUnsettled" }),
    /Process the settled rounds/,
  );
  assert.match(
    friendlyError({ message: "CoreUnreadable" }),
    /sells remain available/,
  );
  assert.match(friendlyError({ message: "Insufficient funds" }), /Sepolia ETH/);
});

test("wrapped router/hook revert bytes decode to actionable errors from the loaded ABI", async () => {
  const { encodeErrorResult } = await import("viem");
  const { routerAbi } = await import("../src/protocol");
  const abi = JSON.parse(
    readFileSync(
      new URL("../public/abi/HamsterNapHook.json", import.meta.url),
      "utf8",
    ),
  );
  const inner = encodeErrorResult({ abi, errorName: "CoreUnreadable" });
  const wrapped = encodeErrorResult({
    abi: routerAbi,
    errorName: "WrappedError",
    args: [hook, "0x00000000", inner, "0x"],
  });
  const outer = encodeErrorResult({
    abi: routerAbi,
    errorName: "ExecutionFailed",
    args: [0n, wrapped],
  });
  assert.match(
    friendlyError({ data: outer }, abi),
    /certified rounds are unavailable/,
  );
});
test("latest qualifying buy time excludes later dust by the same buyer, across record pages", async () => {
  const { loadLatestBuyTime } = await import("../src/reads");
  const records = Array.from({ length: 35 }, (_, i) => ({
    round: 650n,
    time: BigInt(i + 100),
    cumulativeFees: 20000000000000n + BigInt(i),
    latestBuyer: token,
  }));
  const runtime = {
    contracts: { HamsterNapHook: { address: hook, abi: [] } },
    publicClient: {
      readContract: async ({ args }: { args: bigint[] }) =>
        records[Number(args[0])],
    },
  } as unknown as import("../src/config").Runtime;
  const state = {
    latest: token,
    buyCount: 35n,
    minBuy: 1000000000000000n,
    feeBps: 200n,
  } as import("../src/reads").GameState;
  assert.equal(await loadLatestBuyTime(runtime, state), 100n);
  records[20].cumulativeFees = 40000000000020n;
  for (let i = 21; i < 35; i++)
    records[i].cumulativeFees = 40000000000000n + BigInt(i);
  assert.equal(await loadLatestBuyTime(runtime, state), 120n);
});

test("mobile Rabby link matches its universal-link open-dapp handler and preserves the full page URL", async () => {
  const { OPEN_IN } = await import("../src/open-in");
  const page = "https://sepolia.squeekchain.com/#how";
  const link = new URL(OPEN_IN.find((w) => w.id === "rabby")!.href(page));
  assert.equal(link.origin, "https://go.rabby.io");
  assert.equal(link.pathname, "/mobile/");
  assert.equal(link.searchParams.get("_cmd"), "open-dapp");
  assert.equal(link.searchParams.get("dapp"), page);
});

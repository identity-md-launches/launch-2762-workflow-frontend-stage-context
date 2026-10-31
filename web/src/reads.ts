import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  zeroAddress,
  type Address,
  type PublicClient,
  type Hex,
  type AbiEvent,
} from "viem";
import type { Runtime } from "./config";
import { poolParams } from "./protocol";
export async function read<T>(
  runtime: Runtime,
  name: string,
  functionName: string,
  args: readonly unknown[] = [],
  client = runtime.publicClient,
) {
  const c = runtime.contracts[name];
  return (await client.readContract({
    address: c.address,
    abi: c.abi,
    functionName,
    args,
  })) as T;
}
export async function verifyDeployment(r: Runtime) {
  const d = r.deployment;
  if ((await r.publicClient.getChainId()) !== d.chainId)
    throw Error(
      "The public RPC is on the wrong chain. Trading is unavailable.",
    );
  const addresses = [
    ...d.contracts.map((c) => c.address),
    ...["poolManager", "universalRouter", "quoter", "permit2", "stateView"].map(
      (k) =>
        d.network.uniswapV4[k as keyof typeof d.network.uniswapV4] as Address,
    ),
  ];
  const code = await Promise.all(
    addresses.map((address) => r.publicClient.getBytecode({ address })),
  );
  if (code.some((c) => !c || c === "0x"))
    throw Error(
      "Deployed contract code could not be verified. Trading is unavailable.",
    );
  const [id, token, bound, manager] = await Promise.all([
    read<Hex>(r, "HamsterNapHook", "poolId"),
    read<Address>(r, "HamsterNapHook", "token"),
    read<boolean>(r, "HamsterNapHook", "poolBound"),
    read<Address>(r, "HamsterNapHook", "poolManager"),
  ]);
  const expected = keccak256(
    encodeAbiParameters(parseAbiParameters(poolParams), [d.poolKey]),
  );
  if (
    !bound ||
    id !== expected ||
    token.toLowerCase() !== r.contracts.NapToken.address.toLowerCase() ||
    d.poolKey.hooks.toLowerCase() !==
      r.contracts.HamsterNapHook.address.toLowerCase() ||
    manager.toLowerCase() !== d.network.uniswapV4.poolManager.toLowerCase()
  )
    throw Error(
      "The deployed pool does not match the handoff. Trading is unavailable.",
    );
  return true;
}
export type GameState = {
  buyCount: bigint;
  pot: bigint;
  latest: Address;
  scan: bigint;
  zeroRun: bigint;
  naps: bigint;
  owed: bigint;
  claims: bigint;
  opens: bigint;
  failsafeWinner: readonly [Address, bigint];
  tokenBalance: bigint;
  ethBalance: bigint;
  decimals: number;
  minBuy: bigint;
  feeBps: bigint;
  block: bigint;
  timestamp: bigint;
  core: Address;
  frontier?: bigint;
  napProgress?: number;
  coreError?: string;
  roundDuration: bigint;
  genesis: bigint;
  claimable?: bigint;
  claimError?: string;
  mayBuy: boolean;
};
export async function loadGame(
  r: Runtime,
  account?: Address,
  client: PublicClient = r.publicClient,
): Promise<GameState> {
  const hook = <T>(fn: string, args: readonly unknown[] = []) =>
    read<T>(r, "HamsterNapHook", fn, args, client);
  const [
    pot,
    latest,
    scan,
    zeroRun,
    naps,
    owed,
    claims,
    opens,
    failsafeWinner,
    core,
    decimals,
    minBuy,
    feeBps,
    roundDuration,
    genesis,
    tokenBalance,
    ethBalance,
    block,
    mayBuy,
    buyCount,
  ] = await Promise.all([
    hook<bigint>("pot"),
    hook<Address>("latestBuyer"),
    hook<bigint>("scanRound"),
    hook<bigint>("zeroRun"),
    hook<bigint>("napsSettled"),
    account ? hook<bigint>("owed", [account]) : 0n,
    hook<bigint>("claimsHeld"),
    hook<bigint>("failsafeOpensAt"),
    hook<readonly [Address, bigint]>("failsafeWinner"),
    hook<Address>("CORE"),
    read<number>(r, "NapToken", "decimals", [], client),
    hook<bigint>("MIN_QUALIFYING_BUY"),
    hook<bigint>("FEE_BPS"),
    hook<bigint>("ROUND_DURATION"),
    hook<bigint>("GENESIS_TIMESTAMP"),
    account ? read<bigint>(r, "NapToken", "balanceOf", [account], client) : 0n,
    account ? client.getBalance({ address: account }) : 0n,
    client.getBlock(),
    account ? hook<boolean>("mayBuy", [account]) : true,
    hook<bigint>("buyCount"),
  ]);
  const game: GameState = {
    buyCount,
    pot,
    latest,
    scan,
    zeroRun,
    naps,
    owed,
    claims,
    opens,
    failsafeWinner,
    core,
    decimals,
    minBuy,
    feeBps,
    roundDuration,
    genesis,
    tokenBalance,
    ethBalance,
    block: block.number!,
    timestamp: block.timestamp,
    mayBuy,
  };
  try {
    const [state, config] = await Promise.all([
      client.readContract({
        address: core,
        abi: r.coreAbi,
        functionName: "state",
      }) as Promise<{ settledThroughRound: bigint }>,
      client.readContract({
        address: core,
        abi: r.coreAbi,
        functionName: "configuration",
      }) as Promise<{ genesisTimestamp: bigint; roundDuration: bigint }>,
    ]);
    if (
      config.genesisTimestamp !== genesis ||
      config.roundDuration !== roundDuration
    )
      throw Error(
        "Core timing changed; certified nap progress is unavailable.",
      );
    game.frontier = state.settledThroughRound;
    const frontier = game.frontier;
    if (frontier === 0n) game.napProgress = 0;
    else {
      const from = frontier > 3n ? frontier - 3n : 0n;
      const page = (await client.readContract({
        address: core,
        abi: r.coreAbi,
        functionName: "roundPage",
        args: [from, frontier, 16n],
      })) as { certifiedThroughRound: bigint; rounds: { roundId: bigint }[] };
      if (page.certifiedThroughRound !== frontier)
        throw Error("The core returned an incomplete round page.");
      const work = new Set(page.rounds.map((x) => x.roundId.toString()));
      let zeros = 0;
      for (let round = frontier; round > from; round--) {
        if (work.has(round.toString())) break;
        zeros++;
      }
      game.napProgress = zeros;
    }
    if (scan > 0n && scan <= frontier) {
      try {
        const s = await client.simulateContract({
          address: r.contracts.HamsterNapHook.address,
          abi: r.contracts.HamsterNapHook.abi,
          functionName: "settleNaps",
          args: [8n],
          ...(account ? { account } : {}),
        });
        game.claimable = s.result as unknown as bigint;
      } catch {
        game.claimError =
          "The claim preview failed. Refresh before processing settled rounds.";
      }
    } else game.claimable = 0n;
  } catch {
    game.coreError =
      "Certified round data is unavailable. Later rounds are unknown; sells remain available.";
  }
  return game;
}
export type HistoryEntry = {
  kind: "nap" | "failsafe" | "buy";
  winner: Address;
  amount: bigint;
  round?: bigint;
  hash: Hex;
  block: bigint;
  time?: bigint;
};
export async function loadHistory(r: Runtime, to?: bigint) {
  const head = to ?? (await r.publicClient.getBlockNumber());
  const from = head > 9999n ? head - 9999n : 0n;
  const c = r.contracts.HamsterNapHook;
  const events = c.abi.filter(
    (e) =>
      e.type === "event" &&
      ["NapSettled", "FailsafeTaken", "Buy"].includes(e.name),
  ) as AbiEvent[];
  const history: HistoryEntry[] = [];
  // Bounded pages fit public-provider log limits. Never interpret a failed page as an empty history.
  for (let start = from; start <= head; start += 2000n) {
    const end = start + 1999n < head ? start + 1999n : head;
    const logs = await r.publicClient.getLogs({
      address: c.address,
      events,
      fromBlock: start,
      toBlock: end,
      strict: true,
    });
    for (const log of logs) {
      const a = log.args as Record<string, unknown>;
      if (log.eventName === "Buy" && !a.qualifying) continue;
      history.push({
        kind:
          log.eventName === "Buy"
            ? "buy"
            : log.eventName === "NapSettled"
              ? "nap"
              : "failsafe",
        winner: (a.winner ?? a.buyer) as Address,
        amount: (a.amount ?? a.ethSpent) as bigint,
        round: (a.napStart ?? a.round) as bigint | undefined,
        hash: log.transactionHash!,
        block: log.blockNumber!,
      });
    }
  }
  history.reverse();
  const lastBuy = history.find((e) => e.kind === "buy");
  if (lastBuy)
    lastBuy.time = (
      await r.publicClient.getBlock({ blockNumber: lastBuy.block })
    ).timestamp;
  return { entries: history, from, to: head };
}
export function hasBuyer(address: Address) {
  return address.toLowerCase() !== zeroAddress;
}

export async function loadLatestBuyTime(
  r: Runtime,
  game: GameState,
  signal?: AbortSignal,
): Promise<bigint | undefined> {
  if (!hasBuyer(game.latest) || game.buyCount === 0n) return undefined;
  // In this pinned implementation 2% of a gross >= 0.001 ETH is at least 0.00002 ETH.
  // Every positive fee is recorded. Comparing adjacent cumulative fees excludes dust,
  // including dust placed by the same wallet after its qualifying buy.
  const threshold = (game.minBuy * game.feeBps) / 10000n;
  if (threshold === 0n || (game.minBuy * game.feeBps) % 10000n !== 0n)
    throw Error("Cannot infer qualifying buy from these fee constants.");
  type BuyRecord = {
    round: bigint;
    time: bigint;
    cumulativeFees: bigint;
    latestBuyer: Address;
  };
  for (let end = game.buyCount; end > 0n; ) {
    if (signal?.aborted) throw Error("Buyer time lookup cancelled.");
    const start = end > 16n ? end - 16n : 0n;
    const first = start > 0n ? start - 1n : 0n;
    const indices = Array.from(
      { length: Number(end - first) },
      (_, i) => first + BigInt(i),
    );
    const records = await Promise.all(
      indices.map((i) => read<BuyRecord>(r, "HamsterNapHook", "buyAt", [i])),
    );
    for (let i = records.length - 1; i >= Number(start - first); i--) {
      const fee =
        records[i].cumulativeFees -
        (i > 0 ? records[i - 1].cumulativeFees : 0n);
      if (fee >= threshold) {
        if (records[i].latestBuyer.toLowerCase() !== game.latest.toLowerCase())
          throw Error(
            "Buyer changed during the lookup. Refresh the game state.",
          );
        return records[i].time;
      }
    }
    end = start;
  }
  return undefined;
}

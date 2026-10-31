import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  keccak256,
  toBytes,
  type Abi,
  type Address,
  type PublicClient,
} from "viem";
import { createConfig } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type Deployment = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  poolKey: PoolKey;
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
  };
  walletAddChain?: {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
  assets: { path: string; sha256: string }[];
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  return value;
}
export const hashAbi = (abi: Abi) =>
  keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);
function safePath(path: string) {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("..") ||
    path.includes(":") ||
    path.includes("\\")
  )
    throw Error("Unsafe deployment asset path.");
  return path;
}
export async function loadDeployment() {
  const res = await fetch("./imd-deployment.json", { cache: "no-cache" });
  if (!res.ok)
    throw Error(
      "Deployment configuration could not be loaded. Reload to try again.",
    );
  const d = (await res.json()) as Deployment;
  if (
    d.version !== 1 ||
    d.chainId !== d.network?.chainId ||
    !d.poolKey ||
    !d.network.rpcUrls.length ||
    d.contracts.length !== 2
  )
    throw Error(
      "Deployment configuration is incomplete. Trading is unavailable.",
    );
  const contracts: Record<
    string,
    Deployment["contracts"][number] & { abi: Abi }
  > = Object.fromEntries(
    await Promise.all(
      d.contracts.map(async (c) => {
        const r = await fetch(`./${safePath(c.abiPath)}`);
        if (!r.ok) throw Error(`Could not load ${c.name} ABI.`);
        const abi = (await r.json()) as Abi;
        if (hashAbi(abi) !== c.abiHash)
          throw Error(
            `${c.name} ABI verification failed. Trading is unavailable.`,
          );
        return [c.name, { ...c, abi }];
      }),
    ),
  );
  if (!contracts.HamsterNapHook || !contracts.NapToken)
    throw Error("Deployment contracts are missing.");
  const r = await fetch("./abi/SqueekCore.json");
  if (!r.ok) throw Error("SqueekCore ABI could not be loaded.");
  const coreAbi = (await r.json()) as Abi;
  const chain = defineChain({
    id: d.chainId,
    name: d.network.name,
    nativeCurrency: d.network.nativeCurrency,
    rpcUrls: { default: { http: d.network.rpcUrls } },
    blockExplorers: { default: { name: "Explorer", url: d.network.explorer } },
    testnet: d.network.testnet,
  });
  const transport = () =>
    fallback(
      d.network.rpcUrls.map((url) =>
        http(url, { timeout: 7000, retryCount: 0 }),
      ),
      { rank: false, retryCount: 1 },
    );
  const publicClient = createPublicClient({
    chain,
    transport: transport(),
    batch: { multicall: false },
  }) as PublicClient;
  const wagmi = createConfig({
    chains: [chain],
    multiInjectedProviderDiscovery: true,
    connectors: [
      injected(),
      coinbaseWallet({ appName: "Hamster Nap", preference: "all" }),
    ],
    transports: { [chain.id]: transport() },
  });
  return { deployment: d, contracts, coreAbi, chain, publicClient, wagmi };
}
export type Runtime = Awaited<ReturnType<typeof loadDeployment>>;
export const STATUS_URL = "https://api.squeekchain.com/v1/status";
export const CONSOLE_URL = "https://sepolia.squeekchain.com";

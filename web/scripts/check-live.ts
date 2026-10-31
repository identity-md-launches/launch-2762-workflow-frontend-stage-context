import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  type Abi,
  type PublicClient,
} from "viem";
import { verifyDeployment, loadGame } from "../src/reads";
import type { Runtime, Deployment } from "../src/config";
import { quoterAbi } from "../src/protocol";
const deployment: Deployment = JSON.parse(
  readFileSync(
    new URL("../../dist/imd-deployment.json", import.meta.url),
    "utf8",
  ),
);
const chain = defineChain({
  id: deployment.chainId,
  name: deployment.network.name,
  nativeCurrency: deployment.network.nativeCurrency,
  rpcUrls: { default: { http: deployment.network.rpcUrls } },
});
const publicClient = createPublicClient({
  chain,
  transport: fallback(
    deployment.network.rpcUrls.map((url) =>
      http(url, { timeout: 12000, retryCount: 0 }),
    ),
    { rank: false, retryCount: 0 },
  ),
}) as PublicClient;
const contracts = Object.fromEntries(
  deployment.contracts.map((c) => [
    c.name,
    {
      ...c,
      abi: JSON.parse(
        readFileSync(
          new URL(`../../dist/${c.abiPath}`, import.meta.url),
          "utf8",
        ),
      ) as Abi,
    },
  ]),
);
const coreAbi = JSON.parse(
  readFileSync(
    new URL("../../dist/abi/SqueekCore.json", import.meta.url),
    "utf8",
  ),
);
const r = { deployment, chain, publicClient, contracts, coreAbi } as Runtime;
try {
  const verified = await verifyDeployment(r);
  const game = await loadGame(r);
  const configuration = await publicClient.readContract({
    address: game.core,
    abi: coreAbi,
    functionName: "configuration",
  });
  let quoteEvidence: unknown;
  try {
    const quote = await publicClient.simulateContract({
      address: deployment.network.uniswapV4.quoter,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          poolKey: deployment.poolKey,
          zeroForOne: true,
          exactAmount: game.minBuy,
          hookData: "0x",
        },
      ],
    });
    quoteEvidence = {
      mode: "eth_call simulation only, no signing or broadcast",
      amountIn: game.minBuy,
      amountOut: quote.result[0],
      gasEstimate: quote.result[1],
    };
  } catch {
    quoteEvidence = {
      mode: "eth_call simulation only",
      result: "Unavailable at this observation; UI handles quote failures.",
    };
  }
  const result = {
    quoteEvidence,
    checkedAt: new Date().toISOString(),
    mode: "Read-only public RPC. No wallet, private key or broadcast.",
    chainId: await publicClient.getChainId(),
    deployedCodeAndPoolVerified: verified,
    contracts: deployment.contracts.map((c) => ({
      name: c.name,
      address: c.address,
      abiHash: c.abiHash,
    })),
    configuration,
    game,
  };
  writeFileSync(
    new URL("../../docs/frontend/live-read-evidence.json", import.meta.url),
    JSON.stringify(
      result,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      result,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

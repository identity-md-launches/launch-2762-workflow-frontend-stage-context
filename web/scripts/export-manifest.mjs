import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { abiHash } from "./hashing.mjs";
const web = fileURLToPath(new URL("../", import.meta.url));
const dist = resolve(web, "../dist");
const handoff = JSON.parse(readFileSync(join(web, "deployment.handoff.json")));
const network = JSON.parse(readFileSync(join(web, "network.handoff.json")));
const token = handoff.contracts.find(
  (c) => c.name === handoff.manifest.token.contract,
);
const hook = handoff.contracts.find(
  (c) => c.name === handoff.manifest.hook.contract,
);
const currencies = [handoff.manifest.pool.pairedCurrency, token.address].sort(
  (a, b) => (BigInt(a) < BigInt(b) ? -1 : 1),
);
const poolKey = handoff.poolKey ?? {
  currency0: currencies[0],
  currency1: currencies[1],
  fee: handoff.manifest.pool.fee,
  tickSpacing: handoff.manifest.pool.tickSpacing,
  hooks: hook.address,
};
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts: handoff.contracts.map(({ name, address, abiHash: hash }) => {
    const abiPath = `abi/${name}.json`;
    if (abiHash(JSON.parse(readFileSync(join(dist, abiPath)))) !== hash)
      throw Error(`ABI mismatch: ${name}`);
    return { name, address, abiHash: hash, abiPath };
  }),
  poolKey,
  ...network,
  assets: [],
};
function walk(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
}
manifest.assets = walk(dist)
  .filter((p) => relative(dist, p) !== "imd-deployment.json")
  .map((p) => {
    if (statSync(p).size > 8388608) throw Error(`Asset too big: ${p}`);
    return {
      path: relative(dist, p).split("\\").join("/"),
      sha256: createHash("sha256").update(readFileSync(p)).digest("hex"),
    };
  });
if (manifest.assets.length > 128) throw Error("Too many assets");
writeFileSync(
  join(dist, "imd-deployment.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Manifest: ${manifest.assets.length} assets, ${manifest.assets.reduce((s, a) => s + statSync(join(dist, a.path)).size, 0)} bytes`,
);

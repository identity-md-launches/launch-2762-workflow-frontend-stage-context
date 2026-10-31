import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { abiHash } from "./hashing.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const handoff = JSON.parse(
  readFileSync(new URL("../deployment.handoff.json", import.meta.url)),
);
mkdirSync(new URL("../public/abi/", import.meta.url), { recursive: true });
for (const name of [...handoff.contracts.map((c) => c.name), "SqueekCore"]) {
  let bytes;
  let origin = "pinned source";
  try {
    bytes = execFileSync(
      "git",
      ["show", `${handoff.sourceCommit}:docs/abi/${name}.json`],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    bytes = readFileSync(
      new URL(`../public/abi/${name}.json`, import.meta.url),
    );
    origin = "committed ABI";
  }
  const abi = JSON.parse(bytes);
  if (!Array.isArray(abi)) throw Error(`${name}: ABI must be an array`);
  const expected = handoff.contracts.find((c) => c.name === name)?.abiHash;
  if (expected && abiHash(abi) !== expected)
    throw Error(`${name}: ABI hash mismatch ${abiHash(abi)}`);
  writeFileSync(new URL(`../public/abi/${name}.json`, import.meta.url), bytes);
  console.log(
    `${name}: ${origin} ${handoff.sourceCommit}, canonical Keccak ${abiHash(abi)}`,
  );
}

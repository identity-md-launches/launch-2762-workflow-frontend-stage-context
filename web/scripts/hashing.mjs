import { keccak256, toBytes } from "viem";
export const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export const abiHash = (abi) =>
  keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);

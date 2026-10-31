import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import type { Abi, Address, Hex } from "viem";
import type { Runtime } from "./config";
import { friendlyError } from "./protocol";
export type ContractAction = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};
export function useTransaction(r: Runtime) {
  const account = useAccount();
  const cache = useQueryClient();
  const current = useRef(account);
  current.current = account;
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<Hex>();
  async function run(action: ContractAction, after?: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setHash(undefined);
    const address = current.current.address;
    try {
      const wallet = await getWalletClient(r.wagmi, { chainId: r.chain.id });
      const check = async () => {
        if (
          !address ||
          current.current.address !== address ||
          !current.current.isConnected ||
          current.current.chainId !== r.deployment.chainId ||
          (await wallet.getChainId()) !== r.deployment.chainId
        )
          throw Error(
            "Wallet or chain changed. Reconnect to Sepolia and retry.",
          );
      };
      await check();
      setStatus("Checking transaction…");
      const simulation = await r.publicClient.simulateContract({
        ...action,
        account: address!,
      });
      await check();
      setStatus("Confirm in your wallet…");
      const tx = await wallet.writeContract(simulation.request);
      setHash(tx);
      setStatus("Waiting for confirmation…");
      const receipt = await r.publicClient.waitForTransactionReceipt({
        hash: tx,
        confirmations: 1,
        timeout: 180000,
      });
      if (receipt.status !== "success")
        throw Error("The transaction reverted. Refresh the state and retry.");
      setStatus("Confirmed. Refreshing state…");
      await after?.();
      await cache.invalidateQueries({ queryKey: ["game"] });
      await cache.invalidateQueries({ queryKey: ["history"] });
      setStatus("Transaction confirmed.");
    } catch (e) {
      setStatus("");
      setError(friendlyError(e, r.contracts.HamsterNapHook.abi));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { run, busy, status, error, hash };
}

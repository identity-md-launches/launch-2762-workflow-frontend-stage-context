import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { getAddress } from "viem";
import type { Runtime } from "./config";
import { friendlyError, switchOrAdd } from "./protocol";
import { OPEN_IN, isMobileBrowser } from "./open-in";
export const shortAddress = (a: string) => {
  const c = getAddress(a);
  return `${c.slice(0, 6)}…${c.slice(-4)}`;
};
export function Wallet({
  r,
  onOpenReady,
}: {
  r: Runtime;
  onOpenReady?: (open: () => void) => void;
}) {
  const { address, isConnected, chainId, connector } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mobile = isMobileBrowser();
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const listed = connectors
    .filter((c) => !(c.id === "injected" && named))
    .filter((c) => !mobile || c.type !== "injected");
  const open = () => {
    setError("");
    dialog.current?.showModal();
  };
  useEffect(() => {
    onOpenReady?.(open);
  }, [onOpenReady]);
  async function switchChain() {
    if (!connector) return;
    setPending("switch");
    setError("");
    try {
      await switchOrAdd(
        (await connector.getProvider()) as Parameters<typeof switchOrAdd>[0],
        r.deployment.chainId,
        r.deployment.walletAddChain,
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setPending("");
    }
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="wallet-button"
        onClick={() =>
          isConnected && chainId !== r.deployment.chainId
            ? void switchChain()
            : open()
        }
        disabled={!!pending}
      >
        <span aria-hidden="true" className="wallet-dot" />
        {pending === "switch"
          ? "Switching…"
          : isConnected && chainId !== r.deployment.chainId
            ? `Switch to ${r.chain.name}`
            : address
              ? shortAddress(address)
              : "Connect wallet"}
      </button>
      {error && !dialog.current?.open && (
        <p className="header-error" role="alert">
          {error}
        </p>
      )}
      <dialog
        ref={dialog}
        className="wallet-dialog"
        aria-labelledby="wallet-dialog-title"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
        onClose={() => trigger.current?.focus()}
      >
        <div className="dialog-head">
          <h2 id="wallet-dialog-title">
            {isConnected ? "Wallet" : "Connect a wallet"}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close wallet dialog"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        {isConnected && address ? (
          <>
            <p className="full-address">{getAddress(address)}</p>
            <button
              type="button"
              className="secondary wide"
              onClick={() => {
                disconnect();
                dialog.current?.close();
              }}
            >
              Disconnect
            </button>
          </>
        ) : (
          <>
            <p className="muted">Use Sepolia test ETH to play.</p>
            {!mobile &&
              !named &&
              !(window as Window & { ethereum?: unknown }).ethereum && (
                <p className="muted small">
                  No browser wallet detected. Install an extension or choose
                  Coinbase Wallet below.
                </p>
              )}
            {mobile &&
              OPEN_IN.map((w) => (
                <a
                  className="wallet-row"
                  href={w.href(location.href)}
                  key={w.id}
                >
                  <img
                    alt=""
                    src={`./wallets/${w.id}.svg`}
                    width="28"
                    height="28"
                  />
                  Open in {w.name}
                  <span aria-hidden="true">↗</span>
                </a>
              ))}
            {listed.map((c) => (
              <button
                type="button"
                className="wallet-row"
                key={c.uid}
                disabled={!!pending}
                onClick={async () => {
                  setPending(c.uid);
                  setError("");
                  try {
                    if (c.id === "injected" && !(await c.getProvider())) {
                      setError(
                        "No browser wallet detected. Install an extension or choose Coinbase Wallet.",
                      );
                      return;
                    }
                    await connectAsync({ connector: c });
                    const p = await c.getProvider();
                    await switchOrAdd(
                      p as Parameters<typeof switchOrAdd>[0],
                      r.deployment.chainId,
                      r.deployment.walletAddChain,
                    );
                    dialog.current?.close();
                  } catch (e) {
                    setError(friendlyError(e));
                  } finally {
                    setPending("");
                  }
                }}
              >
                <img
                  width="28"
                  height="28"
                  alt=""
                  src={
                    c.icon ??
                    `./wallets/${c.id === "coinbaseWalletSDK" ? "coinbase" : "browser"}.svg`
                  }
                />
                <span>
                  {c.id === "injected"
                    ? "Browser wallet"
                    : c.id === "coinbaseWalletSDK" && mobile
                      ? "Coinbase Smart Wallet"
                      : c.name}
                  {pending === c.uid ? " · Opening…" : ""}
                </span>
              </button>
            ))}
            {mobile && (
              <p className="muted small">
                Already in a wallet browser? Its connection appears when the
                wallet is ready.
              </p>
            )}
          </>
        )}
        <p role="alert" className="error">
          {error}
        </p>
      </dialog>
    </>
  );
}

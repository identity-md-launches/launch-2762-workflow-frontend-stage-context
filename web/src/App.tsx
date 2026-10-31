import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import {
  createPublicClient,
  custom,
  getAddress,
  type Address,
  type PublicClient,
} from "viem";
import type { Runtime } from "./config";
import { CONSOLE_URL, STATUS_URL } from "./config";
import { amountLabel, parseLiveStatus, friendlyError } from "./protocol";
import {
  hasBuyer,
  loadGame,
  loadHistory,
  loadLatestBuyTime,
  verifyDeployment,
  type GameState,
} from "./reads";
import { Wallet, shortAddress } from "./Wallet";
import { Trade, TxFeedback } from "./Trade";
import { useTransaction } from "./transactions";
function AddressLink({ address, r }: { address: Address; r: Runtime }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="address-wrap">
      <a
        href={`${r.deployment.network.explorer}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        title={getAddress(address)}
        aria-label={`View ${getAddress(address)} on Etherscan`}
      >
        {shortAddress(address)} ↗
      </a>
      <button
        type="button"
        className="copy"
        aria-label={`Copy ${getAddress(address)}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(getAddress(address));
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
function ago(timestamp: bigint, now: number) {
  const seconds = Math.max(0, Math.floor(now / 1000) - Number(timestamp));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}
function Claims({
  r,
  game,
  ready,
  onConnect,
}: {
  r: Runtime;
  game?: GameState;
  ready: boolean;
  onConnect: () => void;
}) {
  const { isConnected, chainId } = useAccount();
  const tx = useTransaction(r);
  const withdraw = useTransaction(r);
  const redeem = useTransaction(r);
  const failsafe = useTransaction(r);
  const connected = isConnected && chainId === r.chain.id;
  const canProcess =
    game &&
    game.scan > 0n &&
    game.frontier !== undefined &&
    game.scan <= game.frontier &&
    !game.claimError;
  const canFailsafe =
    game &&
    game.scan > 0n &&
    game.timestamp >= game.opens &&
    game.failsafeWinner[1] > 0n;
  const action = (fn: string) => ({
    address: r.contracts.HamsterNapHook.address,
    abi: r.contracts.HamsterNapHook.abi,
    functionName: fn,
    args: fn === "settleNaps" ? [8n] : [],
  });
  return (
    <section className="claims" aria-labelledby="claim-title">
      <div className="section-head">
        <div>
          <h2 id="claim-title">When bedtime is settled</h2>
          <p className="muted">
            Anyone can claim. The contract pays the winner.
          </p>
        </div>
        <span className="moon-small" aria-hidden="true">
          ☾
        </span>
      </div>
      <div className="claim-row">
        <div>
          <h3>
            {game?.claimable && game.claimable > 0n
              ? "A settled nap is ready"
              : "Waiting for a settled nap"}
          </h3>
          <p className="muted small">
            {game?.scan === 0n
              ? "The first swap starts the game."
              : (game?.claimError ??
                game?.coreError ??
                (canProcess
                  ? "Process up to 128 certified rounds, in order."
                  : "Newly certified rounds appear here automatically."))}
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={(connected && (!ready || !canProcess)) || tx.busy}
          onClick={() =>
            connected ? void tx.run(action("settleNaps")) : onConnect()
          }
        >
          {tx.busy
            ? "Processing…"
            : !connected
              ? "Connect to claim"
              : game?.claimable && game.claimable > 0n
                ? "Claim settled nap"
                : "Process settled rounds"}
        </button>
      </div>
      <TxFeedback r={r} tx={tx} />
      <details id="credits">
        <summary>Refunds, pot claims & failsafe</summary>
        <div className="utility-row">
          <div>
            <h3>Deferred payout or refund</h3>
            <p className="muted small">
              {game ? amountLabel(game.owed) : "…"} ETH available to this
              wallet. Includes unused buy-fee reservations.
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            disabled={!ready || !connected || !game?.owed || withdraw.busy}
            onClick={() => void withdraw.run(action("withdrawOwed"))}
          >
            {withdraw.busy ? "Withdrawing…" : "Withdraw owed ETH"}
          </button>
        </div>
        <TxFeedback r={r} tx={withdraw} />
        <div className="utility-row">
          <div>
            <h3>Redeem the pot’s ETH claims</h3>
            <p className="muted small">
              {game ? amountLabel(game.claims) : "…"} ETH in PoolManager claims.
              Already included in the pot; redemption pays the hook.
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            disabled={!ready || !connected || !game?.claims || redeem.busy}
            onClick={() => void redeem.run(action("redeemClaims"))}
          >
            {redeem.busy ? "Redeeming…" : "Redeem pot claims"}
          </button>
        </div>
        <TxFeedback r={r} tx={redeem} />
        <div className="utility-row">
          <div>
            <h3>Seven-day failsafe</h3>
            <p className="muted small">
              {game?.scan === 0n
                ? "Starts with the first swap."
                : game
                  ? `Earliest opening: ${new Date(Number(game.opens) * 1000).toLocaleString()}. A new observed frontier advance resets it.`
                  : "Loading the failsafe window."}{" "}
              Pays only the eligible buyer; later fees stay for the next game.
            </p>
            {game && hasBuyer(game.failsafeWinner[0]) && (
              <p className="small">
                Eligible now:{" "}
                <AddressLink r={r} address={game.failsafeWinner[0]} /> ·{" "}
                {amountLabel(game.failsafeWinner[1])} ETH, before any pending
                naps.
              </p>
            )}
          </div>
          <button
            type="button"
            className="secondary"
            disabled={!ready || !connected || !canFailsafe || failsafe.busy}
            onClick={() => void failsafe.run(action("failsafe"))}
          >
            {failsafe.busy ? "Checking failsafe…" : "Claim failsafe"}
          </button>
        </div>
        <TxFeedback r={r} tx={failsafe} />
        <p className="muted small">
          Connect on Sepolia to use these controls. Each action is simulated
          first. Claims that cannot be delivered become a withdrawal credit.
        </p>
      </details>
    </section>
  );
}
export default function App({ r }: { r: Runtime }) {
  const { address, chainId, connector } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [fallbackClient, setFallbackClient] = useState<PublicClient>();
  const [openWallet, setOpenWallet] = useState<() => void>(() => () => {});
  const [clock, setClock] = useState(Date.now());
  const [historyBefore, setHistoryBefore] = useState<bigint>();
  const setOpener = useCallback(
    (fn: () => void) => setOpenWallet(() => fn),
    [],
  );
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setFallbackClient(undefined);
    if (
      connector &&
      typeof connector.getProvider === "function" &&
      chainId === r.chain.id
    )
      void connector
        .getProvider()
        .then((p) => {
          if (!cancelled)
            setFallbackClient(
              createPublicClient({
                chain: r.chain,
                transport: custom(p as Parameters<typeof custom>[0]),
              }) as PublicClient,
            );
        })
        .catch(() => {
          if (!cancelled) setFallbackClient(undefined);
        });
    return () => {
      cancelled = true;
    };
  }, [connector, chainId, r.chain]);
  const verified = useQuery({
    queryKey: ["verification"],
    queryFn: () => verifyDeployment(r),
    retry: 1,
    staleTime: 300000,
    refetchInterval: 300000,
  });
  const game = useQuery({
    queryKey: ["game", address],
    queryFn: async () => {
      try {
        return await loadGame(r, address);
      } catch (e) {
        if (fallbackClient && walletClient)
          return loadGame(r, address, fallbackClient);
        throw e;
      }
    },
    retry: 1,
    refetchInterval: 12000,
  });
  const live = useQuery({
    queryKey: ["hamster"],
    queryFn: async () => {
      const response = await fetch(STATUS_URL, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw Error("Activity feed offline");
      return (await response.json()) as unknown;
    },
    refetchInterval: 10000,
    retry: 0,
  });
  const history = useQuery({
    queryKey: ["history", historyBefore?.toString()],
    queryFn: () => loadHistory(r, historyBefore),
    retry: 1,
    refetchInterval: 60000,
  });
  const status = live.isError
    ? { state: "offline" as const }
    : parseLiveStatus(live.data, clock);
  const state = game.data;
  const fresh = !!state && !game.isError && clock - game.dataUpdatedAt < 45000;
  const buyerTime = useQuery({
    queryKey: ["buyer-time", state?.latest, state?.buyCount.toString()],
    enabled: !!state && hasBuyer(state.latest),
    queryFn: ({ signal }) => loadLatestBuyTime(r, state!, signal),
    staleTime: Infinity,
    retry: 1,
  });
  const winners =
    history.data?.entries.filter((e) => e.kind !== "buy").slice(0, 6) ?? [];
  const openConnect = () => {
    if (address && chainId !== r.chain.id) {
      document.querySelector<HTMLButtonElement>(".wallet-button")?.click();
    } else openWallet();
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to game
      </a>
      <header className="site-header">
        <a href="#" className="brand" aria-label="Hamster Nap home">
          <img src="./favicon.svg" alt="" width="36" height="36" />
          <span>Hamster Nap</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#how">How to play</a>
          <a href={CONSOLE_URL} target="_blank" rel="noreferrer">
            SqueekChain ↗
          </a>
        </nav>
        <Wallet r={r} onOpenReady={setOpener} />
      </header>
      <main id="main">
        <div className="intro">
          <div>
            <h1>Last buy before bedtime.</h1>
            <p>A last-buyer game on Sepolia testnet.</p>
          </div>
          <span className="network-label">
            <span aria-hidden="true" className="network-dot" />
            Sepolia testnet
          </span>
        </div>
        <div className="arena">
          <section className="game-board panel" aria-label="Live game">
            <div className="live-scene">
              <div className="live-copy">
                <div className="live-label">
                  Squeektoshi live{" "}
                  <span className={`status-pill ${status.state}`}>
                    <span aria-hidden="true" />{" "}
                    {live.isPending
                      ? "Loading"
                      : status.state === "running"
                        ? "Running"
                        : status.state === "resting"
                          ? "Resting"
                          : status.state === "stale"
                            ? "Stale"
                            : "Offline"}
                  </span>
                </div>
                <h2>
                  {status.state === "running"
                    ? "Little paws. Big plans."
                    : status.state === "resting"
                      ? "The wheel is quiet."
                      : "A quiet corner of the internet."}
                </h2>
                <p className="muted small">
                  {status.state === "running"
                    ? `${status.rpm?.toFixed(1)} wheel revolutions / minute`
                    : status.state === "resting"
                      ? "Resting is live activity, not a certified nap."
                      : "The activity feed is unavailable or out of date."}
                </p>
                <a
                  href={CONSOLE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="scene-link"
                >
                  Visit the live console ↗
                </a>
              </div>
              <img
                className="hamster-art"
                src="./hamster.svg"
                alt="A sleepy illustrated hamster tucked under a patchwork blanket beside its wheel"
              />
              <span className="art-caption">
                Illustration · live data from SqueekChain
              </span>
            </div>
            <div className="game-stats">
              <div className="pot">
                <span className="muted">The bedtime pot</span>
                <p className="pot-value numeric">
                  {state ? amountLabel(state.pot, 18, 5) : "…"} <span>ETH</span>
                </p>
                <span className="muted small">
                  {state
                    ? "Sepolia ETH · no monetary value"
                    : "Reading the deployed hook…"}
                </span>
              </div>
              <div className="latest">
                <span className="muted">Latest qualifying buyer</span>
                <p>
                  {state && hasBuyer(state.latest) ? (
                    <AddressLink address={state.latest} r={r} />
                  ) : state ? (
                    "The first spot is open"
                  ) : (
                    "Reading…"
                  )}
                </p>
                <span className="muted small">
                  {state && hasBuyer(state.latest)
                    ? buyerTime.data
                      ? `Bought ${ago(buyerTime.data, clock)}`
                      : buyerTime.isError
                        ? "Buy time unavailable"
                        : "Reading buy time…"
                    : "A qualifying buy takes this spot."}
                </span>
              </div>
            </div>
          </section>
          <Trade
            r={r}
            game={state}
            verified={verified.data === true && !verified.isError}
            fresh={fresh}
            onConnect={openConnect}
          />
          <section className="nap-meter" aria-labelledby="nap-title">
            <div className="section-head">
              <h2 id="nap-title">A nap in the making</h2>
              <span className="muted small">
                {state?.napProgress !== undefined
                  ? `${state.napProgress} / 3 settled rounds`
                  : "Progress unknown"}
              </span>
            </div>
            <div
              className="rounds"
              role="group"
              aria-label={
                state?.napProgress !== undefined
                  ? `${state.napProgress} consecutive zero-work rounds out of three`
                  : "Certified progress unavailable"
              }
            >
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className={
                    state?.napProgress !== undefined && state.napProgress >= n
                      ? "round settled"
                      : "round"
                  }
                >
                  <span aria-hidden="true">
                    {state?.napProgress !== undefined && state.napProgress >= n
                      ? "✓"
                      : "·"}
                  </span>
                  <span>{n * 10} min</span>
                </div>
              ))}
            </div>
            <p className="muted small">
              Three consecutive settled zero-work rounds make a nap. Unsettled
              rounds are unknown.
            </p>
            <div className="frontier">
              <span>
                Certified frontier{" "}
                <strong className="numeric">
                  {state?.frontier !== undefined
                    ? `#${state.frontier}`
                    : "Unavailable"}
                </strong>
              </span>
              <span>
                Next round to scan{" "}
                <strong className="numeric">
                  {state?.scan ? `#${state.scan}` : state ? "Not started" : "…"}
                </strong>
              </span>
            </div>
            {state?.coreError && (
              <p className="error small">{state.coreError}</p>
            )}
            <div className="read-status small">
              <span>
                {game.isFetching
                  ? "Refreshing chain state…"
                  : fresh
                    ? `Read at block ${state?.block}`
                    : state
                      ? "Last read is stale"
                      : "Connecting to public RPC…"}
              </span>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  void game.refetch();
                  void verified.refetch();
                }}
                disabled={game.isFetching}
              >
                Refresh state
              </button>
            </div>
            {game.isError && (
              <p className="error small" role="alert">
                Unable to read live game state. Check your connection and
                refresh. Previously shown values may be stale.
              </p>
            )}
            {verified.isError && (
              <p className="error small" role="alert">
                Deployment verification unavailable. Trading is disabled.{" "}
                {friendlyError(verified.error)}
              </p>
            )}
          </section>
        </div>
        <Claims
          r={r}
          game={state}
          ready={verified.data === true && !verified.isError && fresh}
          onConnect={openConnect}
        />
        <section
          id="winners"
          className="winners"
          aria-labelledby="winners-title"
        >
          <div className="section-head">
            <div>
              <h2 id="winners-title">The bedtime roll call</h2>
              <p className="muted">
                Recent winners, straight from the hook’s events.
              </p>
            </div>
            <span className="small muted">
              {state ? `${state.naps} naps settled` : "Reading history"}
            </span>
          </div>
          {history.isPending ? (
            <p className="empty-state">Loading the event log…</p>
          ) : history.isError ? (
            <div className="empty-state">
              <p className="error">
                Winner history could not be loaded. This does not mean there are
                no winners.
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => void history.refetch()}
              >
                Retry history
              </button>
            </div>
          ) : winners.length ? (
            <ul className="winner-list">
              {winners.map((w) => (
                <li key={`${w.hash}-${w.round ?? w.kind}`}>
                  <span className="winner-moon" aria-hidden="true">
                    ☾
                  </span>
                  <div>
                    {hasBuyer(w.winner) ? (
                      <AddressLink address={w.winner} r={r} />
                    ) : (
                      <span>No qualifying buyer</span>
                    )}
                    <span className="small muted">
                      {w.kind === "nap"
                        ? `Nap beginning at round ${w.round}`
                        : "Seven-day failsafe"}
                      {!hasBuyer(w.winner) ? " · No qualifying buyer" : ""}
                    </span>
                  </div>
                  <div className="winner-amount numeric">
                    {amountLabel(w.amount)} ETH
                    <a
                      className="small"
                      href={`${r.deployment.network.explorer}/tx/${w.hash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View payout ↗
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <span className="empty-moon" aria-hidden="true">
                ☾
              </span>
              <p>No winners in this event window yet.</p>
              <p className="small muted">
                The first settled nap starts the roll call.
              </p>
            </div>
          )}
          <div className="history-footer small muted">
            <span>
              {history.data
                ? `Event window: blocks ${history.data.from}–${history.data.to}`
                : "Public RPC event history"}
            </span>
            <button
              type="button"
              className="text-button"
              disabled={
                !history.data || history.data.from === 0n || history.isFetching
              }
              onClick={() => {
                if (history.data) setHistoryBefore(history.data.from - 1n);
              }}
            >
              Load older events
            </button>
            {historyBefore !== undefined && (
              <button
                type="button"
                className="text-button"
                onClick={() => setHistoryBefore(undefined)}
              >
                Back to latest
              </button>
            )}
          </div>
        </section>
        <section id="how" className="how" aria-labelledby="how-title">
          <h2 id="how-title">A small game. A real hamster.</h2>
          <ol>
            <li>
              <span className="step-number">01</span>
              <h3>Buy a little NAP</h3>
              <p>
                Spend at least 0.001 test ETH to become the latest buyer. Every
                buy adds 2% of its executed ETH to the pot.
              </p>
            </li>
            <li>
              <span className="step-number">02</span>
              <h3>Wait for bedtime</h3>
              <p>
                Three settled ten-minute rounds with zero work certify a nap.
                Its start is the first of those rounds.
              </p>
            </li>
            <li>
              <span className="step-number">03</span>
              <h3>The earlier buyer wins</h3>
              <p>
                The last qualifying buyer before that start wins the earlier
                fees. Buys during the nap count for the next game.
              </p>
            </li>
          </ol>
        </section>
        <section className="contracts" id="contracts">
          <h2>Under the blanket</h2>
          <p className="muted">
            No owner controls, pause or upgrades. Sells do not depend on the
            hamster feed. Test tokens have no value; USD pricing is unavailable.
          </p>
          <div className="contract-links">
            {r.deployment.contracts.map((c) => (
              <div key={c.name}>
                <span>{c.name === "NapToken" ? "NAP token" : "Game hook"}</span>
                <AddressLink address={c.address} r={r} />
              </div>
            ))}
            {state && (
              <div>
                <span>SqueekCore · read only</span>
                <AddressLink address={state.core} r={r} />
              </div>
            )}
          </div>
          <div className="resources">
            <a href="./imd-deployment.json" target="_blank" rel="noreferrer">
              Deployment & ABIs ↗
            </a>
            <a
              href={r.deployment.network.faucets[0]}
              target="_blank"
              rel="noreferrer"
            >
              Get test ETH ↗
            </a>
          </div>
        </section>
      </main>
      <footer>
        <a className="brand" href="#">
          <img src="./favicon.svg" alt="" width="28" height="28" />
          <span>Sweet dreams, Squeektoshi.</span>
        </a>
        <p>
          An unofficial community game. Not affiliated with SqueekChain.
          <br />
          Ethereum Sepolia · Test tokens of no value.
        </p>
      </footer>
    </>
  );
}

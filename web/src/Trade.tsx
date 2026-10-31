import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { zeroAddress, type Address } from "viem";
import type { Runtime } from "./config";
import type { GameState } from "./reads";
import {
  amountLabel,
  buildSwap,
  erc20Abi,
  friendlyError,
  minimumOut,
  parseAmount,
  permitAbi,
  quoterAbi,
  routerAbi,
} from "./protocol";
import { useTransaction } from "./transactions";
export function TxFeedback({
  tx,
  r,
}: {
  tx: ReturnType<typeof useTransaction>;
  r: Runtime;
}) {
  return (
    <div className="tx-feedback">
      <p role="status">{tx.status}</p>
      {tx.error && (
        <p role="alert" className="error">
          {tx.error}
        </p>
      )}
      {tx.hash && (
        <a
          href={`${r.deployment.network.explorer}/tx/${tx.hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction ↗
        </a>
      )}
    </div>
  );
}
export function Trade({
  r,
  game,
  verified,
  fresh,
  onConnect,
}: {
  r: Runtime;
  game?: GameState;
  verified: boolean;
  fresh: boolean;
  onConnect: () => void;
}) {
  const { address, chainId, isConnected } = useAccount();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [input, setInput] = useState("0.001");
  const [debounced, setDebounced] = useState(input);
  const [slippage, setSlippage] = useState(100);
  const [inputError, setInputError] = useState("");
  const [review, setReview] = useState<{ minimum: bigint; at: number }>();
  const flow = useRef(false);
  const [checking, setChecking] = useState(false);
  const tx = useTransaction(r);
  const approve = useTransaction(r);
  const permit = useTransaction(r);
  const busy = checking || tx.busy || approve.busy || permit.busy;
  const rightChain = isConnected && chainId === r.deployment.chainId;
  const decimals = side === "buy" ? 18 : (game?.decimals ?? 18);
  const inSymbol = side === "buy" ? "ETH" : "NAP";
  const outSymbol = side === "buy" ? "NAP" : "ETH";
  const currency: Address =
    side === "buy" ? zeroAddress : r.contracts.NapToken.address;
  const balance = side === "buy" ? game?.ethBalance : game?.tokenBalance;
  let amount = 0n;
  let invalid = "";
  try {
    amount = parseAmount(input, decimals);
  } catch (e) {
    invalid = (e as Error).message;
  }
  useEffect(() => {
    const id = setTimeout(() => setDebounced(input), 350);
    return () => clearTimeout(id);
  }, [input]);
  useEffect(() => {
    setReview(undefined);
  }, [input, slippage, side, address, chainId]);
  const quote = useQuery({
    queryKey: ["quote", side, debounced, address],
    enabled:
      verified &&
      fresh &&
      rightChain &&
      !!amount &&
      input === debounced &&
      !!game,
    queryFn: async () => {
      const n = parseAmount(debounced, decimals);
      const result = await r.publicClient.simulateContract({
        address: r.deployment.network.uniswapV4.quoter,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: r.deployment.poolKey,
            zeroForOne:
              currency.toLowerCase() ===
              r.deployment.poolKey.currency0.toLowerCase(),
            exactAmount: n,
            hookData: "0x",
          },
        ],
        account: address!,
      });
      if (result.result[0] === 0n)
        throw Error("The quote returned no output. Try another amount.");
      return { out: result.result[0], amount: n, at: Date.now() };
    },
    retry: 1,
    refetchInterval: 15000,
  });
  const allowances = useQuery({
    queryKey: ["allowances", address, currency],
    enabled: verified && rightChain && currency !== zeroAddress,
    queryFn: async () => {
      const u = r.deployment.network.uniswapV4;
      const [token, router] = await Promise.all([
        r.publicClient.readContract({
          address: currency,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address!, u.permit2],
        }),
        r.publicClient.readContract({
          address: u.permit2,
          abi: permitAbi,
          functionName: "allowance",
          args: [address!, currency, u.universalRouter],
        }),
      ]);
      return { token, router: router[0], expires: Number(router[1]) };
    },
    refetchInterval: 10000,
    retry: 1,
  });
  const needsToken =
    currency !== zeroAddress &&
    allowances.data &&
    allowances.data.token < amount;
  const needsPermit =
    currency !== zeroAddress &&
    allowances.data &&
    !needsToken &&
    (allowances.data.router < amount ||
      allowances.data.expires < Date.now() / 1000 + 300);
  const quoteValid =
    !!quote.data &&
    quote.data.amount === amount &&
    input === debounced &&
    Date.now() - quote.data.at < 30000 &&
    !quote.isError;
  const overBalance = rightChain && balance !== undefined && amount > balance;
  const unavailable =
    !verified ||
    !fresh ||
    !game ||
    !rightChain ||
    !!invalid ||
    overBalance ||
    !quoteValid ||
    (side === "buy" && !game.mayBuy) ||
    (currency !== zeroAddress && !allowances.data);
  let label = needsToken
    ? "Approve NAP"
    : needsPermit
      ? "Allow NAP trading"
      : review
        ? `Confirm ${side}`
        : `Review ${side}`;
  if (busy)
    label = approve.busy
      ? "Approving NAP…"
      : permit.busy
        ? "Allowing NAP…"
        : tx.status.startsWith("Waiting")
          ? "Confirming swap…"
          : "Checking swap…";
  const output = quote.data?.out ?? 0n;
  const min = minimumOut(output, slippage);
  async function act() {
    if (!rightChain) {
      onConnect();
      return;
    }
    if (unavailable || busy || flow.current) return;
    flow.current = true;
    setChecking(true);
    try {
      if (invalid) {
        setInputError(invalid);
        return;
      }
      const u = r.deployment.network.uniswapV4;
      if (needsToken) {
        await approve.run(
          {
            address: currency,
            abi: erc20Abi,
            functionName: "approve",
            args: [u.permit2, amount],
          },
          () => allowances.refetch(),
        );
        return;
      }
      if (needsPermit) {
        await permit.run(
          {
            address: u.permit2,
            abi: permitAbi,
            functionName: "approve",
            args: [
              currency,
              u.universalRouter,
              amount,
              Math.floor(Date.now() / 1000) + 3600,
            ],
          },
          () => allowances.refetch(),
        );
        return;
      }
      if (!review) {
        setReview({ minimum: min, at: Date.now() });
        return;
      }
      // Refresh the quote and allowances immediately before simulation and signing.
      const q = await quote.refetch();
      if (!q.data || q.isError) {
        setReview(undefined);
        return;
      }
      if (q.data.out < review.minimum || Date.now() - review.at > 60000) {
        setInputError("The quote moved or expired. Review the updated trade.");
        setReview(undefined);
        return;
      }
      if (currency !== zeroAddress) {
        const a = await allowances.refetch();
        if (
          !a.data ||
          a.data.token < amount ||
          a.data.router < amount ||
          a.data.expires < Date.now() / 1000 + 300
        ) {
          setReview(undefined);
          return;
        }
      }
      const swap = buildSwap(
        r.deployment.poolKey,
        currency,
        amount,
        review.minimum,
        u.extendedSwapParams,
      );
      await tx.run(
        {
          address: u.universalRouter,
          abi: routerAbi,
          functionName: "execute",
          args: [
            swap.commands,
            swap.inputs,
            BigInt(Math.floor(Date.now() / 1000) + 300),
          ],
          value: swap.value,
        },
        async () => {
          await allowances.refetch();
          setReview(undefined);
        },
      );
    } catch (error) {
      setInputError(friendlyError(error));
    } finally {
      flow.current = false;
      setChecking(false);
    }
  }
  return (
    <section className="trade panel" id="trade" aria-labelledby="trade-title">
      <div className="section-head">
        <h2 id="trade-title">A little NAP?</h2>
        <span className="muted small">ETH / NAP</span>
      </div>
      <div className="segmented" role="group" aria-label="Trade direction">
        {(["buy", "sell"] as const).map((s) => (
          <button
            type="button"
            aria-pressed={side === s}
            key={s}
            disabled={busy}
            onClick={() => {
              setSide(s);
              setInput(s === "buy" ? "0.001" : "1000");
              setInputError("");
            }}
          >
            {s === "buy" ? "Buy NAP" : "Sell NAP"}
          </button>
        ))}
      </div>
      <div className="amount-head">
        <label htmlFor="trade-amount">You pay</label>
        <span className="small muted">
          {isConnected && game
            ? `Balance: ${amountLabel(balance ?? 0n, decimals, 4)}`
            : "Sepolia test tokens"}
        </span>
      </div>
      <label className="amount-entry" htmlFor="trade-amount">
        <input
          id="trade-amount"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          type="text"
          value={input}
          disabled={busy}
          aria-invalid={!!inputError || overBalance}
          aria-describedby="amount-help"
          onChange={(e) => {
            setInput(e.target.value);
            setInputError("");
          }}
          onBlur={() => setInputError(invalid)}
        />
        <span>{inSymbol}</span>
      </label>
      <p
        className={`small ${inputError || overBalance ? "error" : "muted"}`}
        id="amount-help"
      >
        {inputError ||
          (overBalance
            ? `Insufficient ${inSymbol} balance.`
            : side === "buy"
              ? `${game ? amountLabel(game.minBuy) : "0.001"} ETH minimum to become latest buyer.`
              : "Sells pay no game fee. Keep ETH for gas.")}
      </p>
      {review && quoteValid && (
        <div className="review" role="status">
          Spend up to {amountLabel(amount, decimals)} {inSymbol}; receive at
          least{" "}
          {amountLabel(review.minimum, side === "buy" ? game?.decimals : 18)}{" "}
          {outSymbol}. {side === "buy" ? "The 2% game fee is included. " : ""}
          Gas is extra. Deadline: 5 minutes.
        </div>
      )}
      <button
        type="button"
        className="primary wide"
        disabled={busy || (rightChain && unavailable)}
        onClick={() => void act()}
      >
        {!isConnected
          ? "Connect to trade"
          : !rightChain
            ? "Switch to Sepolia"
            : label}
        <span aria-hidden="true">↗</span>
      </button>
      <div className="receive">
        <span className="muted">You receive ≈</span>
        <span className="numeric">
          {quoteValid
            ? amountLabel(output, side === "buy" ? game?.decimals : 18, 4)
            : quote.isFetching
              ? "Quoting…"
              : "…"}{" "}
          {outSymbol}
        </span>
      </div>
      {quoteValid && amount > 0n && (
        <p className="small muted exchange-rate">
          1 {inSymbol} ≈{" "}
          {amountLabel(
            (output * 10n ** BigInt(decimals)) / amount,
            side === "buy" ? game?.decimals : 18,
          )}{" "}
          {outSymbol} at this quote
        </p>
      )}
      <div className="slippage">
        <label htmlFor="slippage">Slippage limit</label>
        <select
          id="slippage"
          value={slippage}
          disabled={busy}
          onChange={(e) => setSlippage(Number(e.target.value))}
        >
          <option value="50">0.5%</option>
          <option value="100">1%</option>
          <option value="200">2%</option>
          <option value="500">5%</option>
        </select>
      </div>
      <p className="small muted trade-note">
        {side === "buy"
          ? "2% to the pot · 1.25% pool fee"
          : "0% game fee · 1.25% pool fee"}
        <br />
        Test tokens have no monetary value.
      </p>
      {rightChain && game && game.owed > 0n && (
        <p className="small credit-note">
          {amountLabel(game.owed)} ETH is owed to this wallet.{" "}
          <a
            href="#credits"
            onClick={() =>
              document.getElementById("credits")?.setAttribute("open", "")
            }
          >
            View withdrawal controls
          </a>
        </p>
      )}
      {isConnected && !rightChain && (
        <p className="error" role="status">
          Switch your wallet to Sepolia to trade.
        </p>
      )}
      {rightChain && !verified && (
        <p className="muted small">
          Verifying deployed code and pool before trading.
        </p>
      )}
      {rightChain && !fresh && (
        <p className="error small">
          Game reads are unavailable or stale. Refresh to trade.
        </p>
      )}
      {quote.isError && (
        <p className="error small" role="alert">
          Quote unavailable.{" "}
          {friendlyError(quote.error, r.contracts.HamsterNapHook.abi)}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => void quote.refetch()}
          >
            Retry quote
          </button>
        </p>
      )}
      {allowances.isError && (
        <p className="error small">
          Token allowances could not be read.{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => void allowances.refetch()}
          >
            Retry allowances
          </button>
        </p>
      )}
      <TxFeedback r={r} tx={approve} />
      <TxFeedback r={r} tx={permit} />
      <TxFeedback r={r} tx={tx} />
      <p className="smart-note small muted">
        The hook records the transaction’s originating wallet as buyer. A smart
        wallet may record its relayer instead.
      </p>
    </section>
  );
}

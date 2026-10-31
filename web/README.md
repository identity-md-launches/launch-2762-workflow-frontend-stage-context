# Hamster Nap frontend

A static, English game page for the deployed Hamster Nap token and hook on Ethereum Sepolia. It follows Squeektoshi’s live wheel activity, reads the game pot and certified nap progress, trades ETH/NAP through the configured Uniswap v4 router, and exposes every public game action. No backend, application signer, owner configuration or relay account is needed.

## Install, run and export

From the repository root, with Node 22.12+ (validated with Node 24.21.0):

```sh
npm ci --prefix web
npm run dev --prefix web
npm run typecheck --prefix web
npm run build --prefix web
npm run verify --prefix web
npm run preview --prefix web
```

The build writes repository-root `dist/`, using Vite `base: './'`, then writes `dist/imd-deployment.json` **after** the export. Commit the whole export together with this source and `package-lock.json`. Rebuild and verify after any change to exported bytes. A publisher can host `dist/` directly at a gateway subpath without rewrites. The production browser tests serve it at `/preview/`, rather than testing the development server.

`npm run build` extracts the implementation-derived ABI arrays from `docs/abi/<Contract>.json` at the pinned deployed source commit when Git history is available. It verifies each canonical Keccak against the handoff. A source archive without Git history uses the already committed, verified `web/public/abi/` copies, so the build also works after the temporary `.imd/reads/` inputs are removed.

## One runtime deployment configuration

The app fetches `./imd-deployment.json`, then the ABI JSON paths in that file. `src/config.ts` constructs both the public RPC and wagmi clients from it. Runtime source contains no independent deployment address, chain ID or public RPC map. The SqueekCore address is read from the hook’s `CORE()` getter, and its pinned ABI is an exported asset. Protocol function signatures live in `src/protocol.ts`; protocol addresses always come from `manifest.network.uniswapV4`.

The build inputs are `deployment.handoff.json` and `network.handoff.json`, preserved copies of the supplied public handoffs. They are not imported into the browser bundle. Never edit them as a way to change an existing deployment. A new launch needs a validated handoff and matching implementation-derived ABI exports.

This legacy handoff has no top-level `poolKey`. The exporter derives it from the handoff’s native paired currency, token, hook, fee 12500 and tick spacing 60, and includes that key in the runtime manifest. The worker verified its hash against the live hook’s `poolId()`, its token binding, and its PoolManager. A future handoff with `poolKey` is copied directly. The complete `network` and `walletAddChain` objects are copied unchanged.

The manifest includes the exact two attested contracts and no extra contract-map entries. It inventories every other exported file with lowercase SHA-256, including HTML, ABI arrays, scripts, styles, font, wallet marks and share image. It does not hash itself. `npm run verify` checks the allowed top-level keys, all handoff identifiers, contract set, canonical ABI hashes, network equality, safe paths, complete inventory, asset hashes and export limits.

At runtime, transactions require successful chain/code/pool verification and fresh game reads. Verification checks nonempty code and pool binding; it is not an independent bytecode audit or a signature verification of the attestation.

## Wallets and actions

- One wallet sheet lists named EIP-6963 browser providers and Coinbase Wallet. On a phone without injection it offers MetaMask, Coinbase Wallet, Rabby and Phantom browser links, plus Coinbase Smart Wallet. No WalletConnect project ID is used. Wallet marks are local assets.
- Connecting switches to Sepolia. Unknown-chain error 4902 triggers `wallet_addEthereumChain` with the exact handoff parameters, followed by another switch. A wrong-chain state keeps signing controls gated.
- Buy: native ETH needs no approval. Sell: first approve the exact NAP amount to Permit2 if necessary, then allow that exact amount to the Universal Router with a one-hour Permit2 expiration. Each step waits for its receipt and refetches allowances before unlocking.
- Quotes use the network quoter via `simulateContract`. The review freezes the minimum output. Before signing, the app refreshes quotes and allowances, rejects a moved/expired review, and simulates `execute`. It encodes V4_SWAP `0x10` with SWAP_EXACT_IN_SINGLE / SETTLE_ALL / TAKE_ALL (`0x060c0f`), the exact pool key, minimum output and a five-minute deadline. Native value is sent only for an ETH input. The optional extended tuple follows the network flag.
- Each transaction has its own pending/error/hash state, a synchronous duplicate-submission lock and an explorer link. Wallet account/chain are checked again after simulation. Rejections unlock for retry. Hook/router wrapped custom errors are decoded into recovery messages.
- Claim calls `settleNaps(8)`, at most 128 rounds. It says “Claim settled nap” when simulation finds a nap, otherwise “Process settled rounds” for eligible backlog work. Anyone may process; the contract selects and pays the historical winner.
- The expandable credits panel also exposes `withdrawOwed()`, `redeemClaims()` and `failsafe()`, with relevant balances and eligibility. A nonzero wallet credit is linked from the trade panel. There are no owner settings in this deployment.

The hook records `tx.origin` as buyer. Smart-wallet/relayer transactions may therefore record the relaying EOA, not the smart wallet receiving NAP. The page discloses this before trading.

## Observability

The API status feed is polled every 10 seconds, with schema/freshness checks and explicit running, resting, stale and offline states. The hamster illustration is labeled as an illustration, not a live camera. The console link opens SqueekChain’s real console.

Contract reads refresh every 12 seconds, quotations every 15 seconds, allowances every 10 seconds, event history every 60 seconds, and verification every five minutes. Configured public RPCs fail over intentionally; game reads can fall back to the connected wallet provider on the correct chain. Failed/stale reads are not displayed as zero.

The core’s certified frontier is authoritative. Only the last three **settled** rounds are inspected for the current zero-work streak; rounds after the frontier remain unknown. A streak already claimed can still read 3/3 while the hamster rests, so claim eligibility comes from hook simulation, not that meter. The first swap starts this game; pre-start core naps do not create a payout.

The latest qualifying buyer’s timestamp is recovered from the hook’s buy records, scanning backward in pages of 16. Adjacent cumulative fees distinguish a qualifying buy from later dust, including dust by the same buyer, using the pinned fee/minimum constants. The lookup is cached by buy count and supports cancellation. Event history loads a bounded 10,000-block window in 2,000-block RPC pages; “Load older events” moves back another window. History failure is reported rather than treated as no winners.

Amounts use on-chain token decimals and native units. There is no authorized USD price source; test tokens have no monetary value. Quotes display their exchange rate rather than an invented dollar price.

## Validation

```sh
npm test --prefix web
# Browser binaries are test tooling, kept outside the submitted tree.
PLAYWRIGHT_BROWSERS_PATH=/tmp/hamster-browsers web/node_modules/.bin/playwright install chromium --only-shell
PLAYWRIGHT_BROWSERS_PATH=/tmp/hamster-browsers npm run test:browser --prefix web
web/node_modules/.bin/tsx web/scripts/check-live.ts
```

The browser suite manages and closes its own server and Chromium session. It tests the production export with mock RPC/wallet responses; it never broadcasts. `check-live.ts` uses only public read RPCs and quote simulation, never a key or signing provider. It writes public observation evidence under `docs/frontend/`.

The pinned design probe was also run on the final export. See [validation](../docs/frontend/VALIDATION.md), [implemented design](../docs/DESIGN.md), screenshots and machine-readable evidence in `docs/frontend/`. Real wallet extension sessions, phone app handoffs, Coinbase passkeys and funded on-chain execution were not performed. Publication, IPFS pinning, ENS naming and post-publication HTTP/RPC checks belong to the publisher, not this worker.

## Assets and attribution

The hamster/favicon SVG artwork is original to this frontend. `share.png` is reproducible from local assets with `scripts/make-share.mjs` and Playwright. Nunito’s local Latin variable font is distributed under SIL OFL. The wallet marks come from RainbowKit 2.2.11 under MIT; trademarks remain with their owners. Notices are retained in `docs/frontend/`.

Design work applied the pinned Better Interface guide by Jakub Krehel (MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`) and its Impeccable documentation method by Paul Bakaus (Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). The pinned Austin Griffith ethskills frontend UX/testing guidance is MIT. Their notices accompany the validation evidence.

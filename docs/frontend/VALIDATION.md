# Frontend validation

Worker report for the Hamster Nap frontend, 2026-10-31. This evidence describes local checks and public read observations; it is not an independent certification or a record of publication.

## Scope and deployment binding

Source is under `web/`; the static export is `dist/`. The deployed source commit is `3b65e5a220554f121de6f6f12113836cbb93ac4f`. Solidity, Foundry configuration, dependencies under `lib/`, root build files and GitHub workflows were preserved. This frontend worker did not redeploy, publish, pin IPFS content or set a site name.

The runtime loads the exported `imd-deployment.json` and its referenced ABI JSON. Both implementation ABI canonical Keccak hashes match the handoff:

| Contract       | ABI Keccak, without 0x                                             |
| -------------- | ------------------------------------------------------------------ |
| NapToken       | `66c0725e9072e2c383f59b9a3baa620d857711ec96837623ad2372c434b83f07` |
| HamsterNapHook | `074b4765811b658cdcd2704e12cde81f6eb1ad57b7afda572635e207f6ccd681` |

The handoff’s source commit, attestation hash, launch ID, chain ID and complete two-contract set are retained. Network and add-chain objects compare equal to the supplied network handoff. This older handoff has no top-level pool key; its pool terms and deployed hook derive the exported key, whose hash was verified against the live hook’s `poolId()`. The ABI extractor reads the pinned Git commit rather than regenerating interfaces from assumptions.

The overriding write budget allows only `web/**`, `dist/**`, `docs/**` and explicitly `web/.gitignore`. Therefore the requested root `DESIGN.md` is delivered as `docs/DESIGN.md`; no root document or build configuration was changed. The one ignore file is within the explicit path allowance and excludes dependency/cache output at every depth beneath `web/`.

## Commands and results

All commands were run from the repository root. Node 24.21.0, npm 11.19.0, Vite 7.1.12, TypeScript 5.9.3 and Chromium 141 / Playwright 1.56.1 were used.

| Check                             | Command                                                                                                                                                                                      | Result                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Type checking                     | `npm run typecheck --prefix web`                                                                                                                                                             | Passed                                                                |
| Protocol and state logic          | `npm test --prefix web`                                                                                                                                                                      | 13 tests passed                                                       |
| Production export                 | `npm run build --prefix web`                                                                                                                                                                 | Passed; relative Vite base; final manifest generated after assets     |
| Handoff/inventory/hash validation | `npm run verify --prefix web`                                                                                                                                                                | Passed; see `export-verification.txt`                                 |
| Production browser interactions   | `PLAYWRIGHT_BROWSERS_PATH=/tmp/hamster-browsers npm run test:browser --prefix web`                                                                                                           | 23 scenarios passed; no script errors or failed local resources       |
| Accessibility automation          | axe-core in the browser suite                                                                                                                                                                | Zero violations in disconnected and connected/expanded utility states |
| Pinned design probe               | `IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" PLAYWRIGHT_BROWSERS_PATH=/tmp/hamster-browsers node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | 16/16 checks passed; see `taste-results.json`                         |
| Public chain checks               | `web/node_modules/.bin/tsx web/scripts/check-live.ts`                                                                                                                                        | Read-only chain/code/pool/core checks and quoter simulation passed    |

Rollup reported third-party PURE-comment placement warnings during bundling; it removed the annotations and completed successfully. Installation reported transitive deprecated packages/peer warnings. Neither generated dependency trees nor package archives are included in the submission. Browser binaries/caches remain outside the delivered tree.

The 13 protocol tests cover ABI binding; exact amount parsing and bounds; slippage; native and ERC-20 swap encoding; the network’s optional extended tuple; all API activity states; unknown-chain addition and rejected switching; error recovery including nested router/hook bytes; latest qualifying buy age across dust records; and the Rabby URL’s accepted parameters.

The browser suite uses the **production export at a subpath**, not Vite’s development server. RPC and EIP-6963 wallet mocks exercise connection, keyboard selection, unknown-chain addition, wrong-chain gating, quotes, review, pre-signing simulation, wallet rejection, ERC-20→Permit2 approval, Permit2→router approval, sell execution/receipt refresh, nap claims, deferred withdrawal, claim redemption, failsafe, winner-event decoding, missing deployed code, API stale/offline states, missing desktop wallets and all phone wallet choices. The script intercepts external requests, so its mocked signing calls cannot reach a chain. Local requests cancelled during intentional reloads are recorded separately from failures.

## Rendered and interaction evidence

The assigned browser tool also inspected the actual public-read production page at `/preview/`, including 390 × 844, 320 × 844 and 1440 × 1000. The final console reported no errors or warnings. The automated suite additionally inspected 768px and connected states at all four widths.

- `mobile-390.png`: actual live-read first screen, with product, wallet, pot and main trade action.
- `desktop-1440.png`: actual live-read full page.
- `keyboard-focus-390.png`: mocked game state; visible keyboard ring on the wallet trigger.
- `wallet-sheet-390.png`: emulated phone without an injected provider, showing the four wallet-browser choices and Coinbase Smart Wallet.
- `mobile-measurements.json`: width 390, document width 390, main button bottom **822.70px** within the 844px screen; local font loaded.
- `render-evidence.json`: actual 320px render has no horizontal overflow and records six measured contrast pairs.
- `browser-results.json`, `taste-results.json`: machine-readable outcomes.

The probe found no horizontal overflow, text overlaps, clipped text, floating controls over content, too-small crowded targets, failing measured contrast, casing/tracking problems, missing metadata, card nesting or inappropriate motion. It counted six type sizes and three weights at desktop. Some inline links/copy controls are smaller than the 44px comfort target; the probe confirmed the relevant 24px/spacing baseline. Primary actions are at least 48px.

The suite separately stress-tested long balances and a full address at 320/390, plus 200% root text enlargement. All reflow without horizontal scrolling. This is **not** a native 200% zoom test. Native dialog focus containment, Escape, Tab/Enter and focus return were exercised; an actual screen reader was not used.

## Better Interface coverage

The pinned contents/workflow and the core principles of all six domains were read and used during construction, then reviewed against the finished export. The implemented system is documented from the final source in `docs/DESIGN.md`.

| Domain        | Coverage | Evidence and limits                                                                                                                                                                                                                                      |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility | Checked  | Native controls/labels, named modal, skip link, visible focus, keyboard connection/dismissal, status/error regions, reduced motion, axe scans. No native screen-reader, physical-device or forced-colors session.                                        |
| Layout        | Checked  | Shared edges, mobile control priority, 320/390/768/1440 reflow, full-address/large-balance stress and 200% text enlargement. Native browser zoom and RTL mirroring were not performed; English is the only requested locale.                             |
| Writing       | Checked  | Consequence-specific controls, explicit test-token context, persistent recovery guidance, API/chain distinction, fees and historical winner semantics. No inferred USD price or fictional live state.                                                    |
| Typography    | Checked  | Local Nunito loaded at 400/600/800; six-size scale, tabular data, wrapping and no kicker labels; probe passed. Non-Latin glyph/font coverage is not an English-launch requirement.                                                                       |
| Colors        | Checked  | Role tokens, dark-only system, redundant status labels/checkmarks, browser-computed contrast measurements and probe pass. No unrequested light theme; dynamic art pixels were not presented as text-contrast evidence.                                   |
| UI details    | Checked  | Hover, focus, pressed, pending, disabled, error, empty and success paths; native disclosure/dialog; local marks and original artwork; reduced motion. Browser Animations-panel playback at 10% speed was not performed for the simple 120ms transitions. |

## Findings, corrections and rechecks

Locations below refer to the final source where each correction lives.

| Severity / source                                           | Finding and impact                                                                                                            | Correction and recheck                                                                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High — `web/src/Trade.tsx:365`, `web/src/styles.css:951`    | Initial 390px layout pushed the main action below the first screen.                                                           | Shortened the intro/scene and placed the trade action immediately after the amount/help or review. Final measured bottom 822.70px; inspected mobile screenshot.                      |
| Medium — `web/src/Trade.tsx:167`                            | Disconnected game reads supplied a zero wallet balance and showed an incorrect insufficient-balance error.                    | Balance validation now requires a connected wallet on the correct chain. Browser asserts neutral disconnected state.                                                                 |
| High — `web/src/transactions.ts:15`                         | A just-connected view could enable review before its reactive signing-client query was ready.                                 | Acquire the wallet client inside the action, with synchronous locking and account/chain checks around simulation. Browser buy/sell/approval/claim flows passed.                      |
| High — `web/src/App.tsx:241`                                | A persisted connector can briefly lack methods during reload/reconnect, causing a script exception.                           | Guard `getProvider` and catch provider lookup failure. Repeated reload/error-state tests report zero script errors.                                                                  |
| Medium — `web/src/styles.css:547`, `web/src/styles.css:768` | Under 200% text enlargement, round segments and the footer’s unbroken brand line could overflow.                              | Let segment contents and footer brand wrap; header also wraps. Text enlargement and long-value checks now pass.                                                                      |
| Medium — `web/src/Wallet.tsx:85`                            | The native dialog initially lacked an explicit accessible name.                                                               | Associate its heading with `aria-labelledby`; disconnected and expanded-state axe scans passed, and keyboard focus return was exercised.                                             |
| Medium — `web/src/reads.ts:292`                             | Event-window-only buyer age could be unavailable for older buyers; taking the last record’s timestamp would count later dust. | Page backward through recorded cumulative fees using the pinned qualification threshold. Unit tests cover same-buyer dust and page boundaries; browser shows the qualifying buy age. |
| Medium — `web/src/open-in.ts:15`                            | Rabby requires its `/mobile/` universal-link path with `_cmd=open-dapp` and `dapp`, rather than a generic URL parameter.      | Corrected against the wallet’s own handler and added a parameter/URL-preservation test. Physical app handoff remains unperformed.                                                    |
| Medium — `web/src/Wallet.tsx:125`                           | A desktop browser with no extension needed an explicit recovery path.                                                         | Sheet explains installation/Coinbase options; generic row detects a missing provider without opening a request. Browser case passed.                                                 |
| Low — `web/src/Trade.tsx:325`, `web/src/styles.css:197`     | Probe flagged a pill-like small header control, an amount wrapper as a nested card and em-dash loading placeholders.          | Improved header control readability to 16px, made the field wrapper a native label and used ellipses for pending amounts. Final probe passed all 16 checks.                          |

No known required worker behavior remains blocked. The root design-document location is the explicit scope exception described above.

## Live observations and unperformed checks

`live-read-evidence.json` records the public read observation and timestamp. The worker confirmed Sepolia chain ID 11155111, nonempty code at the two application and relevant configured Uniswap addresses, the bound pool ID/token/PoolManager, and SqueekCore’s genesis **1793022600** and round duration **600**. A native-input quote of **0.001 ETH** returned a nonzero NAP output through the supplied quoter using `eth_call`; the file records its exact units and gas estimate. These values are observations, not seeded app data, and can change.

The API was fetched directly and its documented schema was checked. The final page’s live feed showed resting activity; certified state was read separately from SqueekCore. Reference sources used for integration details were the primary [SqueekChain API documentation](https://docs.squeekchain.com/developers/api/), [Uniswap V4 router source](https://github.com/Uniswap/v4-periphery/blob/main/src/V4Router.sol), [Uniswap wrapped-error definition](https://github.com/Uniswap/v4-core/blob/main/src/libraries/CustomRevert.sol), and Rabby’s [universal-link configuration](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/constant/universalLink.ts) / [handler](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts). The supplied pinned guides/handoffs remain authoritative for the deployed network and wire format.

No real swap, approval, nap payout, refund withdrawal, claim redemption or failsafe was broadcast. No private key was accessed. Real browser extensions, hardware wallets, Coinbase passkey creation, physical iOS/Android wallet handoffs and all-RPC-down wallet-provider fallback were not exercised end to end. The mock receipt tests establish frontend control flow, not funded execution against deployed protocol code. Contracts and their existing Foundry tests were not modified or rerun by this frontend worker.

The actual published gateway/ENS URL is not provided to this worker. Open Graph image paths are relative and the bundled image is a real 1200 × 630 PNG; resolving absolute social-preview URLs on the final host is a publisher check. IPFS/ENS publication and the control plane’s immutable/named asset/config/RPC checks have not run and are not prerequisites to delivering this worker bundle.

## Completion

Implementation and worker validation are complete, with the path exception and unperformed live/device/publication checks stated above. Local Git staging and commit are unavailable: `git add` returned `.git/index.lock: Read-only file system`. No permission bypass was attempted; the files remain in the allowed paths for submission-bundle capture. Source, lockfile, necessary runtime assets, static export, generated deployment manifest and review evidence are retained. Dependencies, caches, registry mirrors and package archives are excluded from the Git submission. The byte/path budget is recorded in `submission-budget.json` after the final inventory.

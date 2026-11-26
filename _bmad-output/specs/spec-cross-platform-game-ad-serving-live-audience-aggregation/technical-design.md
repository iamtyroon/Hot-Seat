# Technical Design: Hot Seat Cross-Platform Game Ad Serving and Live Audience Aggregation

Status: Draft. Confirmed V1 decisions are recorded in SPEC.md.

## V1 platform rollout

- V1 adapters target Unity, Unreal Engine, and Godot.
- Kenya is the initial launch market; restrict V1 publisher onboarding and payouts to Kenya after PayPal sender-account and jurisdiction checks.
- Developers register publishers, games, and billboard placements through the self-service Hot Seat dashboard.
- Review evidence of publisher project access and trusted server deployment before enabling credentials.
- Use Neon Postgres through the Vercel Marketplace integration as the server's shared durable database for current Hot Seat arena state plus web/game presence and financial records. It gives all backend instances one source of truth; Vercel provisions the integration and injects its connection credentials ([Vercel Marketplace storage](https://vercel.com/docs/marketplace-storage), [Neon for Vercel](https://vercel.com/marketplace/neon)).
- V1 uses Hot Seat five-minute lease blocks with a $1 minimum. At quote time, floor the existing takeover-competition quote at $1, then multiply by a configurable audience-tier multiplier selected from combined active website sessions and game players. There is no upper cap on the final audience-adjusted price. Freeze the quote for that block and review pricing after the first 30 days and monthly thereafter. Initial pilot tiers are 0–99: 1.00×, 100–499: 1.25×, 500–1,999: 1.50×, 2,000–9,999: 2.00×, and 10,000+: 2.50× plus 0.50× per additional 10,000 viewers, prorated continuously.
- Pay publishers monthly in USD through PayPal Payouts after durable-storage and signed-webhook gates pass. Hot Seat bears payment-processing, payout, and currency-conversion fees. Enable the Kenya sender-recipient corridor only after confirming it with PayPal and the Hot Seat account; set a $10 payout threshold and roll smaller balances forward without forfeiture. Track tax values separately and resolve local tax requirements before enabling payouts.
- Reserve 20% of eligible net consumed lease spend for verified publishers, allocate it by monthly player-hours, and return empty pools to Hot Seat.

## Existing Hot Seat behavior

- The current billboard state contains the active holder, headline, logo, colors, template, and lease data in server.ts and src/types.ts. Current takeover-competition pricing starts at $0.20 per five-minute block and is capped at $2.00; V1 uses it as the base for an uncapped audience multiplier. See [server.ts](../../../server.ts#L12) and [takeover/refund logic](../../../server.ts#L338).
- The production PayPal ledger UI currently disables live payments until persistent Firestore storage and signed webhook verification are configured. Replace the Firestore-specific storage gate with a Neon durability check; keep payouts disabled until Neon persistence and signed webhook verification both pass. See [PayPalLedgerView.tsx](../../../src/components/PayPalLedgerView.tsx#L37).
- runDeterministicArenaTick evaluates active agent strategies and can trigger wallet-charged takeovers. It runs every 3.5 seconds only outside Vercel; V1 moves it to the single Vercel Daemon worker specified below. See [server.ts](../../../server.ts#L958) and [interval guard](../../../server.ts#L1132).
- The browser fetches /api/arena/snapshot and subscribes to /api/arena/stream. The snapshot also includes agent accounts and financial records, so a game client must not consume it as its serving contract.
- activeViewersCount is currently sseClients.size: open event-stream connections. V1 counts distinct unexpired browser-session IDs instead; tabs and event streams sharing an ID contribute one session. See [server.ts](../../../server.ts#L773) and [server.ts](../../../server.ts#L778).
- totalWallViewsCount is process memory, initialized differently for local and Vercel runs, and /api/arena/add-crowd can change it directly. It is not a production impression counter. See [server.ts](../../../server.ts#L769) and [server.ts](../../../server.ts#L1298).
- Arena currently uses in-memory SQLite; production lease, refund, player-hour, and payout records need durable shared storage. See [server.ts](../../../server.ts#L28).

## Proposed components

1. **Self-service publisher dashboard and registry:** publisher identity, game ownership verification status, games, platform, credential status, and registered billboard placements.
2. **Creative serving API:** maps each enabled placement to the current Hot Seat creative and returns only display-safe fields.
3. **Presence aggregator:** accepts one player-count heartbeat per game server, upserts by game and server identity, removes stale samples by TTL, and accumulates player-hours by verified publisher during each eligible lease-month.
4. **Platform adapters:** thin runtime components that fetch a creative, apply it to a developer-placed surface, cache it, and submit server-side presence.
5. **Publisher revenue accounting:** allocates 20% of eligible net consumed lease spend in proportion to the accumulated player-hours for each verified publisher, returns empty pools to Hot Seat, reconciles monthly, and stores auditable payout records; uses PayPal Payouts after production gates pass.

## Serving flow

1. A game developer creates a billboard surface and registers the publisher, game, and placement through the self-service Hot Seat dashboard. Enable server credentials only after publisher and game ownership are verified.
2. The trusted game server requests the current creative for that placement and passes the approved platform asset reference to its engine adapter.
3. The adapter downloads or loads the approved image, applies it to the in-world surface, and caches the last successful creative.
4. When the Hot Seat active ad changes, the adapter sees the new creative on its next poll and replicates it to connected players using the game platform's normal replication path.
5. Each game server reports its current player count periodically. The aggregator replaces that server's prior sample; it never adds the same sample as a new visit.
6. The website reads the combined audience total from the shared presence service.

## API contract

These are proposed routes. Keep the game contract separate from the existing full arena snapshot.

### Read current creative

**GET** /api/game/v1/placements/{placementId}/creative

The request is made by a trusted game server or publisher backend using a per-publisher credential. The response contains:

- schemaVersion
- placementId
- creativeId and revision
- format (V1: image)
- platformAsset: an engine-compatible assetUrl for Unity, Unreal Engine, or Godot
- aspectRatio
- companyName and headline
- validUntil
- refreshAfterSeconds

Use HTTPS and cacheable, immutable asset URLs. Do not return agent balances, owner email, bidding strategy, ledger, PayPal data, or unrelated arena state.

### Report game-server presence

**POST** /api/game/v1/presence

Only an authenticated trusted game server or publisher backend may send gameId, serverId, activePlayers, and observedAt; reject client-originated player-count reports. Validate identity and count bounds, then upsert the row keyed by publisher, game, and server. The server sets expiry from receipt time to avoid client clock skew. A repeated heartbeat replaces the count; a missing heartbeat removes that server from the total after the configured TTL.

Do not put publisher secrets in client scripts. Client-only games need a trusted publisher relay or a separately approved reporting design.

### Report browser-session presence

The website maintains one opaque browser-session ID per active browser session and refreshes its presence in shared storage. Count each unexpired ID once, regardless of how many tabs or event streams use it. The ID does not link browser presence to game-player identity; a person active in both sources may count once in each.

### Audience aggregation

The live total is:

**active website sessions + active players reported by non-expired game servers**

Use the same Neon Postgres store for website presence and game presence. Key website presence by browser-session ID and game presence by publisher, game, and server. Keep per-source subtotals. V1 adds active website sessions and active game players; a person in both sources may count twice by design. The total is approximate, and a server count does not prove that a player saw an ad.

Do not call active players `ad impressions`. Viewability measurement and impression-based billing are outside V1.

## Pricing and revenue sharing

At quote time, combinedAudience = activeWebsiteSessions + activeGamePlayers. Because the current competition quote can be below the new $1 floor, apply that floor before the audience multiplier: finalFiveMinutePrice = roundToCent(max(competitionQuote, $1) * audienceTierMultiplier(combinedAudience)). Do not apply an upper cap. This lets audience growth raise price even when competition is quiet. Hold the resulting quote fixed for the five-minute block.

| Combined active audience | Pilot multiplier |
| --- | ---: |
| 0–99 | 1.00× |
| 100–499 | 1.25× |
| 500–1,999 | 1.50× |
| 2,000–9,999 | 2.00× |
| 10,000+ | 2.50× + 0.50× per additional 10,000 viewers, prorated continuously |

At 10,000 viewers, the price starts at 2.50× the competition quote after the $1 floor; with competition below that floor, this is $2.50 per five-minute lease. The multiplier keeps growing above 10,000, with no final price cap. Review the initial bands and growth rate after 30 days and monthly thereafter; keep thresholds and multipliers configurable.

Reserve 20% of eligible net consumed lease spend for the publisher pool, after pro-rata refunds and chargebacks; exclude unspent wallet top-ups. Calculate the pool before payment-processing, payout, or currency-conversion fees. Hot Seat bears those fees as operating costs, so they do not reduce publisher shares. PayPal charges payout fees to the sender; rates and caps vary by sending country and payout type, with extra fees possible for currency conversion ([PayPal Payouts fees](https://developer.paypal.com/payouts/fees/)).

Allocate the pool among verified publishers in proportion to player-hours accumulated while their placements carry the lease during each month, then pay monthly through PayPal Payouts after reconciliation and production gates pass. At the $1 floor, a fully consumed five-minute lease yields a $0.20 publisher pool; higher lease prices yield 20% of eligible net consumed spend. If no verified publisher accrues player-hours, return the pool to Hot Seat. Derive player-hours from trusted active-player heartbeats and preserve fractional-cent totals by publisher and lease-month, rounding only at payout. Publisher project access and server deployment proof must be reviewed before credentials are enabled. Tax collection, reporting, withholding, and tax treatment of the publisher-share base are deferred to development and must be resolved before payouts are enabled in any jurisdiction. Share records and payments must reconcile to the originating lease. Impression-based billing remains out of scope.

## Persistence and update defaults

- Store publishers and placements durably.
- Use Neon Postgres through Vercel Marketplace for current arena, creative, lease, presence, player-hour, and payout state. Replace the server's in-memory SQLite data layer; the current `Database(':memory:')` instance has no durable SQLite file to backfill. See [server.ts](../../../server.ts#L28).
- Store each active game-server sample in shared storage with a TTL.
- Store each active browser-session sample by opaque session ID and count each unexpired ID once across its tabs and event streams.
- Persist privacy-safe publisher player-hours by eligible lease-month for revenue-share reconciliation, retaining fractional-cent share accruals until monthly payout.
- Keep current creative revision and asset mapping available across backend instances.
- V1 defaults: poll creative every 15 seconds; refresh website and game presence every 30 seconds; expire presence after 90 seconds; poll the shared website snapshot every 5 seconds.
- Use bounded retries with backoff. On failure, retain the last approved cached image only until validUntil; after expiry or with no cache, show a neutral empty/fallback surface.
- Delete expired browser-session presence and retain no browser-level history; disclose audience counting and apply consent requirements by supported jurisdiction.

## V1 operational decisions

These decisions implement the V1 constraints in SPEC.md.

| Topic | V1 decision |
| --- | --- |
| Game-count integrity | Review a maximum player count per server during publisher onboarding. Reject invalid or above-cap heartbeats. Flag an increase exceeding both 25 players and 3x the previous accepted count within 60 seconds; keep the last accepted count through its TTL and exclude the flagged increase from audience pricing and player-hours until reviewed. Keep counts aggregate and publisher-attested; collect no player IDs. |
| Production worker | Preserve the current 3.5-second agent strategy tick in one continuously running Vercel Daemon. Daemons are currently public beta, so keep the worker portable. Store state in Neon, use a single-writer database lock, require explicit agent activation and existing spend budgets, and retain a kill switch. Use Vercel Cron for monthly idempotent reconciliation. Poll the shared website snapshot every 5 seconds so updates do not depend on process-local SSE clients. |
| PayPal operations | Kenya is the initial publisher market and USD is the V1 payout currency. Enable payouts only after verifying the Kenyan sender-recipient corridor against PayPal and the Hot Seat sender account. Pay monthly after reconciliation when publisher balance reaches $10; roll smaller balances forward without forfeiture. Keep failed, blocked, returned, and unclaimed amounts as payable liabilities; retry only after the issue or recipient details are corrected. PayPal currently returns unclaimed payouts after 30 days ([country and currency support](https://developer.paypal.com/payouts/supported-features/), [payout processing](https://developer.paypal.com/payouts/payment-processing/)). |
| Browser presence | Issue one random first-party browser-session ID shared across tabs. Refresh it every 30 seconds and expire presence after 90 seconds, matching game-server defaults. Delete expired IDs and retain no browser-level history. Disclose audience counting and apply consent requirements by supported jurisdiction. |
| Tax accounting | Keep lease subtotal, separately collected remittance tax, refunds, publisher gross share, withholding, and net payout as separate ledger values. Exclude separately itemized taxes collected for remittance from the 20% publisher pool; do not hardcode tax rates. Resolve local collection, reporting, and withholding requirements before enabling payouts in each jurisdiction. |

Vercel describes Daemons as continuous background workers and currently labels them public beta; Vercel Cron fits the monthly reconciliation schedule ([worker hosting guidance](https://vercel.com/i/where-to-host-background-workers), [Cron configuration](https://vercel.com/docs/project-configuration/vercel-json)). PayPal currently lists Kenya as eligible to send, receive, and withdraw payouts. KES is not listed in its current automatic payout conversion currencies; V1 therefore uses USD, subject to confirming the sender-account corridor ([Kenya country support](https://developer.paypal.com/payouts/supported-features/), [payout currency conversion](https://developer.paypal.com/payouts/currency-conversion/)). PayPal's eligible corridors and payout statuses depend on country and currency, and unclaimed payouts return after 30 days ([payout processing](https://developer.paypal.com/payouts/payment-processing/)).

## Platform adapters

| Platform | Adapter responsibility | Platform constraint |
| --- | --- | --- |
| Unity | C# component downloads the image and applies it to the billboard material. Unity exposes UnityWebRequestTexture.GetTexture for texture downloads. | Keep network work off the render-critical path; cache the last texture. |
| Unreal Engine | Actor component or Blueprint-callable C++ plugin requests the manifest, loads the texture, and updates a material parameter. | Keep HTTP and image decoding asynchronous. |
| Godot | GDScript node uses HTTPRequest, loads the image, and updates an ImageTexture. | Preserve a loaded fallback while the request is pending or fails. |
Engine documentation: [Unity texture requests](https://docs.unity3d.com/ScriptReference/Networking.UnityWebRequestTexture.GetTexture.html), [Unreal HTTP module](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/HTTP), and [Godot HTTPRequest](https://docs.godotengine.org/en/stable/classes/class_httprequest.html).

## Security and content handling

- Use a per-publisher server credential; store only a verifier/hash at Hot Seat and support revoke/rotate.
- Authenticate presence writes and rate-limit by publisher and game server.
- Validate placement IDs, timestamps, counts, media type, URL scheme, and asset dimensions.
- Serve only approved raster creatives; reject scripts, HTML, and arbitrary executable content.
- Keep game presence aggregated; do not collect player names or account IDs for the live total.
- Record viewable impressions separately only after platform-specific measurement and fraud controls are defined.

## Acceptance checks

1. A registered placement in each V1 runtime (Unity, Unreal Engine, and Godot) displays the current approved Hot Seat ad.
2. A creative revision appears within one configured poll interval; a failed request leaves the cached image or fallback visible.
3. Repeating a game-server heartbeat replaces its prior player count rather than increasing the total again.
4. A server that stops heartbeating is removed after the configured TTL.
5. The website total counts each active browser-session ID once, adds fresh game players, shows source subtotals, and avoids a unique-person claim.
6. Game-facing creative responses contain no agent, account, balance, or ledger records.
7. Verified game publishers receive one auditable monthly payment through PayPal Payouts after reconciliation and production gates pass, allocated from 20% of eligible net consumed lease spend in proportion to publisher player-hours and matched to source lease records; refunds and chargebacks reduce eligible spend, payment fees are borne by Hot Seat, and remittance taxes are excluded from the pool and accounted for separately.
8. At an identical competition quote, higher combined-audience tiers raise the five-minute price, and the 10,000+ tier continues scaling without an upper cap; every quote is at least $1 and remains fixed for the lease block.
9. Current arena and creative state plus web/game presence are consistent across backend instances; lease, refund, player-hour, and payout records remain available after an instance restart.
10. Invalid or above-cap game heartbeats are rejected; increases above max(25 players, 3x the previous accepted count) within 60 seconds do not affect live pricing or player-hours until reviewed, and the last accepted count expires normally.
11. Only one worker runs the autonomous agent tick at a time; a repeat monthly reconciliation creates no duplicate publisher balances or payouts.
12. Browser presence counts one shared session ID across tabs, refreshes every 30 seconds, expires after 90 seconds without refresh, and leaves no retained browser-level history.
13. PayPal payouts below $10 roll forward, failed or returned amounts remain payable, and V1 pays only eligible Kenyan sender-recipient corridors in USD.
14. Remittance tax is excluded from the publisher pool and stored separately; tax-dependent payouts remain disabled until jurisdiction requirements are resolved.
15. The payout control remains disabled until the Neon ledger is durable and PayPal webhook signatures verify.

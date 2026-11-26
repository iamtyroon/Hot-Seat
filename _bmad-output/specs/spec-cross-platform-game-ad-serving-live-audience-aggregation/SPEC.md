---
id: SPEC-cross-platform-game-ad-serving-live-audience-aggregation
companions:
  - technical-design.md
sources: []
---

# Hot Seat Cross-Platform Game Ad Serving and Live Audience Aggregation

## Why

Opportunity: extend Hot Seat's live billboard into developer-placed game surfaces in Unity, Unreal Engine, and Godot, and include participating games' active audiences in the website's live audience total.

## Capabilities

- **CAP-1: Register game placements**
  - **intent:** Game developers can associate fixed in-game billboard surfaces with Hot Seat.
  - **success:** Each enabled surface has a stable game and placement identity and can retrieve its assigned creative.
- **CAP-2: Show live Hot Seat creative**
  - **intent:** Players can see the current approved Hot Seat ad on a registered game billboard.
  - **success:** An active-ad change reaches each enabled placement within its configured refresh window; a serving failure does not stall gameplay.
- **CAP-3: Combine live audiences**
  - **intent:** Website visitors can see active website sessions and participating game players in one live audience total.
  - **success:** Each active browser-session ID contributes once; a game server heartbeat replaces its previous count, contributes once, and expires after its configured freshness period. Presence is consistent across backend instances.
- **CAP-4: Share revenue with game developers**
  - **intent:** Verified publishers receive a share of eligible revenue associated with their registered game placements.
  - **success:** Each verified publisher receives a monthly payment equal to its player-hour share of 20% of eligible net consumed lease spend; payments reconcile to source leases, and pools with no verified player-hours return to Hot Seat.

## Constraints

- Launch in Unity, Unreal Engine, and Godot.
- Set Kenya as the initial launch market; limit V1 publisher onboarding and payout eligibility to Kenya, subject to PayPal sender-account and jurisdiction readiness.
- Developers register publishers, games, and billboard placements through a self-service dashboard.
- Count every active player on participating game servers in the live audience, regardless of billboard visibility; viewable impressions remain separate.
- Use one random first-party browser-session ID shared across tabs. Refresh presence every 30 seconds, expire it after 90 seconds, delete expired IDs, and retain no browser-level history. Disclose audience counting and apply consent requirements by supported jurisdiction. Add website sessions and game players independently; a person in both sources may count twice.
- Review a maximum player count per game server during publisher onboarding; reject invalid and above-cap heartbeats. Flag increases above max(25 players, 3x the previous accepted count) within 60 seconds, retain the last accepted count through its TTL, and exclude flagged increases from audience pricing and player-hours until reviewed. Do not collect player IDs.
- Serve one global active Hot Seat ad across registered placements in V1.
- Use Neon Postgres through Vercel Marketplace as shared durable storage, replacing the server's in-memory SQLite data layer.
- Run the current 3.5-second agent strategy tick in one continuously running Vercel Daemon worker using a Neon-backed single-writer lock. Require explicit agent activation, enforce existing spend budgets, and retain a kill switch. Reconcile monthly through idempotent Vercel Cron and poll shared website snapshots every 5 seconds.
- Use Hot Seat five-minute lease blocks with a $1 minimum. At quote time, apply the $1 floor to the takeover-competition quote, then multiply by a tier selected from combined active website sessions and game players. Pilot tiers: 0–99: 1.00×, 100–499: 1.25×, 500–1,999: 1.50×, 2,000–9,999: 2.00×, and 10,000+: 2.50× plus 0.50× for each additional 10,000 viewers, prorated continuously. Do not cap the final audience-adjusted price. Freeze the quote for that five-minute block and review pricing after the first 30 days and monthly thereafter; keep bands and multipliers configurable.
- Reserve 20% of consumed lease spend for verified game developers after pro-rata refunds and chargebacks; exclude unspent wallet top-ups and separately itemized taxes collected for remittance. Calculate the pool before payment-processing, payout, or currency-conversion fees; Hot Seat bears those fees as operating costs. Allocate by monthly player-hours; a pool with no verified publisher player-hours returns to Hot Seat.
- Pay monthly through PayPal Payouts in USD after reconciliation and production gates pass. Enable Kenyan payouts only after confirming the sender-recipient corridor with PayPal and the Hot Seat account. Pay when publisher balance reaches $10; roll smaller balances forward without forfeiture. Keep failed, blocked, returned, and unclaimed amounts payable; retry after the issue or recipient details are corrected.
- Keep lease subtotal, remittance tax, refunds, publisher gross share, withholding, and net payout as separate ledger values. Do not hardcode tax rates; resolve local collection, reporting, and withholding requirements before enabling payouts in each jurisdiction.
- Review project access and server deployment proof before enabling publisher credentials; credentials and presence reports stay on trusted game servers or publisher backends; public game clients cannot submit player counts.
- Audience and placement state must be shared across backend instances; process-local counts are insufficient.
- Publisher payouts require confirmed lease collections, a durable financial ledger, and verified payment webhooks.
- Revenue-share reconciliation retains aggregate player-hours per publisher and eligible lease-month; live TTL presence rows alone are insufficient.

## Non-goals

- Video, rewarded, or interactive ads.
- Per-player ad targeting or cross-platform unique-person tracking.
- Impression-based billing.

## Success signal

A verified developer can register a publisher, game, and placements through the self-service dashboard; test placements in Unity, Unreal Engine, and Godot show the current global Hot Seat creative; the five-minute lease floor is $1, and higher combined-audience tiers raise the competition-derived quote without an upper price cap. In the 10,000+ tier, price continues to rise with each additional viewer. The website total combines website sessions with fresh game-server player counts, updates without double-adding repeated heartbeats, and removes stale game servers. Monthly revenue-share payments allocate 20% of eligible net consumed lease spend in proportion to verified publisher player-hours and reconcile to source leases; pools with no eligible player-hours return to Hot Seat. When ad delivery fails, the game keeps rendering a cached creative or a safe fallback.

## Assumptions

- V1 uses static image creatives derived from the current Hot Seat ad.
- Creative polling defaults to 15 seconds; game presence heartbeats default to 30 seconds and expire after 90 seconds.



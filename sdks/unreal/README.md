# Unreal Engine game ads setup

Guide for connecting an Unreal Engine game to Hot Seat's game ad service.

## Service details

- Production API origin: `https://hotseat-three.vercel.app`
- Publisher portal: [Hot Seat](https://hotseat-three.vercel.app/)
- V1 engine: Unreal Engine
- V1 publisher market: Kenya
- Game and placement registrations are approved automatically after the publisher is verified. Hot Seat can still reject a game or disable a placement for policy or trust issues.

### Stop before onboarding if durable storage is not ready

Open `https://hotseat-three.vercel.app/api/game-ads/health`. Continue only when it returns JSON with `"ok":true` and `"durableStorage":true`. If `durableStorage` is false, contact the Hot Seat operator; publisher records, placements, and server credentials need a production database. Do not issue or deploy server credentials against an in-memory database.

The production Vercel project currently has no `DATABASE_URL`, `NEON_DATABASE_URL`, or `POSTGRES_URL` configured. The operator must connect durable Neon storage and redeploy before this integration can complete credential issuance.

Publisher verification and payout/tax checks are separate. Automatic game and placement approval does not verify a publisher or enable payouts.

## 1. Get the publisher verified

The publisher owner or authorized studio representative does this once:

1. Open the Publisher Dashboard from [Hot Seat](https://hotseat-three.vercel.app/) and sign in with Google.
2. Submit the publisher or studio name and evidence for Kenya eligibility, project access, and trusted dedicated-server deployment.
3. Wait for Hot Seat to verify the publisher. This check remains manual. V1 onboarding is limited to Kenya.

Do not put passwords, private keys, or server credentials in evidence fields. Give enough detail for Hot Seat to verify the claim.

## 2. Register the game and placement

After publisher status shows `verified`:

1. In the Publisher Dashboard, register a game. Select **Unreal Engine**, set the maximum active players for one dedicated server, and provide project access evidence.
2. The game becomes `verified` immediately. Save its game ID.
3. Add a placement for the billboard surface. Use a descriptive stable name, such as `main-menu-billboard`, and enter the surface aspect ratio. The placement becomes enabled immediately. Save its placement ID.
4. Issue a server credential for a stable server ID, such as `prod-eu-01`. Save the credential when shown; it is displayed once. Issue a separate credential for each dedicated server ID.

The player cap must match the game's real maximum. Hot Seat rejects presence reports above the registered cap. At least one enabled placement and durable storage are required before a server credential can be issued.

## 3. Install the Unreal plugin

1. Copy this repository's `sdks/unreal` folder into the game project as `MyGame/Plugins/HotSeatGameAds`.
2. Enable **Hot Seat Game Ads** in Unreal's Plugins window and restart the editor. Alternatively, add this entry to the existing `Plugins` array in the `.uproject` file:

   ```json
   { "Name": "HotSeatGameAds", "Enabled": true }
   ```

3. Regenerate project files and build the editor and dedicated-server targets. The plugin declares its HTTP, JSON, image, and UI module dependencies.
4. If game C++ code references plugin classes, add `"HotSeatGameAds"` to that game module's dependencies in its `.Build.cs` file. Use `PublicDependencyModuleNames` when a public game header exposes plugin types; otherwise use `PrivateDependencyModuleNames`.

## 4. Display the ad on the billboard

1. Add `HotSeatAdSurfaceComponent` to the actor that owns the billboard mesh.
2. Set `ApiBaseUrl` to `https://hotseat-three.vercel.app`, set `PlacementId` to the ID from the Publisher Dashboard, and assign a local `FallbackTexture`.
3. Create a Dynamic Material Instance for the billboard mesh.
4. Bind the component's `OnCreativeReady` event. In its Blueprint event, call `Set Texture Parameter Value` on the Dynamic Material Instance; use the texture parameter name from the billboard material and the event's `Texture` value. For example, name that material parameter `HotSeatAdTexture` and use the same exact name in the node.
5. Make the material's initial texture a safe fallback and confirm the billboard mesh UVs fit the chosen aspect ratio.

The ad surface fetches the public image manifest every 15 seconds. It uses HTTPS, accepts raster PNG assets, keeps a valid cached texture until expiry, and shows the fallback if a request fails. No server credential belongs on this component or in the public game client.

## 5. Report audience from the dedicated server

1. Add `HotSeatPresenceReporterComponent` to a server-only actor, such as the game's `GameMode`.
2. Set `ApiBaseUrl`, `GameId`, and `PlacementId` on the component.
3. Configure these values as secret environment variables in the dedicated-server host:

   ```text
   HOTSEAT_GAME_SERVER_CREDENTIAL=<credential shown once in Publisher Dashboard>
   HOTSEAT_SERVER_ID=prod-eu-01
   ```

   `HOTSEAT_SERVER_ID` must exactly match the ID used when issuing that credential. Store the credential in the host's secret manager; never put it in the client build, `.ini` files shipped to players, source control, logs, or screenshots.
4. On the authoritative server, call `SetActivePlayerCount()` on `PostLogin` and `Logout`, passing the current active player count from GameMode/GameState. Do not send player names, account IDs, or counts supplied directly by clients. Keep the reported count within the registered player cap.
5. Run the dedicated server with accurate system time and HTTPS egress to `hotseat-three.vercel.app`. The component reads its environment variables at startup, so restart the server after setting or rotating a credential.

Presence reporting runs immediately and then every 30 seconds. The component reports only in `NM_DedicatedServer`; editor listen-server sessions do not report audience. A heartbeat timestamp more than two minutes from server time is rejected. Presence expires after 90 seconds without a heartbeat.

### Optional impression reporting

`AddViewableImpressions()` is separate from live audience and publisher revenue share. Leave it unused unless the game has a defined server-side measurement flow that validates client view callbacks. Never accept a client-submitted impression count as trusted.

## 6. Verify the integration

1. Confirm the health check reports `ok: true` and `durableStorage: true`.
2. In the dashboard, confirm the game is `verified` and the placement is enabled.
3. Run a dedicated server with its credential and a client build with the ad surface. Confirm the client's billboard receives the current global Hot Seat creative, or keeps the fallback when no creative is active.
4. Join and leave with test players. Confirm `SetActivePlayerCount()` follows the server's authoritative count and the live audience total updates after a heartbeat.
5. Confirm the server credential remains absent from client files and packaged builds.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Health reports `durableStorage: false` | Stop. Hot Seat operator must connect the production database before credentials can be issued. |
| Credential issuance returns an error | Confirm publisher is verified, game is verified, a placement is enabled, and durable storage is ready. |
| Heartbeats return unauthorized/forbidden | Confirm dedicated-server mode, game ID, credential, and exact server ID match. Check that the publisher and game remain verified. |
| Presence reports are rejected | Keep the count at or below the registered cap and synchronize the server clock. |
| Billboard shows fallback | Confirm API origin, placement ID, HTTPS egress, and that a global creative is active. The fallback is expected when no active creative exists. |
| New credential does not work | Confirm it was stored in the dedicated-server secret manager and restart the server after updating it. |

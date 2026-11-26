# Godot SDK

Add `HotSeatAdSurface.gd` to a `TextureRect`, set the approved placement ID, and assign a safe fallback texture. It polls the public image manifest every 15 seconds, caches PNG textures until `validUntil`, and falls back after expiry. The SDK uses image assets only; it does not execute HTML or navigate to advertiser URLs.

Add `HotSeatPresenceReporter.gd` to a trusted dedicated-server scene. Set `HOTSEAT_GAME_SERVER_CREDENTIAL` and `HOTSEAT_SERVER_ID` in the server environment. Call `set_active_player_count()` from the server's authoritative player registry. Call `add_viewable_impressions()` after server-side aggregation of client view callbacks. Never place the credential in a public client export or repository.

Presence heartbeats run every 30 seconds only in a `dedicated_server` or headless build. Issue one credential per stable `HOTSEAT_SERVER_ID`; the backend binds each token to that ID. Viewable impressions remain separate from active audience pricing and publisher revenue share.

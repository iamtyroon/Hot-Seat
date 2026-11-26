# Unity SDK

Add `HotSeatAdSurface.cs` to a `RawImage` in the scene and set its approved placement ID. It polls the global image manifest every 15 seconds, keeps the last raster texture until `validUntil`, and uses the assigned fallback texture after expiry. It renders only PNG image assets; it does not interpret HTML or navigate to advertiser URLs.

Add `HotSeatPresenceReporter.cs` only to a Unity dedicated-server build that defines `UNITY_SERVER`. Issue one credential per stable server ID, then set `HOTSEAT_GAME_SERVER_CREDENTIAL`, `HOTSEAT_SERVER_ID`, and `HOTSEAT_PLACEMENT_ID` in that server's environment. Replace `GetServerPlayerCount()` with the server's authoritative player registry. Never ship the credential in a client build or repository.

The server reporter sends active-player heartbeats every 30 seconds. Call `AddViewableImpressions(count)` from the server after aggregating view callbacks from clients. Viewable impressions are a separate metric; they do not set audience pricing or publisher revenue share.

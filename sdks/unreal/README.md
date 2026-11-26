# Unreal Engine SDK

Enable `HotSeatGameAds.uplugin` in the project. Add `HotSeatAdSurfaceComponent` to a client actor, set the approved placement ID and fallback texture, and bind `OnCreativeReady` to the material or widget that displays the returned texture. It polls the public manifest every 15 seconds, caches raster PNG until expiry, and only applies image textures.

Add `HotSeatPresenceReporterComponent` only to the dedicated server's game-mode actor. Issue one credential per stable `HOTSEAT_SERVER_ID`, set it and `HOTSEAT_SERVER_ID` in the server environment, set the reviewed game and placement IDs, and update `SetActivePlayerCount()` from the authoritative server player list. Call `AddViewableImpressions()` only after server-side aggregation of client view callbacks. Never ship the credential to public clients or commit it.

Server presence refreshes every 30 seconds. Viewable impressions stay separate from audience pricing and publisher revenue share.

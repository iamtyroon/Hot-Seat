using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

[Serializable]
public sealed class HotSeatCreativeManifest
{
    public string format;
    public string validUntil;
    public int refreshAfterSeconds;
    public HotSeatPlatformAsset platformAsset;
}

[Serializable]
public sealed class HotSeatPlatformAsset
{
    public string assetUrl;
}

public sealed class HotSeatAdSurface : MonoBehaviour
{
    [SerializeField] private RawImage target;
    [SerializeField] private string apiBaseUrl = "https://hotseat.vercel.app";
    [SerializeField] private string placementId;
    [SerializeField] private Texture fallbackTexture;

    private Texture2D cachedTexture;
    private DateTime cachedValidUntilUtc = DateTime.MinValue;

    private IEnumerator Start()
    {
        if (target == null) target = GetComponent<RawImage>();
        if (target == null) yield break;
        target.texture = fallbackTexture;
        while (true)
        {
            yield return RefreshCreative();
            yield return new WaitForSeconds(15f);
        }
    }

    private IEnumerator RefreshCreative()
    {
        if (string.IsNullOrWhiteSpace(placementId) || !TryGetHttpsBase(out var baseUri)) yield break;
        var manifestUrl = new Uri(baseUri, "/api/game-ads/placements/" + UnityWebRequest.EscapeURL(placementId) + "/creative");
        using (var request = UnityWebRequest.Get(manifestUrl.AbsoluteUri))
        {
            request.timeout = 5;
            yield return request.SendWebRequest();
            if (request.result != UnityWebRequest.Result.Success) { ApplyValidCacheOrFallback(); yield break; }

            HotSeatCreativeManifest manifest;
            try { manifest = JsonUtility.FromJson<HotSeatCreativeManifest>(request.downloadHandler.text); }
            catch { ApplyValidCacheOrFallback(); yield break; }
            if (manifest == null || manifest.format != "image" || manifest.platformAsset == null || string.IsNullOrEmpty(manifest.platformAsset.assetUrl) ||
                !DateTime.TryParse(manifest.validUntil, null, System.Globalization.DateTimeStyles.AdjustToUniversal, out var manifestValidUntilUtc))
            { ApplyValidCacheOrFallback(); yield break; }

            if (DateTime.UtcNow >= manifestValidUntilUtc) { ApplyValidCacheOrFallback(); yield break; }
            if (!Uri.TryCreate(baseUri, manifest.platformAsset.assetUrl, out var assetUri) || assetUri.Scheme != Uri.UriSchemeHttps)
            { ApplyValidCacheOrFallback(); yield break; }

            using (var assetRequest = UnityWebRequest.Get(assetUri.AbsoluteUri))
            {
                assetRequest.timeout = 5;
                yield return assetRequest.SendWebRequest();
                if (assetRequest.result != UnityWebRequest.Result.Success) { ApplyValidCacheOrFallback(); yield break; }
                var image = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                if (!image.LoadImage(assetRequest.downloadHandler.data, false))
                { Destroy(image); ApplyValidCacheOrFallback(); yield break; }
                if (DateTime.UtcNow >= manifestValidUntilUtc)
                { Destroy(image); ApplyValidCacheOrFallback(); yield break; }
                if (cachedTexture != null) Destroy(cachedTexture);
                cachedTexture = image;
                cachedValidUntilUtc = manifestValidUntilUtc;
                target.texture = cachedTexture;
            }
        }
    }

    private bool TryGetHttpsBase(out Uri baseUri)
    {
        return Uri.TryCreate(apiBaseUrl, UriKind.Absolute, out baseUri) && baseUri.Scheme == Uri.UriSchemeHttps;
    }

    private void ApplyValidCacheOrFallback()
    {
        target.texture = cachedTexture != null && DateTime.UtcNow < cachedValidUntilUtc ? cachedTexture : fallbackTexture;
    }

    private void OnDestroy()
    {
        if (cachedTexture != null) Destroy(cachedTexture);
    }
}

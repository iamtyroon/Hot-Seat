using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

public sealed class HotSeatPresenceReporter : MonoBehaviour
{
    [SerializeField] private string apiBaseUrl = "https://hotseat.vercel.app";
    [SerializeField] private string gameId;
    [SerializeField] private string serverId;

    private string credential;
    private int pendingViewableCount;
    private int activePlayers;

    public void SetActivePlayerCount(int count) => activePlayers = Mathf.Max(0, count);

    private IEnumerator Start()
    {
#if !UNITY_SERVER
        yield break;
#else
        credential = Environment.GetEnvironmentVariable("HOTSEAT_GAME_SERVER_CREDENTIAL");
        if (string.IsNullOrWhiteSpace(serverId)) serverId = Environment.GetEnvironmentVariable("HOTSEAT_SERVER_ID");
        while (true)
        {
            yield return ReportPresence();
            yield return new WaitForSeconds(30f);
        }
#endif
    }

    // Call only from the trusted dedicated server after aggregating client view callbacks.
    public void AddViewableImpressions(int count)
    {
        if (count > 0) pendingViewableCount = Mathf.Min(pendingViewableCount + Mathf.Min(count, 100000), 100000);
    }

    private IEnumerator ReportPresence()
    {
        if (string.IsNullOrEmpty(credential) || string.IsNullOrEmpty(serverId) || string.IsNullOrEmpty(gameId) ||
            !Uri.TryCreate(apiBaseUrl, UriKind.Absolute, out var baseUri) || baseUri.Scheme != Uri.UriSchemeHttps) yield break;

        var payload = JsonUtility.ToJson(new PresencePayload { serverId = serverId, activePlayers = activePlayers, observedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
        using (var request = UnityWebRequest.Put(new Uri(baseUri, "/api/game-ads/games/" + UnityWebRequest.EscapeURL(gameId) + "/presence").AbsoluteUri, payload))
        {
            request.method = UnityWebRequest.kHttpVerbPOST;
            request.timeout = 5;
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("Authorization", "Bearer " + credential);
            yield return request.SendWebRequest();
        }

        if (pendingViewableCount <= 0) yield break;
        var placementId = Environment.GetEnvironmentVariable("HOTSEAT_PLACEMENT_ID");
        if (string.IsNullOrEmpty(placementId)) yield break;
        var reportedCount = pendingViewableCount;
        var impressions = JsonUtility.ToJson(new ImpressionPayload { serverId = serverId, viewableCount = reportedCount, observedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
        using (var request = UnityWebRequest.Put(new Uri(baseUri, "/api/game-ads/placements/" + UnityWebRequest.EscapeURL(placementId) + "/impressions").AbsoluteUri, impressions))
        {
            request.method = UnityWebRequest.kHttpVerbPOST;
            request.timeout = 5;
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("Authorization", "Bearer " + credential);
            yield return request.SendWebRequest();
            if (request.result == UnityWebRequest.Result.Success) pendingViewableCount = Mathf.Max(0, pendingViewableCount - reportedCount);
        }
    }

    [Serializable] private sealed class PresencePayload { public string serverId; public int activePlayers; public long observedAt; }
    [Serializable] private sealed class ImpressionPayload { public string serverId; public int viewableCount; public long observedAt; }
}

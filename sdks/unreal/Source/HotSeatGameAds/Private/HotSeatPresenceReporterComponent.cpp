#include "HotSeatPresenceReporterComponent.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Json.h"
#include "HAL/PlatformMisc.h"
#include "GenericPlatform/GenericPlatformHttp.h"

UHotSeatPresenceReporterComponent::UHotSeatPresenceReporterComponent()
{
    PrimaryComponentTick.bCanEverTick = false;
}

void UHotSeatPresenceReporterComponent::BeginPlay()
{
    Super::BeginPlay();
    if (!GetWorld() || GetWorld()->GetNetMode() != NM_DedicatedServer) return;
    Credential = FPlatformMisc::GetEnvironmentVariable(TEXT("HOTSEAT_GAME_SERVER_CREDENTIAL"));
    ServerId = FPlatformMisc::GetEnvironmentVariable(TEXT("HOTSEAT_SERVER_ID"));
    if (!Credential.IsEmpty() && !ServerId.IsEmpty() && !GameId.IsEmpty() && ApiBaseUrl.StartsWith(TEXT("https://")))
    {
        ReportPresence();
        GetWorld()->GetTimerManager().SetTimer(ReportTimer, this, &UHotSeatPresenceReporterComponent::ReportPresence, 30.0f, true);
    }
}

void UHotSeatPresenceReporterComponent::SetActivePlayerCount(int32 Count)
{
    ActivePlayers = FMath::Max(0, Count);
}

void UHotSeatPresenceReporterComponent::AddViewableImpressions(int32 Count)
{
    if (Count > 0) PendingViewableCount = FMath::Min(PendingViewableCount + FMath::Min(Count, 100000), 100000);
}

void UHotSeatPresenceReporterComponent::ReportPresence()
{
    FString Root = ApiBaseUrl; Root.RemoveFromEnd(TEXT("/"));
    const int64 NowMs = FDateTime::UtcNow().ToUnixTimestamp() * 1000;
    TSharedRef<FJsonObject> Body = MakeShared<FJsonObject>();
    Body->SetStringField(TEXT("serverId"), ServerId);
    Body->SetNumberField(TEXT("activePlayers"), ActivePlayers);
    Body->SetNumberField(TEXT("observedAt"), NowMs);
    FString BodyText;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&BodyText);
    FJsonSerializer::Serialize(Body, Writer);
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(FString::Printf(TEXT("%s/api/game-ads/games/%s/presence"), *Root, *FGenericPlatformHttp::UrlEncode(GameId)));
    Request->SetVerb(TEXT("POST")); Request->SetTimeout(5.0f);
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->SetHeader(TEXT("Authorization"), TEXT("Bearer ") + Credential);
    Request->SetContentAsString(BodyText);
    Request->ProcessRequest();
    ReportImpressions();
}

void UHotSeatPresenceReporterComponent::ReportImpressions()
{
    if (PendingViewableCount <= 0 || PlacementId.IsEmpty()) return;
    FString Root = ApiBaseUrl; Root.RemoveFromEnd(TEXT("/"));
    const int32 ReportedCount = PendingViewableCount;
    TSharedRef<FJsonObject> Body = MakeShared<FJsonObject>();
    Body->SetStringField(TEXT("serverId"), ServerId);
    Body->SetNumberField(TEXT("viewableCount"), ReportedCount);
    Body->SetNumberField(TEXT("observedAt"), FDateTime::UtcNow().ToUnixTimestamp() * 1000);
    FString BodyText;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&BodyText);
    FJsonSerializer::Serialize(Body, Writer);
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(FString::Printf(TEXT("%s/api/game-ads/placements/%s/impressions"), *Root, *FGenericPlatformHttp::UrlEncode(PlacementId)));
    Request->SetVerb(TEXT("POST")); Request->SetTimeout(5.0f);
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->SetHeader(TEXT("Authorization"), TEXT("Bearer ") + Credential);
    Request->SetContentAsString(BodyText);
    TWeakObjectPtr<UHotSeatPresenceReporterComponent> WeakThis(this);
    Request->OnProcessRequestComplete().BindLambda([WeakThis, ReportedCount](FHttpRequestPtr, FHttpResponsePtr Response, bool bSucceeded)
    {
        if (WeakThis.IsValid() && bSucceeded && Response.IsValid() && EHttpResponseCodes::IsOk(Response->GetResponseCode()))
            WeakThis->PendingViewableCount = FMath::Max(0, WeakThis->PendingViewableCount - ReportedCount);
    });
    Request->ProcessRequest();
}

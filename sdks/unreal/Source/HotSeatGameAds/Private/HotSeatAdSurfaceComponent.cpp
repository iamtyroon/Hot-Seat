#include "HotSeatAdSurfaceComponent.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Json.h"
#include "IImageWrapper.h"
#include "IImageWrapperModule.h"
#include "Modules/ModuleManager.h"
#include "HAL/UnrealMemory.h"
#include "GenericPlatform/GenericPlatformHttp.h"

UHotSeatAdSurfaceComponent::UHotSeatAdSurfaceComponent()
{
    PrimaryComponentTick.bCanEverTick = false;
}

void UHotSeatAdSurfaceComponent::BeginPlay()
{
    Super::BeginPlay();
    CurrentTexture = FallbackTexture;
    OnCreativeReady.Broadcast(CurrentTexture);
    if (GetWorld() && GetWorld()->GetNetMode() != NM_DedicatedServer)
    {
        RefreshCreative();
        GetWorld()->GetTimerManager().SetTimer(RefreshTimer, this, &UHotSeatAdSurfaceComponent::RefreshCreative, 15.0f, true);
    }
}

void UHotSeatAdSurfaceComponent::RefreshCreative()
{
    if (PlacementId.IsEmpty() || !ApiBaseUrl.StartsWith(TEXT("https://"))) { ApplyCachedOrFallback(); return; }
    FString Root = ApiBaseUrl; Root.RemoveFromEnd(TEXT("/"));
    const FString Url = FString::Printf(TEXT("%s/api/game-ads/placements/%s/creative"), *Root, *FGenericPlatformHttp::UrlEncode(PlacementId));
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(Url);
    Request->SetVerb(TEXT("GET"));
    Request->SetTimeout(5.0f);
    TWeakObjectPtr<UHotSeatAdSurfaceComponent> WeakThis(this);
    Request->OnProcessRequestComplete().BindLambda([WeakThis](FHttpRequestPtr Completed, FHttpResponsePtr Response, bool bSucceeded)
    {
        if (WeakThis.IsValid()) WeakThis->HandleManifest(Completed, Response, bSucceeded);
    });
    Request->ProcessRequest();
}

void UHotSeatAdSurfaceComponent::HandleManifest(FHttpRequestPtr, FHttpResponsePtr Response, bool bSucceeded)
{
    if (!bSucceeded || !Response.IsValid() || !EHttpResponseCodes::IsOk(Response->GetResponseCode())) { ApplyCachedOrFallback(); return; }
    TSharedPtr<FJsonObject> Manifest;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());
    FString Format;
    if (!FJsonSerializer::Deserialize(Reader, Manifest) || !Manifest.IsValid() || !Manifest->TryGetStringField(TEXT("format"), Format) || Format != TEXT("image"))
    { ApplyCachedOrFallback(); return; }

    FString ValidUntil;
    FString AssetUrl;
    TSharedPtr<FJsonObject> PlatformAsset;
    if (!Manifest->TryGetStringField(TEXT("validUntil"), ValidUntil) || !FDateTime::ParseIso8601(*ValidUntil, PendingValidUntilUtc) ||
        !Manifest->TryGetObjectField(TEXT("platformAsset"), PlatformAsset) || !PlatformAsset.IsValid() ||
        !PlatformAsset->TryGetStringField(TEXT("assetUrl"), AssetUrl))
    { ApplyCachedOrFallback(); return; }
    FString Root = ApiBaseUrl; Root.RemoveFromEnd(TEXT("/"));
    const FString FullAssetUrl = AssetUrl.StartsWith(TEXT("https://")) ? AssetUrl : Root + AssetUrl;
    if (!FullAssetUrl.StartsWith(TEXT("https://")) || FDateTime::UtcNow() >= PendingValidUntilUtc) { ApplyCachedOrFallback(); return; }

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(FullAssetUrl);
    Request->SetVerb(TEXT("GET"));
    Request->SetTimeout(5.0f);
    TWeakObjectPtr<UHotSeatAdSurfaceComponent> WeakThis(this);
    Request->OnProcessRequestComplete().BindLambda([WeakThis](FHttpRequestPtr Completed, FHttpResponsePtr AssetResponse, bool bSucceeded)
    {
        if (WeakThis.IsValid()) WeakThis->HandleAsset(Completed, AssetResponse, bSucceeded);
    });
    Request->ProcessRequest();
}

void UHotSeatAdSurfaceComponent::HandleAsset(FHttpRequestPtr, FHttpResponsePtr Response, bool bSucceeded)
{
    if (!bSucceeded || !Response.IsValid() || !EHttpResponseCodes::IsOk(Response->GetResponseCode()) || FDateTime::UtcNow() >= PendingValidUntilUtc)
    { ApplyCachedOrFallback(); return; }
    IImageWrapperModule& ImageModule = FModuleManager::LoadModuleChecked<IImageWrapperModule>(TEXT("ImageWrapper"));
    TSharedPtr<IImageWrapper> Wrapper = ImageModule.CreateImageWrapper(EImageFormat::PNG);
    const TArray<uint8>& Compressed = Response->GetContent();
    if (!Wrapper.IsValid() || !Wrapper->SetCompressed(Compressed.GetData(), Compressed.Num())) { ApplyCachedOrFallback(); return; }
    TArray<uint8> Pixels;
    if (!Wrapper->GetRaw(ERGBFormat::BGRA, 8, Pixels)) { ApplyCachedOrFallback(); return; }
    UTexture2D* Texture = UTexture2D::CreateTransient(Wrapper->GetWidth(), Wrapper->GetHeight(), PF_B8G8R8A8);
    if (!Texture) { ApplyCachedOrFallback(); return; }
    Texture->MipGenSettings = TMGS_NoMipmaps;
    FTexture2DMipMap& Mip = Texture->GetPlatformData()->Mips[0];
    void* Data = Mip.BulkData.Lock(LOCK_READ_WRITE);
    FMemory::Memcpy(Data, Pixels.GetData(), Pixels.Num());
    Mip.BulkData.Unlock();
    Texture->UpdateResource();
    CurrentTexture = Texture;
    CachedValidUntilUtc = PendingValidUntilUtc;
    OnCreativeReady.Broadcast(CurrentTexture);
}

void UHotSeatAdSurfaceComponent::ApplyCachedOrFallback()
{
    if (!CurrentTexture || FDateTime::UtcNow() >= CachedValidUntilUtc) CurrentTexture = FallbackTexture;
    OnCreativeReady.Broadcast(CurrentTexture);
}

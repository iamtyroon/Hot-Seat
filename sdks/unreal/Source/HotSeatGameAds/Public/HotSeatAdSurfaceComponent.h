#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "HotSeatAdSurfaceComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FHotSeatCreativeReady, UTexture2D*, Texture);

UCLASS(ClassGroup=(HotSeat), meta=(BlueprintSpawnableComponent))
class HOTSEATGAMEADS_API UHotSeatAdSurfaceComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UHotSeatAdSurfaceComponent();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Hot Seat") FString ApiBaseUrl = TEXT("https://hotseat-three.vercel.app");
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Hot Seat") FString PlacementId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Hot Seat") TObjectPtr<UTexture2D> FallbackTexture;
    UPROPERTY(BlueprintReadOnly, Category="Hot Seat") TObjectPtr<UTexture2D> CurrentTexture;
    UPROPERTY(BlueprintAssignable, Category="Hot Seat") FHotSeatCreativeReady OnCreativeReady;

    UFUNCTION(BlueprintCallable, Category="Hot Seat") void RefreshCreative();

protected:
    virtual void BeginPlay() override;

private:
    FTimerHandle RefreshTimer;
    FDateTime CachedValidUntilUtc;
    FDateTime PendingValidUntilUtc;
    void HandleManifest(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSucceeded);
    void HandleAsset(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSucceeded);
    void ApplyCachedOrFallback();
};

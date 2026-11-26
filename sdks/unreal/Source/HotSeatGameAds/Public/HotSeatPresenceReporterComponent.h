#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "HotSeatPresenceReporterComponent.generated.h"

UCLASS(ClassGroup=(HotSeat), meta=(BlueprintSpawnableComponent))
class HOTSEATGAMEADS_API UHotSeatPresenceReporterComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UHotSeatPresenceReporterComponent();
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Hot Seat") FString ApiBaseUrl = TEXT("https://hotseat.vercel.app");
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Hot Seat") FString GameId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Hot Seat") FString PlacementId;
    UFUNCTION(BlueprintCallable, Category="Hot Seat") void SetActivePlayerCount(int32 Count);
    UFUNCTION(BlueprintCallable, Category="Hot Seat") void AddViewableImpressions(int32 Count);

protected:
    virtual void BeginPlay() override;

private:
    FTimerHandle ReportTimer;
    FString ServerId;
    FString Credential;
    int32 ActivePlayers = 0;
    int32 PendingViewableCount = 0;
    void ReportPresence();
    void ReportImpressions();
};

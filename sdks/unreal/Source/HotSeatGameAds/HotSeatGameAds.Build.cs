using UnrealBuildTool;

public class HotSeatGameAds : ModuleRules
{
    public HotSeatGameAds(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "HTTP", "Json", "JsonUtilities", "ImageWrapper", "UMG" });
    }
}

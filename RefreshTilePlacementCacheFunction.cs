using System;
using System.Threading.Tasks;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;
using static BgaTmScraperRegistry.Services.TilePlacementService;

namespace BgaTmScraperRegistry
{
    public static class RefreshTilePlacementCache
    {
        // Runs once per day at 03:00 UTC
        [Disable("disableTriggers")]
        [FunctionName(nameof(RefreshTilePlacementCache))]
        public static async Task Run(
            [TimerTrigger("0 0 3 * * *")] TimerInfo timer,
            ILogger log)
        {
            log.LogInformation("RefreshTilePlacementCache triggered at: {time}", DateTime.UtcNow);

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return;
                }

                var service = new TilePlacementService(connectionString, log);

                await service.RefreshCacheAsync(TileType.City);
                log.LogInformation("Refreshed city tile placement cache");

                await service.RefreshCacheAsync(TileType.Greenery);
                log.LogInformation("Refreshed greenery tile placement cache");

                log.LogInformation("RefreshTilePlacementCache completed successfully at: {time}", DateTime.UtcNow);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error during RefreshTilePlacementCache execution");
            }
        }
    }
}

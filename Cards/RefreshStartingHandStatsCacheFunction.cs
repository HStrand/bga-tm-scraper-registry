using System;
using System.Threading.Tasks;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class RefreshStartingHandStatsCache
    {
        [Disable("disableTriggers")]
        [FunctionName(nameof(RefreshStartingHandStatsCache))]
        public static async Task Run(
            [TimerTrigger("0 */60 * * * *")] TimerInfo timer,
            ILogger log)
        {
            log.LogInformation("RefreshStartingHandStatsCache triggered at: {time}", DateTime.UtcNow);

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return;
                }

                var service = new StartingHandStatsService(connectionString, log);
                await service.RefreshStartingHandStatsCacheAsync();

                log.LogInformation("RefreshStartingHandStatsCache completed successfully at: {time}", DateTime.UtcNow);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error during RefreshStartingHandStatsCache execution");
            }
        }
    }
}

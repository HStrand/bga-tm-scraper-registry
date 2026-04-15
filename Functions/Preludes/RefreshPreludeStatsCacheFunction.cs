using System;
using System.Threading.Tasks;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class RefreshPreludeStatsCache
    {
        //[Disable("disableTriggers")]
        [Disable]
        [FunctionName(nameof(RefreshPreludeStatsCache))]
        public static async Task Run(
            [TimerTrigger("0 */45 * * * *")] TimerInfo timer,
            ILogger log)
        {
            log.LogInformation("RefreshPreludeStatsCache triggered at: {time}", DateTime.UtcNow);

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return;
                }

                var service = new PreludeStatsService(connectionString, log);
                await service.RefreshAllPreludeStatsCacheAsync();

                log.LogInformation("RefreshPreludeStatsCache completed successfully at: {time}", DateTime.UtcNow);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error during RefreshPreludeStatsCache execution");
            }
        }
    }
}

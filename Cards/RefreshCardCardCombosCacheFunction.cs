using System;
using System.Threading.Tasks;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class RefreshCardCardCombosCache
    {
        [Disable("disableTriggers")]
        [FunctionName(nameof(RefreshCardCardCombosCache))]
        public static async Task Run(
            [TimerTrigger("0 0 */6 * * *")] TimerInfo timer,
            ILogger log)
        {
            log.LogInformation("RefreshCardCardCombosCache triggered at: {time}", DateTime.UtcNow);

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return;
                }

                var service = new CombinationStatsService(connectionString, log);
                await service.RefreshCardCardCacheAsync();

                log.LogInformation("RefreshCardCardCombosCache completed successfully at: {time}", DateTime.UtcNow);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error during RefreshCardCardCombosCache execution");
            }
        }
    }
}

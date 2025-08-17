using System;
using System.Threading.Tasks;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class RefreshCorporationStatsCache
    {
        // Runs every 10 minutes. Adjust as needed.
        // CRON format: {second} {minute} {hour} {day} {month} {day-of-week}
        [Disable("disableTriggers")]
        [FunctionName(nameof(RefreshCorporationStatsCache))]
        public static async Task Run(
            [TimerTrigger("0 */10 * * * *")] TimerInfo timer,
            ILogger log)
        {
            log.LogInformation("RefreshCorporationStatsCache triggered at: {time}", DateTime.UtcNow);

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return;
                }

                var service = new CorporationStatsService(connectionString, log);
                await service.RefreshAllCorporationStatsCacheAsync();

                log.LogInformation("RefreshCorporationStatsCache completed successfully at: {time}", DateTime.UtcNow);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error during RefreshCorporationStatsCache execution");
            }
        }
    }
}

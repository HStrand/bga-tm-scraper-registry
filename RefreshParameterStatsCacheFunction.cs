using System;
using System.Threading.Tasks;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry
{
    public static class RefreshParameterStatsCache
    {
        // Runs every 10 minutes. Adjust the CRON as needed.
        // Format: {second} {minute} {hour} {day} {month} {day-of-week}
        [Disable("disableTriggers")]
        [FunctionName(nameof(RefreshParameterStatsCache))]
        public static async Task Run(
            [TimerTrigger("0 */10 * * * *")] TimerInfo timer,
            ILogger log)
        {
            log.LogInformation("RefreshParameterStatsCache triggered at: {time}", DateTime.UtcNow);

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return;
                }

                var service = new ParameterStatsService(connectionString, log);
                await service.RefreshParameterStatsCacheAsync();

                log.LogInformation("RefreshParameterStatsCache completed successfully at: {time}", DateTime.UtcNow);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error during RefreshParameterStatsCache execution");
            }
        }
    }
}

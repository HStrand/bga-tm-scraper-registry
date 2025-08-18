using System;
using System.Threading.Tasks;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry
{
    public static class RefreshPlayerScoresCache
    {
        // Runs every 10 minutes. Adjust the CRON as needed.
        // Format: {second} {minute} {hour} {day} {month} {day-of-week}
        [Disable("disableTriggers")]
        [FunctionName(nameof(RefreshPlayerScoresCache))]
        public static async Task Run(
            [TimerTrigger("0 */10 * * * *")] TimerInfo timer,
            ILogger log)
        {
            log.LogInformation("RefreshPlayerScoresCache triggered at: {time}", DateTime.UtcNow);

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return;
                }

                var service = new PlayerScoreService(connectionString, log);
                await service.RefreshPlayerScoresCacheAsync();

                log.LogInformation("RefreshPlayerScoresCache completed successfully at: {time}", DateTime.UtcNow);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error during RefreshPlayerScoresCache execution");
            }
        }
    }
}

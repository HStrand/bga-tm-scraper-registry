using System;
using System.Threading.Tasks;
using BgaTmScraperRegistry.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.Extensions.Logging;

namespace BgaTmScraperRegistry
{
    public static class GetScraperLeaderboard
    {
        [FunctionName(nameof(GetScraperLeaderboard))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetScraperLeaderboardFunction processed a request.");

            try
            {
                var sqlConnectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(sqlConnectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var gameService = new GameDatabaseService(sqlConnectionString, log);
                var leaderboard = await gameService.GetScraperLeaderboardAsync();

                return new OkObjectResult(leaderboard);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting scraper leaderboard");
                return new StatusCodeResult(500);
            }
        }
    }
}

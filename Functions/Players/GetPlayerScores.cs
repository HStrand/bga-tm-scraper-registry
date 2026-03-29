using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry
{
    public static class GetPlayerScores
    {
        [FunctionName(nameof(GetPlayerScores))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetPlayerScores function processed a request.");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var playerScoreService = new PlayerScoreService(connectionString, log);

                // Get player scores
                var scores = await playerScoreService.GetPlayerScoresAsync();

                log.LogInformation($"Retrieved {scores.Count} player scores");
                
                return new OkObjectResult(scores);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting player scores");
                return new StatusCodeResult(500);
            }
        }
    }
}

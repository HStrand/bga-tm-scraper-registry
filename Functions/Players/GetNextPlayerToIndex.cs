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
    public static class GetNextPlayerToIndex
    {
        [FunctionName(nameof(GetNextPlayerToIndex))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetNextPlayerToIndex function processed a request.");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var playerService = new PlayerDatabaseService(connectionString, log);
                var nextPlayerId = await playerService.GetNextPlayerToIndexAsync();

                if (nextPlayerId == null)
                {
                    log.LogInformation("No player found to index");
                    return new NotFoundObjectResult(new { message = "No player found to index" });
                }

                log.LogInformation($"Returning next player to index: {nextPlayerId}");
                return new OkObjectResult(new { playerId = nextPlayerId.Value });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting next player to index");
                return new StatusCodeResult(500);
            }
        }
    }
}

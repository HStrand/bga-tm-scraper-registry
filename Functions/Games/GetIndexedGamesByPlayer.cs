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
    public static class GetIndexedGamesByPlayer
    {
        [FunctionName(nameof(GetIndexedGamesByPlayer))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetIndexedGamesByPlayer HTTP trigger function processed a request.");

            try
            {
                // Get connection string from environment variables
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not configured");
                    return new BadRequestObjectResult(new { message = "Database connection not configured", success = false });
                }

                // Get playerId from query parameters
                string playerIdParam = req.Query["playerId"];
                if (string.IsNullOrWhiteSpace(playerIdParam))
                {
                    log.LogWarning("Missing playerId parameter");
                    return new BadRequestObjectResult(new { message = "playerId parameter is required", success = false });
                }

                // Validate playerId is a valid integer
                if (!int.TryParse(playerIdParam, out var playerId) || playerId <= 0)
                {
                    log.LogWarning($"Invalid playerId parameter: {playerIdParam}");
                    return new BadRequestObjectResult(new { message = "playerId must be a valid positive integer", success = false });
                }

                log.LogInformation($"Getting games for playerId: {playerId}");

                // Initialize database service and get games
                var dbService = new GameDatabaseService(connectionString, log);

                var tableIds = await dbService.GetPlayerGameTableIdsAsync(playerId);

                log.LogInformation($"Found {tableIds.Count} games for playerId {playerId}");

                // Return simple array of tableIds
                return new OkObjectResult(tableIds);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Unexpected error in GetIndexedGamesByPlayer");
                return new StatusCodeResult(500);
            }
        }
    }
}

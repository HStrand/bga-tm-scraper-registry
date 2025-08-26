using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;
using BgaTmScraperRegistry.Models;

namespace BgaTmScraperRegistry
{
    public static class GetNextAssignment
    {
        [FunctionName(nameof(GetNextAssignment))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetNextAssignment function processed a request.");

            // Get optional version parameter
            string version = req.Query["version"];
            if (!string.IsNullOrEmpty(version))
            {
                log.LogInformation($"Request received from version: {version}");
            }

            try
            {
                // Get email from query parameter or request body
                string username = req.Query["email"];

                log.LogInformation($"User {username} requested a new assignment");

                if (string.IsNullOrEmpty(username))
                {
                    log.LogError("Email parameter is required");
                    return new BadRequestObjectResult(new { message = "Email parameter is required" });
                }

                // Parse count parameter with default of 200 and max validation
                int count = 200; // default value
                string countParam = req.Query["count"];
                if (!string.IsNullOrEmpty(countParam))
                {
                    if (int.TryParse(countParam, out int parsedCount))
                    {
                        count = Math.Min(parsedCount, 200); // Cap at maximum 200
                    }
                    // If parsing fails, keep default of 200
                }

                log.LogInformation($"Using count parameter: {count}");

                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var gameService = new GameDatabaseService(connectionString, log);
                var playerService = new PlayerDatabaseService(connectionString, log);

                // Check how many unscraped games are available
                var unscrapedCount = await gameService.GetUnscrapedGameCountAsync();
                
                log.LogInformation($"Found {unscrapedCount} unscraped games available");

                if (unscrapedCount >= 200)
                {
                    log.LogInformation("Assigning replay scraping work");
                    
                    var games = await gameService.GetAndAssignUnscrapedGamesAsync(count, username);
                    
                    if (!games.Any())
                    {
                        log.LogWarning("No games were assigned despite count indicating availability");
                        return new NotFoundObjectResult(new { message = "No games available for assignment" });
                    }

                    var assignment = new ReplayScrapingAssignment
                    {
                        Games = games
                    };

                    log.LogInformation($"Assigned {games.Count} games for replay scraping to {username}");
                    return new OkObjectResult(assignment);
                }
                else
                {
                    log.LogInformation("Assigning indexing work");
                    
                    // Get next player to index
                    var nextPlayerId = await playerService.GetNextPlayerToIndexAsync();
                    
                    if (nextPlayerId == null)
                    {
                        log.LogInformation("No player found to index");
                        return new NotFoundObjectResult(new { message = "No work available for assignment" });
                    }

                    // Get player name
                    var playerName = await gameService.GetPlayerNameAsync(nextPlayerId.Value);
                    
                    if (string.IsNullOrEmpty(playerName))
                    {
                        log.LogWarning($"Player name not found for PlayerId {nextPlayerId.Value}");
                        playerName = $"Player {nextPlayerId.Value}";
                    }

                    var assignment = new IndexingAssignment
                    {
                        PlayerId = nextPlayerId.Value,
                        PlayerName = playerName
                    };

                    log.LogInformation($"Assigned indexing work for player {nextPlayerId.Value} ({playerName}) to {username}");
                    return new OkObjectResult(assignment);
                }
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting next assignment");
                return new StatusCodeResult(500);
            }
        }
    }
}

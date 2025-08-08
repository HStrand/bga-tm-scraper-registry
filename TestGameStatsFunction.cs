using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using BgaTmScraperRegistry.Models;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry
{
    public static class TestGameStatsFunction
    {
        [FunctionName("TestGameStats")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("TestGameStats function processed a request.");

            try
            {
                // Read the JSON from the request body
                string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
                
                if (string.IsNullOrWhiteSpace(requestBody))
                {
                    return new BadRequestObjectResult("Request body is empty");
                }

                // Deserialize the GameLogData
                var gameLogData = JsonConvert.DeserializeObject<GameLogData>(requestBody);
                
                if (gameLogData == null)
                {
                    return new BadRequestObjectResult("Failed to deserialize GameLogData");
                }

                // Use the new parser to test the logic
                var parser = new GameLogDataParser();
                var gameStats = parser.ParseGameStats(gameLogData);
                var playerStats = parser.ParseGamePlayerStats(gameLogData);
                var startingHandCorporations = parser.ParseStartingHandCorporations(gameLogData);
                var startingHandPreludes = parser.ParseStartingHandPreludes(gameLogData);
                var startingHandCards = parser.ParseStartingHandCards(gameLogData);
                var milestones = parser.ParseGameMilestones(gameLogData);
                var awards = parser.ParseGamePlayerAwards(gameLogData);
                var parameterChanges = parser.ParseParameterChanges(gameLogData);
                var gameCards = parser.ParseGameCards(gameLogData);

                return new OkObjectResult(new
                {
                    success = true,
                    message = "GameStats, GamePlayerStats, StartingHandCorporations, StartingHandPreludes, GameMilestones, GamePlayerAwards, ParameterChanges, and GameCards parsing test completed",
                    gameStats,
                    playerStats,
                    startingHandCorporations,
                    startingHandPreludes,
                    startingHandCards,
                    milestones,
                    awards,
                    parameterChanges,
                    gameCards
                });
            }
            catch (JsonException jsonEx)
            {
                log.LogError(jsonEx, "JSON deserialization error");
                return new BadRequestObjectResult($"JSON parsing error: {jsonEx.Message}");
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error testing GameStats parsing");
                return new StatusCodeResult(500);
            }
        }
    }
}

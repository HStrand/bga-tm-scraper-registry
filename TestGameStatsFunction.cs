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

                // Test the parsing logic without actually hitting the database
                var testResult = TestGameStatsParsing(gameLogData, log);

                return new OkObjectResult(new
                {
                    success = true,
                    message = "GameStats parsing test completed",
                    result = testResult
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

        private static object TestGameStatsParsing(GameLogData gameLogData, ILogger log)
        {
            try
            {
                // Test TableId parsing
                bool tableIdParseSuccess = int.TryParse(gameLogData.ReplayId, out int tableId);
                
                // Test duration parsing
                int? durationMinutes = ParseDurationToMinutes(gameLogData.GameDuration, log);
                
                // Get generations
                int? generations = gameLogData.Generations;

                var result = new
                {
                    replayId = gameLogData.ReplayId,
                    tableIdParseSuccess = tableIdParseSuccess,
                    tableId = tableIdParseSuccess ? tableId : (int?)null,
                    gameDuration = gameLogData.GameDuration,
                    durationMinutes = durationMinutes,
                    generations = generations,
                    parsedSuccessfully = tableIdParseSuccess,
                    wouldFailUpsert = !tableIdParseSuccess
                };

                log.LogInformation($"Parsing test result: ReplayId='{gameLogData.ReplayId}', TableId={tableId}, Duration='{gameLogData.GameDuration}' -> {durationMinutes} minutes, Generations={generations}");

                return result;
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error in parsing test");
                return new
                {
                    error = ex.Message,
                    parsedSuccessfully = false,
                    wouldFailUpsert = true
                };
            }
        }

        private static int? ParseDurationToMinutes(string gameDuration, ILogger log)
        {
            if (string.IsNullOrWhiteSpace(gameDuration))
            {
                log.LogWarning("GameDuration is null or empty, setting DurationMinutes to null");
                return null;
            }

            try
            {
                // Expected format: "MM:SS" (e.g., "00:55")
                var parts = gameDuration.Split(':');
                if (parts.Length != 2)
                {
                    log.LogWarning($"GameDuration '{gameDuration}' is not in expected MM:SS format, setting DurationMinutes to null");
                    return null;
                }

                if (!int.TryParse(parts[0], out int minutes) || !int.TryParse(parts[1], out int seconds))
                {
                    log.LogWarning($"GameDuration '{gameDuration}' contains non-numeric values, setting DurationMinutes to null");
                    return null;
                }

                // Convert to total minutes (round to nearest minute)
                var totalMinutes = minutes + Math.Round(seconds / 60.0, 0);
                
                log.LogDebug($"Parsed GameDuration '{gameDuration}' to {totalMinutes} minutes");
                
                return (int)totalMinutes;
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, $"Error parsing GameDuration '{gameDuration}', setting DurationMinutes to null");
                return null;
            }
        }
    }
}

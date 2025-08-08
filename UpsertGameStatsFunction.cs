using System;
using System.IO;
using System.Threading.Tasks;
using BgaTmScraperRegistry.Models;
using BgaTmScraperRegistry.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry
{
    public static class UpsertGameStatsFunction
    {
        [FunctionName("UpsertGameStats")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = "upsert-game-stats")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("UpsertGameStats processed a request.");

            try
            {
                var sqlConnectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrWhiteSpace(sqlConnectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
                if (string.IsNullOrWhiteSpace(requestBody))
                {
                    return new BadRequestObjectResult(new
                    {
                        error = "Request body is empty",
                        details = new[] { "JSON content is required" }
                    });
                }

                GameLogData gameLogData;
                try
                {
                    gameLogData = JsonConvert.DeserializeObject<GameLogData>(requestBody);
                }
                catch (JsonException ex)
                {
                    log.LogError(ex, "Failed to deserialize JSON content");
                    return new BadRequestObjectResult(new
                    {
                        error = "Invalid JSON format",
                        details = new[] { ex.Message }
                    });
                }

                if (gameLogData == null)
                {
                    return new BadRequestObjectResult(new
                    {
                        error = "Deserialized GameLogData is null",
                        details = new[] { "Ensure the payload matches the expected schema." }
                    });
                }

                if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                {
                    return new BadRequestObjectResult(new
                    {
                        error = "Validation failed",
                        details = new[] { "replay_id must be a valid integer" }
                    });
                }

                var service = new GameStatsService(sqlConnectionString, log);
                await service.UpsertGameStatsAsync(gameLogData);

                return new OkObjectResult(new
                {
                    success = true,
                    message = "Game stats upsert completed",
                    tableId
                });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while upserting game stats");
                return new StatusCodeResult(500);
            }
        }
    }
}

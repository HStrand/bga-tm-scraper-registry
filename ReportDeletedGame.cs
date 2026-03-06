using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry
{
    public static class ReportDeletedGame
    {
        [FunctionName(nameof(ReportDeletedGame))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("ReportDeletedGame function processed a request.");

            try
            {
                string requestBody = await new StreamReader(req.Body).ReadToEndAsync();

                if (string.IsNullOrWhiteSpace(requestBody))
                {
                    return new BadRequestObjectResult(new { error = "Request body is empty" });
                }

                var data = JsonConvert.DeserializeAnonymousType(requestBody, new
                {
                    tableId = "",
                    playerPerspective = "",
                    reason = "replay_lost"
                });

                if (string.IsNullOrWhiteSpace(data?.tableId) || !int.TryParse(data.tableId, out int tableId))
                {
                    return new BadRequestObjectResult(new { error = "tableId is required and must be a valid integer" });
                }

                if (string.IsNullOrWhiteSpace(data?.playerPerspective) || !int.TryParse(data.playerPerspective, out int playerPerspective))
                {
                    return new BadRequestObjectResult(new { error = "playerPerspective is required and must be a valid integer" });
                }

                var reason = data.reason ?? "replay_lost";

                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var gameService = new GameDatabaseService(connectionString, log);

                var gameExists = await gameService.GameExistsAsync(tableId, playerPerspective);
                if (!gameExists)
                {
                    log.LogWarning($"Game with TableId {tableId} and PlayerPerspective {playerPerspective} not found");
                    return new NotFoundObjectResult(new
                    {
                        error = "Game not found in registry",
                        tableId,
                        playerPerspective
                    });
                }

                var success = await gameService.MarkGameAsDeletedAsync(tableId, playerPerspective, reason);

                log.LogInformation($"Marked game {tableId} (perspective {playerPerspective}) as deleted, reason: {reason}, success: {success}");

                return new OkObjectResult(new
                {
                    message = "Game marked as deleted",
                    tableId,
                    playerPerspective,
                    reason,
                    updated = success
                });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while reporting deleted game");
                return new StatusCodeResult(500);
            }
        }
    }
}

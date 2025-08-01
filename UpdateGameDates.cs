using BgaTmScraperRegistry.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;

namespace BgaTmScraperRegistry
{
    public static class UpdateGameDates
    {
        [FunctionName(nameof(UpdateGameDates))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("C# HTTP trigger function processed a request to update game dates.");

            var sqlConnectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
            var storageConnectionString = Environment.GetEnvironmentVariable("BlobStorageConnectionString");

            var gameDbService = new GameDatabaseService(sqlConnectionString, log);
            var blobStorageService = new BlobStorageService(storageConnectionString, log);

            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            var gamesToUpdate = JsonConvert.DeserializeObject<GamesList>(requestBody);

            if (gamesToUpdate == null || gamesToUpdate.Games == null)
            {
                return new BadRequestObjectResult("Please provide a list of games in the request body.");
            }

            foreach (var gameInfo in gamesToUpdate.Games)
            {
                try
                {
                    if (!int.TryParse(gameInfo.TableId.Trim(), out var tableId) || !int.TryParse(gameInfo.PlayerPerspective.Trim(), out var playerPerspective))
                    {
                        log.LogWarning($"Invalid TableId or PlayerPerspective provided: TableId='{gameInfo.TableId}', PlayerPerspective='{gameInfo.PlayerPerspective}'");
                        continue;
                    }

                    // Get game from DB
                    var gameFromDb = await gameDbService.GetGameAsync(tableId, playerPerspective);
                    if (gameFromDb == null || !gameFromDb.ParsedDateTime.HasValue)
                    {
                        log.LogWarning($"Game with TableId {tableId} and PlayerPerspective {playerPerspective} not found in the database or has no ParsedDateTime.");
                        continue;
                    }

                    // Get game JSON from blob storage
                    var blobContent = await blobStorageService.GetBlobContentAsync(playerPerspective.ToString(), tableId.ToString());
                    if (string.IsNullOrEmpty(blobContent))
                    {
                        log.LogWarning($"Blob for game with TableId {tableId} and PlayerPerspective {playerPerspective} not found or is empty.");
                        continue;
                    }

                    var jsonObject = JObject.Parse(blobContent);
                    jsonObject["game_date"] = gameFromDb.ParsedDateTime.Value.ToString("yyyy-MM-dd");

                    var updatedJson = jsonObject.ToString(Formatting.Indented);
                    await blobStorageService.UploadGameLogAsync(playerPerspective.ToString(), tableId.ToString(), updatedJson);
                    log.LogInformation($"Successfully updated game_date for game with TableId {tableId} and PlayerPerspective {playerPerspective}.");
                }
                catch (Exception ex)
                {
                    log.LogError(ex, $"Error processing game with TableId {gameInfo.TableId} and PlayerPerspective {gameInfo.PlayerPerspective}.");
                }
            }

            return new OkObjectResult("Game dates update process completed.");
        }
    }

    public class GamesList
    {
        public List<GameInfo> Games { get; set; }
    }

    public class GameInfo
    {
        public string TableId { get; set; }
        public string PlayerPerspective { get; set; }
    }
}

using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.IO;
using System.Linq;
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
    public static class StoreGameLog
    {
        [FunctionName(nameof(StoreGameLog))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("StoreGameLog processed a request.");

            try
            {
                // Get connection strings from environment variables
                var sqlConnectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                var blobConnectionString = Environment.GetEnvironmentVariable("BlobStorageConnectionString");

                if (string.IsNullOrEmpty(sqlConnectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                if (string.IsNullOrEmpty(blobConnectionString))
                {
                    log.LogError("BlobStorageConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                // Get optional scrapedBy parameter
                string scrapedBy = req.Query["scrapedBy"];

                // Read and validate JSON content
                string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
                
                if (string.IsNullOrWhiteSpace(requestBody))
                {
                    return new BadRequestObjectResult(new
                    {
                        error = "Request body is empty",
                        details = new[] { "JSON content is required" }
                    });
                }

                // Deserialize and validate the game log data
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

                // Validate the deserialized data
                var validationResults = ValidateGameLogData(gameLogData);
                if (validationResults.Any())
                {
                    return new BadRequestObjectResult(new
                    {
                        error = "Validation failed",
                        details = validationResults
                    });
                }

                // Parse table ID and player perspective
                if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                {
                    return new BadRequestObjectResult(new
                    {
                        error = "Validation failed",
                        details = new[] { "replay_id must be a valid integer" }
                    });
                }

                if (!int.TryParse(gameLogData.PlayerPerspective, out int playerPerspective))
                {
                    return new BadRequestObjectResult(new
                    {
                        error = "Validation failed",
                        details = new[] { "player_perspective must be a valid integer" }
                    });
                }

                // Validate that player_perspective exists in players dictionary
                if (!gameLogData.Players.ContainsKey(gameLogData.PlayerPerspective))
                {
                    return new BadRequestObjectResult(new
                    {
                        error = "Validation failed",
                        details = new[] { "player_perspective must exist as a key in the players dictionary" }
                    });
                }

                // Initialize services
                var gameService = new GameDatabaseService(sqlConnectionString, log);
                var blobService = new BlobStorageService(blobConnectionString, log);

                // Check if the game exists in the database
                var gameExists = await gameService.GameExistsAsync(tableId, playerPerspective);
                if (!gameExists)
                {
                    log.LogWarning($"Game with TableId {tableId} and PlayerPerspective {playerPerspective} not found in registry");
                    return new NotFoundObjectResult(new
                    {
                        error = "Game has not been indexed in the registry",
                        tableId = tableId,
                        playerPerspective = playerPerspective
                    });
                }

                // Store the JSON content to blob storage
                var blobPath = await blobService.UploadGameLogAsync(
                    gameLogData.PlayerPerspective, 
                    gameLogData.ReplayId, 
                    requestBody);

                // Update the game record with scraped information
                var currentTime = DateTime.UtcNow;
                var updateSuccess = await gameService.UpdateGameScrapedInfoAsync(
                    tableId, 
                    playerPerspective, 
                    currentTime, 
                    scrapedBy);

                if (!updateSuccess)
                {
                    log.LogWarning($"Failed to update game record for TableId {tableId}, PlayerPerspective {playerPerspective}");
                }

                log.LogInformation($"Successfully stored game log for TableId {tableId}, PlayerPerspective {playerPerspective} to blob path: {blobPath}");

                return new OkObjectResult(new
                {
                    message = "Game log stored successfully",
                    blobPath = blobPath,
                    gameUpdated = updateSuccess,
                    tableId = tableId,
                    playerPerspective = playerPerspective,
                    scrapedAt = currentTime,
                    scrapedBy = scrapedBy
                });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while storing game log");
                return new StatusCodeResult(500);
            }
        }

        private static List<string> ValidateGameLogData(GameLogData gameLogData)
        {
            var errors = new List<string>();

            if (gameLogData == null)
            {
                errors.Add("Game log data is null");
                return errors;
            }

            // Validate required fields using data annotations
            var validationContext = new ValidationContext(gameLogData);
            var validationResults = new List<ValidationResult>();
            
            if (!Validator.TryValidateObject(gameLogData, validationContext, validationResults, true))
            {
                errors.AddRange(validationResults.Select(vr => vr.ErrorMessage));
            }

            // Additional custom validations
            if (string.IsNullOrWhiteSpace(gameLogData.ReplayId))
            {
                errors.Add("replay_id is required and cannot be empty");
            }

            if (string.IsNullOrWhiteSpace(gameLogData.PlayerPerspective))
            {
                errors.Add("player_perspective is required and cannot be empty");
            }

            if (gameLogData.Players == null || !gameLogData.Players.Any())
            {
                errors.Add("players dictionary is required and cannot be empty");
            }

            if (gameLogData.Moves == null || !gameLogData.Moves.Any())
            {
                errors.Add("moves array is required and cannot be empty");
            }

            // Validate numeric format for replay_id and player_perspective
            if (!string.IsNullOrWhiteSpace(gameLogData.ReplayId) && !int.TryParse(gameLogData.ReplayId, out _))
            {
                errors.Add("replay_id must be a valid integer");
            }

            if (!string.IsNullOrWhiteSpace(gameLogData.PlayerPerspective) && !int.TryParse(gameLogData.PlayerPerspective, out _))
            {
                errors.Add("player_perspective must be a valid integer");
            }

            return errors;
        }
    }
}

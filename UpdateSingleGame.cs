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
    public static class UpdateSingleGame
    {
        [FunctionName(nameof(UpdateSingleGame))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("UpdateSingleGame HTTP trigger function processed a request.");

            // Get optional version parameter
            string version = req.Query["version"];
            if (!string.IsNullOrEmpty(version))
            {
                log.LogInformation($"Request received from version: {version}");
            }

            // Get optional indexedBy parameter
            string indexedBy = req.Query["indexedBy"];

            try
            {
                // Get connection string from environment variables
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not configured");
                    return new BadRequestObjectResult(new { message = "Database connection not configured", success = false });
                }

                // Read and validate request body
                string requestBody;
                try
                {
                    requestBody = await new StreamReader(req.Body).ReadToEndAsync();
                    if (string.IsNullOrWhiteSpace(requestBody))
                    {
                        log.LogWarning("Empty request body received");
                        return new BadRequestObjectResult(new { message = "Request body cannot be empty", success = false });
                    }
                }
                catch (Exception ex)
                {
                    log.LogError(ex, "Error reading request body");
                    return new BadRequestObjectResult(new { message = "Error reading request body", success = false });
                }

                // Deserialize JSON to SingleGameData object
                SingleGameData gameData;
                try
                {
                    gameData = JsonConvert.DeserializeObject<SingleGameData>(requestBody);
                    if (gameData == null)
                    {
                        log.LogWarning("Invalid JSON format in request body");
                        return new BadRequestObjectResult(new { message = "Invalid JSON format", success = false });
                    }
                }
                catch (JsonException ex)
                {
                    log.LogWarning(ex, "Invalid JSON format in request body");
                    return new BadRequestObjectResult(new { message = "Invalid JSON format", success = false });
                }

                // Validate game data
                var validationResults = new List<ValidationResult>();
                var validationContext = new ValidationContext(gameData);
                
                if (!Validator.TryValidateObject(gameData, validationContext, validationResults, true))
                {
                    var errors = string.Join(", ", validationResults.Select(r => r.ErrorMessage));
                    log.LogWarning($"Game data failed validation: {errors}");
                    return new BadRequestObjectResult(new { message = $"Invalid game data: {errors}", success = false });
                }

                // Validate and parse TableId and PlayerPerspective
                if (!int.TryParse(gameData.TableId, out var tableId) || tableId <= 0)
                {
                    log.LogWarning($"Game with invalid TableId '{gameData.TableId}'");
                    return new BadRequestObjectResult(new { message = $"Invalid TableId: {gameData.TableId}", success = false });
                }

                if (!int.TryParse(gameData.PlayerPerspective, out var playerPerspective) || playerPerspective <= 0)
                {
                    log.LogWarning($"Game with TableId {tableId} has invalid PlayerPerspective '{gameData.PlayerPerspective}'");
                    return new BadRequestObjectResult(new { message = $"Invalid PlayerPerspective: {gameData.PlayerPerspective}", success = false });
                }

                // Validate required fields
                if (string.IsNullOrWhiteSpace(gameData.Version))
                {
                    log.LogWarning($"Game with TableId {tableId} has missing Version");
                    return new BadRequestObjectResult(new { message = "Version is required", success = false });
                }

                if (gameData.Players == null || !gameData.Players.Any())
                {
                    log.LogWarning($"Game with TableId {tableId} has no players");
                    return new BadRequestObjectResult(new { message = "Game must have at least one player", success = false });
                }

                // Create Game object
                var game = new Game
                {
                    TableId = tableId,
                    PlayerPerspective = playerPerspective,
                    VersionId = gameData.Version,
                    RawDateTime = gameData.RawDateTime,
                    ParsedDateTime = gameData.ParsedDateTime,
                    GameMode = gameData.GameMode,
                    IndexedAt = DateTime.UtcNow,
                    IndexedBy = indexedBy,
                    ScrapedBy = null, // Will be set later by the scraper
                    Map = gameData.Map,
                    PreludeOn = gameData.PreludeOn,
                    ColoniesOn = gameData.ColoniesOn,
                    CorporateEraOn = gameData.CorporateEraOn,
                    DraftOn = gameData.DraftOn,
                    BeginnersCorporationsOn = gameData.BeginnersCorporationsOn,
                    GameSpeed = gameData.GameSpeed
                };

                // Validate Game object
                var gameValidationResults = new List<ValidationResult>();
                var gameValidationContext = new ValidationContext(game);
                
                if (!Validator.TryValidateObject(game, gameValidationContext, gameValidationResults, true))
                {
                    var gameErrors = string.Join(", ", gameValidationResults.Select(r => r.ErrorMessage));
                    log.LogWarning($"Game with TableId {tableId} failed validation: {gameErrors}");
                    return new BadRequestObjectResult(new { message = $"Game validation failed: {gameErrors}", success = false });
                }

                // Process players for this game
                var gamePlayers = new List<GamePlayer>();
                foreach (var playerData in gameData.Players)
                {
                    if (!int.TryParse(playerData.PlayerId, out var playerId) || playerId <= 0)
                    {
                        log.LogWarning($"Player with invalid PlayerId '{playerData.PlayerId}' in game {tableId} skipped");
                        continue;
                    }

                    if (string.IsNullOrWhiteSpace(playerData.PlayerName))
                    {
                        log.LogWarning($"Player with PlayerId {playerId} in game {tableId} has missing name, skipped");
                        continue;
                    }

                    if (playerData.Position == null)
                    {
                        log.LogInformation($"Skipping player {playerData.PlayerId} in game {tableId} due to null position");
                        continue;
                    }

                    var gamePlayer = new GamePlayer
                    {
                        GameId = 0, // Will be set by the database service
                        TableId = tableId,
                        PlayerPerspective = playerPerspective,
                        PlayerId = playerId,
                        PlayerName = playerData.PlayerName,
                        Elo = playerData.GameRank,
                        EloChange = playerData.GameRankChange,
                        ArenaPoints = playerData.ArenaPoints,
                        ArenaPointsChange = playerData.ArenaPointsChange,
                        Position = playerData.Position.Value
                    };

                    // Validate GamePlayer object
                    var playerValidationResults = new List<ValidationResult>();
                    var playerValidationContext = new ValidationContext(gamePlayer);
                    
                    if (Validator.TryValidateObject(gamePlayer, playerValidationContext, playerValidationResults, true))
                    {
                        gamePlayers.Add(gamePlayer);
                    }
                    else
                    {
                        var playerErrors = string.Join(", ", playerValidationResults.Select(r => r.ErrorMessage));
                        log.LogWarning($"Player {playerId} in game {tableId} failed validation: {playerErrors}");
                    }
                }

                if (!gamePlayers.Any())
                {
                    log.LogInformation($"No valid players (null positions) for game {tableId}; skipping");
                    return new OkObjectResult(new 
                    { 
                        message = "Solo game or invalid players (null position) skipped", 
                        tableId = tableId,
                        skipped = true,
                        success = true 
                    });
                }

                log.LogInformation($"Processing game {tableId} with {gamePlayers.Count} valid players");

                // Initialize database service and process the game
                var dbService = new GameDatabaseService(connectionString, log);

                int gameId;
                try
                {
                    gameId = await dbService.UpsertSingleGameAsync(game, gamePlayers);
                }
                catch (Exception ex)
                {
                    log.LogError(ex, $"Error processing game {tableId} in database");
                    return new StatusCodeResult(500);
                }

                log.LogInformation($"Successfully processed game {tableId} with ID {gameId}");

                return new OkObjectResult(new 
                { 
                    message = $"Successfully processed game {tableId} with {gamePlayers.Count} players", 
                    gameId = gameId,
                    tableId = tableId,
                    playerCount = gamePlayers.Count,
                    success = true 
                });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Unexpected error in UpdateSingleGame");
                return new StatusCodeResult(500);
            }
        }
    }
}

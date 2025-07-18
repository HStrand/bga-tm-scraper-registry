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
    public static class UpdateGames
    {
        [FunctionName(nameof(UpdateGames))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("UpdateGames HTTP trigger function processed a request.");

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

                // Deserialize JSON to GameSubmission object
                GameSubmission gameSubmission;
                try
                {
                    gameSubmission = JsonConvert.DeserializeObject<GameSubmission>(requestBody);
                    if (gameSubmission == null || gameSubmission.Games == null || !gameSubmission.Games.Any())
                    {
                        log.LogWarning("No games found in request body or invalid JSON format");
                        return new BadRequestObjectResult(new { message = "No valid games found in request", success = false });
                    }
                }
                catch (JsonException ex)
                {
                    log.LogWarning(ex, "Invalid JSON format in request body");
                    return new BadRequestObjectResult(new { message = "Invalid JSON format", success = false });
                }

                // Validate game submission data
                var validationResults = new List<ValidationResult>();
                var validationContext = new ValidationContext(gameSubmission);
                
                if (!Validator.TryValidateObject(gameSubmission, validationContext, validationResults, true))
                {
                    var errors = string.Join(", ", validationResults.Select(r => r.ErrorMessage));
                    log.LogWarning($"Game submission failed validation: {errors}");
                    return new BadRequestObjectResult(new { message = $"Invalid game submission: {errors}", success = false });
                }

                // Convert GameData to Game and GamePlayer objects
                var games = new List<Game>();
                var gamePlayers = new List<GamePlayer>();

                foreach (var gameData in gameSubmission.Games)
                {
                    // Validate and parse TableId and PlayerPerspective
                    if (!int.TryParse(gameData.TableId, out var tableId) || tableId <= 0)
                    {
                        log.LogWarning($"Game with invalid TableId '{gameData.TableId}' skipped");
                        continue;
                    }

                    if (!int.TryParse(gameData.PlayerPerspective, out var playerPerspective) || playerPerspective <= 0)
                    {
                        log.LogWarning($"Game with TableId {tableId} has invalid PlayerPerspective '{gameData.PlayerPerspective}' skipped");
                        continue;
                    }

                    // Validate required fields
                    if (string.IsNullOrWhiteSpace(gameData.Version))
                    {
                        log.LogWarning($"Game with TableId {tableId} has missing Version, skipped");
                        continue;
                    }

                    if (gameData.Players == null || !gameData.Players.Any())
                    {
                        log.LogWarning($"Game with TableId {tableId} has no players, skipped");
                        continue;
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
                        ScrapedAt = gameData.ScrapedAt,
                        ScrapedBy = null // Will be set later by the scraper
                    };

                    // Validate Game object
                    var gameValidationResults = new List<ValidationResult>();
                    var gameValidationContext = new ValidationContext(game);
                    
                    if (Validator.TryValidateObject(game, gameValidationContext, gameValidationResults, true))
                    {
                        games.Add(game);

                        // Process players for this game
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
                                Position = playerData.Position
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
                    }
                    else
                    {
                        var gameErrors = string.Join(", ", gameValidationResults.Select(r => r.ErrorMessage));
                        log.LogWarning($"Game with TableId {tableId} failed validation: {gameErrors}");
                    }
                }

                if (!games.Any())
                {
                    log.LogWarning("No valid games found after validation");
                    return new BadRequestObjectResult(new { message = "No valid games found in request", success = false });
                }

                log.LogInformation($"Processing {games.Count} valid games with {gamePlayers.Count} players out of {gameSubmission.Games.Count} total games");

                // Deduplicate games - keep only the newest version of each game based on ScrapedAt
                var deduplicatedGames = games
                    .GroupBy(g => new { g.TableId, g.PlayerPerspective })
                    .Select(group => group.OrderByDescending(g => g.ScrapedAt).First())
                    .ToList();

                var duplicatesRemoved = games.Count - deduplicatedGames.Count;
                if (duplicatesRemoved > 0)
                {
                    log.LogInformation($"After deduplication: {deduplicatedGames.Count} unique games ({duplicatesRemoved} duplicates removed)");
                }
                else
                {
                    log.LogInformation($"No duplicates found. Processing {deduplicatedGames.Count} unique games");
                }

                // Filter game players to only include those for deduplicated games
                var deduplicatedGameKeys = deduplicatedGames.Select(g => new { g.TableId, g.PlayerPerspective }).ToHashSet();
                var deduplicatedGamePlayers = gamePlayers
                    .Where(gp => deduplicatedGameKeys.Contains(new { gp.TableId, gp.PlayerPerspective }))
                    .ToList();

                log.LogInformation($"Processing {deduplicatedGamePlayers.Count} game players for deduplicated games");

                // Initialize database service and process games
                var dbService = new GameDatabaseService(connectionString, log);

                int processedCount;
                try
                {
                    processedCount = await dbService.UpsertGamesAsync(deduplicatedGames, deduplicatedGamePlayers);
                }
                catch (Exception ex)
                {
                    log.LogError(ex, "Error processing games in database");
                    return new StatusCodeResult(500);
                }

                log.LogInformation($"Successfully processed {processedCount} games");

                return new OkObjectResult(new 
                { 
                    message = $"Successfully processed {processedCount} games with {deduplicatedGamePlayers.Count} players", 
                    success = true 
                });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Unexpected error in UpdateGames");
                return new StatusCodeResult(500);
            }
        }
    }
}

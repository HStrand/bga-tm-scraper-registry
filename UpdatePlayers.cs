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
    public static class UpdatePlayers
    {
        [FunctionName(nameof(UpdatePlayers))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("UpdatePlayers HTTP trigger function processed a request.");

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

                // Deserialize JSON to Player objects
                List<Player> players;
                try
                {
                    players = JsonConvert.DeserializeObject<List<Player>>(requestBody);
                    if (players == null || !players.Any())
                    {
                        log.LogWarning("No players found in request body or invalid JSON format");
                        return new BadRequestObjectResult(new { message = "No valid players found in request", success = false });
                    }
                }
                catch (JsonException ex)
                {
                    log.LogWarning(ex, "Invalid JSON format in request body");
                    return new BadRequestObjectResult(new { message = "Invalid JSON format", success = false });
                }

                // Validate player data
                var validPlayers = new List<Player>();
                
                foreach (var player in players)
                {
                    var validationResults = new List<ValidationResult>();
                    var validationContext = new ValidationContext(player);
                    
                    if (Validator.TryValidateObject(player, validationContext, validationResults, true))
                    {
                        // Additional business validation
                        if (player.PlayerId <= 0)
                        {
                            log.LogWarning($"Player with invalid ID {player.PlayerId} skipped");
                            continue;
                        }

                        validPlayers.Add(player);
                    }
                    else
                    {
                        var errors = string.Join(", ", validationResults.Select(r => r.ErrorMessage));
                        log.LogWarning($"Player with ID {player.PlayerId} failed validation: {errors}");
                    }
                }

                if (!validPlayers.Any())
                {
                    log.LogWarning("No valid players found after validation");
                    return new BadRequestObjectResult(new { message = "No valid players found in request", success = false });
                }

                log.LogInformation($"Processing {validPlayers.Count} valid players out of {players.Count} total players");

                // Deduplicate players - keep only the newest version of each player based on UpdatedAt
                var deduplicatedPlayers = validPlayers
                    .GroupBy(p => p.PlayerId)
                    .Select(group => group.OrderByDescending(p => p.UpdatedAt).First())
                    .ToList();

                var duplicatesRemoved = validPlayers.Count - deduplicatedPlayers.Count;
                if (duplicatesRemoved > 0)
                {
                    log.LogInformation($"After deduplication: {deduplicatedPlayers.Count} unique players ({duplicatesRemoved} duplicates removed)");
                }
                else
                {
                    log.LogInformation($"No duplicates found. Processing {deduplicatedPlayers.Count} unique players");
                }

                // Initialize database service and ensure table type exists
                var dbService = new PlayerDatabaseService(connectionString, log);

                // Process players
                int processedCount;
                try
                {
                    processedCount = await dbService.UpsertPlayersAsync(deduplicatedPlayers);
                }
                catch (Exception ex)
                {
                    log.LogError(ex, "Error processing players in database");
                    return new StatusCodeResult(500);
                }

                log.LogInformation($"Successfully processed {processedCount} players");

                return new OkObjectResult(new 
                { 
                    message = $"Successfully processed {processedCount} players", 
                    success = true 
                });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Unexpected error in UpdatePlayers");
                return new StatusCodeResult(500);
            }
        }
    }
}

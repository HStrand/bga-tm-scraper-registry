using System;
using System.Collections.Generic;
using System.Diagnostics;
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
    public static class MigrateGameMetadataFunction
    {
        [FunctionName(nameof(MigrateGameMetadataFunction))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("MigrateGameMetadataFunction started.");

            var startTime = DateTime.UtcNow;
            
            // Check for resume parameter
            string logFileName = $"migration-log.jsonl";
            var totalGames = 0;
            var successCount = 0;
            var errorCount = 0;
            var skippedCount = 0;

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

                // Initialize services
                var gameService = new GameDatabaseService(sqlConnectionString, log);
                var blobService = new BlobStorageService(blobConnectionString, log);

                // Get all games metadata from database
                log.LogInformation("Retrieving all games metadata from database...");
                var allGamesMetadata = await gameService.GetAllGamesMetadataAsync();
                
                // Load already processed games if resuming
                var processedGames = new HashSet<string>();
                if (!string.IsNullOrEmpty(logFileName) && File.Exists(logFileName))
                {
                    log.LogInformation($"Resuming from existing log file: {logFileName}");
                    
                    var logLines = await File.ReadAllLinesAsync(logFileName);
                    foreach (var line in logLines.Where(l => !string.IsNullOrWhiteSpace(l)))
                    {
                        try
                        {
                            var entry = JsonConvert.DeserializeObject<MigrationLogEntry>(line);
                            if (entry != null && entry.Status == "success")
                            {
                                processedGames.Add($"{entry.TableId}_{entry.PlayerPerspective}");
                            }
                        }
                        catch (JsonException ex)
                        {
                            log.LogWarning($"Failed to parse log line: {line}. Error: {ex.Message}");
                        }
                    }
                    
                    log.LogInformation($"Found {processedGames.Count} already processed games in log file");
                }
                else
                {
                    log.LogInformation($"Starting new migration. Log file: {logFileName}");
                }

                // Filter out already processed games
                var gamesToProcess = allGamesMetadata
                    .Where(g => !processedGames.Contains($"{g.TableId}_{g.PlayerPerspective}"))
                    .ToList();

                totalGames = allGamesMetadata.Count;
                skippedCount = totalGames - gamesToProcess.Count;

                log.LogInformation($"Total games in database: {totalGames}");
                log.LogInformation($"Already processed: {skippedCount}");
                log.LogInformation($"Remaining to process: {gamesToProcess.Count}");

                // Process each game
                foreach (var gameMetadata in gamesToProcess)
                {
                    var stopwatch = Stopwatch.StartNew();
                    var logEntry = new MigrationLogEntry
                    {
                        Timestamp = DateTime.UtcNow,
                        TableId = gameMetadata.TableId,
                        PlayerPerspective = gameMetadata.PlayerPerspective
                    };

                    try
                    {
                        await ProcessSingleGame(gameMetadata, blobService, log);
                        
                        logEntry.Status = "success";
                        logEntry.ProcessingTimeMs = stopwatch.ElapsedMilliseconds;
                        successCount++;
                        
                        if (successCount % 100 == 0)
                        {
                            log.LogInformation($"Processed {successCount + errorCount}/{gamesToProcess.Count} remaining games ({successCount} successful, {errorCount} errors, {skippedCount} skipped)");
                        }
                    }
                    catch (Exception ex)
                    {
                        logEntry.Status = "error";
                        logEntry.ErrorMessage = ex.Message;
                        logEntry.ProcessingTimeMs = stopwatch.ElapsedMilliseconds;
                        errorCount++;

                        log.LogError(ex, $"Failed to process game TableId: {gameMetadata.TableId}, PlayerPerspective: {gameMetadata.PlayerPerspective}");
                    }

                    // Append log entry immediately after processing each game
                    await AppendLogEntry(logFileName, logEntry, log);
                }

                var endTime = DateTime.UtcNow;
                var duration = endTime - startTime;

                log.LogInformation($"Migration completed. Total: {totalGames}, Successful: {successCount}, Failed: {errorCount}, Duration: {duration}");

                return new OkObjectResult(new
                {
                    message = "Migration completed successfully",
                    totalGames = totalGames,
                    alreadyProcessed = skippedCount,
                    successfulUpdates = successCount,
                    failedUpdates = errorCount,
                    duration = duration,
                    logFile = logFileName
                });
            }
            catch (Exception ex)
            {
                var errorLogEntry = new MigrationLogEntry
                {
                    Timestamp = DateTime.UtcNow,
                    TableId = 0,
                    PlayerPerspective = 0,
                    Status = "fatal_error",
                    ErrorMessage = $"General migration error: {ex.Message}",
                    ProcessingTimeMs = 0
                };

                await AppendLogEntry(logFileName, errorLogEntry, log);

                log.LogError(ex, "Migration failed with general error");
                return new StatusCodeResult(500);
            }
        }

        private static async Task ProcessSingleGame(GameMetadata gameMetadata, BlobStorageService blobService, ILogger log)
        {
            // Check if blob exists
            var blobExists = await blobService.BlobExistsAsync(
                gameMetadata.PlayerPerspective.ToString(), 
                gameMetadata.TableId.ToString());

            if (!blobExists)
            {
                throw new InvalidOperationException($"Blob not found for game TableId: {gameMetadata.TableId}, PlayerPerspective: {gameMetadata.PlayerPerspective}");
            }

            // Download JSON content
            var jsonContent = await blobService.GetBlobContentAsync(
                gameMetadata.PlayerPerspective.ToString(), 
                gameMetadata.TableId.ToString());

            // Deserialize to GameLogData
            var gameLogData = JsonConvert.DeserializeObject<GameLogData>(jsonContent);
            if (gameLogData == null)
            {
                throw new InvalidOperationException("Failed to deserialize JSON content");
            }

            // Update metadata fields from database
            gameLogData.Map = gameMetadata.Map;
            gameLogData.PreludeOn = gameMetadata.PreludeOn;
            gameLogData.ColoniesOn = gameMetadata.ColoniesOn;
            gameLogData.CorporateEraOn = gameMetadata.CorporateEraOn;
            gameLogData.DraftOn = gameMetadata.DraftOn;
            gameLogData.BeginnersCorporationsOn = gameMetadata.BeginnersCorporationsOn;
            gameLogData.GameSpeed = gameMetadata.GameSpeed;

            // Update game_date to use ParsedDateTime from database
            if (gameMetadata.ParsedDateTime.HasValue)
            {
                gameLogData.GameDate = gameMetadata.ParsedDateTime.Value.ToString("yyyy-MM-dd");
            }

            // Serialize back to JSON
            var updatedJsonContent = JsonConvert.SerializeObject(gameLogData, Formatting.Indented);

            // Upload updated JSON back to blob storage
            await blobService.UploadGameLogAsync(
                gameMetadata.PlayerPerspective.ToString(),
                gameMetadata.TableId.ToString(),
                updatedJsonContent);
        }

        private static async Task AppendLogEntry(string logFileName, MigrationLogEntry logEntry, ILogger log)
        {
            try
            {
                var logLine = JsonConvert.SerializeObject(logEntry, Formatting.None) + Environment.NewLine;
                await File.AppendAllTextAsync(logFileName, logLine);
            }
            catch (Exception ex)
            {
                log.LogError(ex, $"Failed to append log entry for game {logEntry.TableId}_{logEntry.PlayerPerspective}");
            }
        }
    }
}

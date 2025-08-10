using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using BgaTmScraperRegistry.Models;
using BgaTmScraperRegistry.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry
{
    public static class BackfillMissingOpponentCardsFunction
    {
        [FunctionName("BackfillMissingOpponentCards")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", "post", Route = "backfill-missing-opponent-cards")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("BackfillMissingOpponentCards triggered.");

            try
            {
                var sqlConnectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                var blobConnectionString = Environment.GetEnvironmentVariable("BlobStorageConnectionString");

                if (string.IsNullOrWhiteSpace(sqlConnectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                if (string.IsNullOrWhiteSpace(blobConnectionString))
                {
                    log.LogError("Blob storage connection string is not set (AzureWebJobsStorage or BlobStorageConnectionString)");
                    return new StatusCodeResult(500);
                }

                // Parse query params
                int? top = null;
                if (int.TryParse(req.Query["top"].FirstOrDefault(), out var topVal))
                    top = topVal;

                // Services
                var dbService = new GameDatabaseService(sqlConnectionString, log);
                var blobService = new BlobStorageService(blobConnectionString, log);
                var statsService = new GameStatsService(sqlConnectionString, log);

                var worklist = await dbService.GetGamesMissingOpponentCardsAsync(top);

                int processed = 0;
                int opponentPlayersUpdated = 0;
                int cardRowsUpserted = 0;
                int missingBlob = 0;
                var failures = new List<object>();

                if (worklist == null || worklist.Count == 0)
                {
                    log.LogInformation("No games missing opponent cards found.");
                    return new OkObjectResult(new
                    {
                        requestedTop = top,
                        candidates = 0,
                        processed = 0,
                        skipped = 0,
                        opponentPlayersUpdated = 0,
                        cardRowsUpserted = 0
                    });
                }

                log.LogInformation($"Found {worklist.Count} games missing opponent cards");

                foreach (var item in worklist)
                {
                    processed++;
                    log.LogInformation($"Processing TableId={item.TableId}, PlayerPerspective={item.PlayerPerspective} ({processed}/{worklist.Count})");

                    try
                    {
                        // Blob path is constructed inside BlobStorageService using playerPerspective/tableId
                        var playerPerspectiveStr = item.PlayerPerspective.ToString();
                        var tableIdStr = item.TableId.ToString();

                        // Check existence and fetch
                        bool exists = await blobService.BlobExistsAsync(playerPerspectiveStr, tableIdStr);
                        if (!exists)
                        {
                            missingBlob++;
                            log.LogWarning($"Blob not found for TableId={item.TableId}, PlayerPerspective={item.PlayerPerspective}");
                            failures.Add(new { item.TableId, item.PlayerPerspective, reason = "blob_not_found" });
                            continue;
                        }

                        string json;
                        try
                        {
                            json = await blobService.GetBlobContentAsync(playerPerspectiveStr, tableIdStr);
                        }
                        catch (Exception exBlob)
                        {
                            missingBlob++;
                            log.LogError(exBlob, $"Failed to download blob for TableId={item.TableId}, PlayerPerspective={item.PlayerPerspective}");
                            failures.Add(new { item.TableId, item.PlayerPerspective, reason = "blob_download_failed", error = exBlob.Message });
                            continue;
                        }

                        GameLogData gameLogData;
                        try
                        {
                            gameLogData = JsonConvert.DeserializeObject<GameLogData>(json);
                        }
                        catch (JsonException jex)
                        {
                            log.LogError(jex, $"Failed to deserialize GameLogData for TableId={item.TableId}, PlayerPerspective={item.PlayerPerspective}");
                            failures.Add(new { item.TableId, item.PlayerPerspective, reason = "invalid_json", error = jex.Message });
                            continue;
                        }

                        // Sanity checks
                        if (gameLogData == null)
                        {
                            log.LogWarning($"Deserialized GameLogData is null for TableId={item.TableId}, PlayerPerspective={item.PlayerPerspective}");
                            failures.Add(new { item.TableId, item.PlayerPerspective, reason = "deserialized_null" });
                            continue;
                        }

                        // Parse cards and filter to opponents only
                        var parser = new GameLogDataParser();
                        var allCards = parser.ParseGameCards(gameLogData);
                        var opponentCards = allCards.Where(c => c.PlayerId != item.PlayerPerspective).ToList();

                        if (opponentCards.Count == 0)
                        {
                            log.LogInformation($"No opponent cards found for TableId={item.TableId}, PlayerPerspective={item.PlayerPerspective}");
                            continue;
                        }

                        // Count unique opponent players
                        var uniqueOpponentPlayers = opponentCards.Select(c => c.PlayerId).Distinct().Count();

                        // Upsert only opponent cards
                        try
                        {
                            using var connection = new SqlConnection(sqlConnectionString);
                            await connection.OpenAsync();

                            using var transaction = connection.BeginTransaction();
                            try
                            {
                                await statsService.UpsertGameCardsAsync(connection, transaction, opponentCards);
                                transaction.Commit();

                                opponentPlayersUpdated += uniqueOpponentPlayers;
                                cardRowsUpserted += opponentCards.Count;

                                log.LogInformation($"Successfully upserted {opponentCards.Count} opponent cards for {uniqueOpponentPlayers} players in TableId={item.TableId}");
                            }
                            catch (Exception txEx)
                            {
                                transaction.Rollback();
                                throw txEx;
                            }
                        }
                        catch (Exception ux)
                        {
                            log.LogError(ux, $"Failed to upsert opponent cards for TableId={item.TableId}, PlayerPerspective={item.PlayerPerspective}");
                            failures.Add(new { item.TableId, item.PlayerPerspective, reason = "upsert_failed", error = ux.Message });
                            continue;
                        }
                    }
                    catch (Exception ex)
                    {
                        log.LogError(ex, $"Unexpected error processing TableId={item.TableId}, PlayerPerspective={item.PlayerPerspective}");
                        failures.Add(new { item.TableId, item.PlayerPerspective, reason = "unexpected_error", error = ex.Message });
                    }
                }

                var result = new
                {
                    requestedTop = top,
                    candidates = worklist.Count,
                    processed = processed,
                    skipped = missingBlob + failures.Count,
                    opponentPlayersUpdated = opponentPlayersUpdated,
                    cardRowsUpserted = cardRowsUpserted,
                    failures = failures
                };

                log.LogInformation($"Backfill completed. candidates={worklist.Count}, processed={processed}, opponentPlayersUpdated={opponentPlayersUpdated}, cardRowsUpserted={cardRowsUpserted}, failures={failures.Count}");

                return new OkObjectResult(result);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred in BackfillMissingOpponentCardsFunction");
                return new StatusCodeResult(500);
            }
        }
    }
}

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
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry
{
    public static class BackfillRandomMapFunction
    {

        [FunctionName("BackfillRandomMap")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", "post", Route = "backfill-random-map")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("BackfillRandomMap triggered.");

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

                bool dryRun = false;
                if (bool.TryParse(req.Query["dryRun"].FirstOrDefault(), out var dryRunVal))
                    dryRun = dryRunVal;

                bool stopOnError = false;
                if (bool.TryParse(req.Query["stopOnError"].FirstOrDefault(), out var stopOnErrorVal))
                    stopOnError = stopOnErrorVal;

                int? specificTableId = null;
                int? specificPlayerId = null;
                if (int.TryParse(req.Query["tableId"].FirstOrDefault(), out var tId))
                    specificTableId = tId;
                if (int.TryParse(req.Query["playerId"].FirstOrDefault(), out var pId))
                    specificPlayerId = pId;

                // Services
                var dbService = new GameDatabaseService(sqlConnectionString, log);
                var blobService = new BlobStorageService(blobConnectionString, log);

                List<MissingStatsItem> worklist;

                if (specificTableId.HasValue && specificPlayerId.HasValue)
                {
                    worklist = new List<MissingStatsItem>
                    {
                        new MissingStatsItem { TableId = specificTableId.Value, PlayerId = specificPlayerId.Value }
                    };
                }
                else
                {
                    worklist = await dbService.GetGamesWithRandomMapAsync(top);
                }

                int processed = 0;
                int updated = 0;
                int missingBlob = 0;
                int missingMapField = 0;
                var failures = new List<object>();

                if (worklist == null || worklist.Count == 0)
                {
                    log.LogInformation("No games with Random map found.");
                    return new OkObjectResult(new
                    {
                        requestedTop = top,
                        dryRun,
                        totalFound = 0,
                        processed = 0,
                        updated = 0,
                        missingBlob = 0,
                        missingMapField = 0,
                        failures = new object[0]
                    });
                }

                log.LogInformation($"Found {worklist.Count} games with Random map to process");

                foreach (var item in worklist)
                {
                    processed++;
                    log.LogInformation($"Processing TableId={item.TableId}, PlayerId={item.PlayerId} ({processed}/{worklist.Count})");

                    if (dryRun)
                    {
                        // don't fetch or update; just report planned action
                        continue;
                    }

                    try
                    {
                        // Blob path is constructed inside BlobStorageService using playerPerspective/tableId
                        var playerPerspectiveStr = item.PlayerId.ToString();
                        var tableIdStr = item.TableId.ToString();

                        // Check existence and fetch
                        bool exists = await blobService.BlobExistsAsync(playerPerspectiveStr, tableIdStr);
                        if (!exists)
                        {
                            missingBlob++;
                            log.LogWarning($"Blob not found for TableId={item.TableId}, PlayerId={item.PlayerId}");
                            failures.Add(new { item.TableId, item.PlayerId, reason = "blob_not_found" });
                            if (stopOnError) break;
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
                            log.LogError(exBlob, $"Failed to download blob for TableId={item.TableId}, PlayerId={item.PlayerId}");
                            failures.Add(new { item.TableId, item.PlayerId, reason = "blob_download_failed", error = exBlob.Message });
                            if (stopOnError) break;
                            continue;
                        }

                        GameLogData gameLogData;
                        try
                        {
                            gameLogData = JsonConvert.DeserializeObject<GameLogData>(json);
                        }
                        catch (JsonException jex)
                        {
                            log.LogError(jex, $"Failed to deserialize GameLogData for TableId={item.TableId}, PlayerId={item.PlayerId}");
                            failures.Add(new { item.TableId, item.PlayerId, reason = "invalid_json", error = jex.Message });
                            if (stopOnError) break;
                            continue;
                        }

                        // Sanity checks
                        if (gameLogData == null)
                        {
                            log.LogWarning($"Deserialized GameLogData is null for TableId={item.TableId}, PlayerId={item.PlayerId}");
                            failures.Add(new { item.TableId, item.PlayerId, reason = "deserialized_null" });
                            if (stopOnError) break;
                            continue;
                        }

                        var rawMap = GameLogMapResolver.ResolveMap(gameLogData, log);
                        if (string.IsNullOrWhiteSpace(rawMap) ||
                            string.Equals(rawMap, "Random", StringComparison.OrdinalIgnoreCase))
                        {
                            missingMapField++;
                            log.LogWarning($"Could not determine map for TableId={item.TableId}, PlayerId={item.PlayerId}");
                            failures.Add(new { item.TableId, item.PlayerId, reason = "map_field_missing" });
                            if (stopOnError) break;
                            continue;
                        }

                        // Normalize the map name to English
                        var normalizedMap = MapNameNormalizer.NormalizeMapName(rawMap, log);

                        // Update the database
                        try
                        {
                            var success = await dbService.UpdateGameMapAsync(item.TableId, item.PlayerId, normalizedMap);
                            if (success)
                            {
                                updated++;
                                log.LogInformation($"Updated map to '{normalizedMap}' for TableId={item.TableId}, PlayerId={item.PlayerId}");
                            }
                            else
                            {
                                log.LogWarning($"Update returned false for TableId={item.TableId}, PlayerId={item.PlayerId}");
                                failures.Add(new { item.TableId, item.PlayerId, reason = "update_returned_false" });
                            }
                        }
                        catch (Exception ux)
                        {
                            log.LogError(ux, $"Failed to update map for TableId={item.TableId}, PlayerId={item.PlayerId}");
                            failures.Add(new { item.TableId, item.PlayerId, reason = "update_failed", error = ux.Message });
                            if (stopOnError) break;
                            continue;
                        }
                    }
                    catch (Exception ex)
                    {
                        log.LogError(ex, $"Unexpected error processing TableId={item.TableId}, PlayerId={item.PlayerId}");
                        failures.Add(new { item.TableId, item.PlayerId, reason = "unexpected_error", error = ex.Message });
                        if (stopOnError) break;
                    }
                }

                var result = new
                {
                    requestedTop = top,
                    dryRun,
                    totalFound = worklist.Count,
                    processed = processed,
                    updated = updated,
                    missingBlob = missingBlob,
                    missingMapField = missingMapField,
                    failures = failures
                };

                log.LogInformation($"Backfill completed. processed={processed}, updated={updated}, missingBlob={missingBlob}, missingMapField={missingMapField}, failures={failures.Count}");

                return new OkObjectResult(result);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred in BackfillRandomMapFunction");
                return new StatusCodeResult(500);
            }
        }
    }
}

using System;
using System.Collections.Generic;
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
    public static class BackfillMissingGameStatsFunction
    {
        [FunctionName("BackfillMissingGameStats")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", "post", Route = "backfill-missing-game-stats")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("BackfillMissingGameStats triggered.");

            try
            {
                var sqlConnectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                var blobConnectionString = Environment.GetEnvironmentVariable("BlobStorageConnectionString") ;

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
                var statsService = new GameStatsService(sqlConnectionString, log);

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
                    worklist = await dbService.GetGamesMissingStatsAsync(top);
                }

                var summary = new
                {
                    RequestedTop = top,
                    DryRun = dryRun,
                    TotalFound = worklist?.Count ?? 0,
                    Processed = 0,
                    Upserted = 0,
                    MissingBlob = 0,
                    Failures = new List<object>()
                };

                int processed = 0;
                int upserted = 0;
                int missingBlob = 0;
                var failures = new List<object>();

                if (worklist == null || worklist.Count == 0)
                {
                    log.LogInformation("No missing stats items found.");
                    return new OkObjectResult(new
                    {
                        requestedTop = top,
                        dryRun,
                        totalFound = 0,
                        processed = 0,
                        upserted = 0,
                        missingBlob = 0,
                        failures = new object[0]
                    });
                }

                foreach (var item in worklist)
                {
                    processed++;
                    log.LogInformation($"Processing TableId={item.TableId}, PlayerId={item.PlayerId} ({processed}/{worklist.Count})");

                    if (dryRun)
                    {
                        // don't fetch or upsert; just report planned action
                        continue;
                    }

                    try
                    {
                        // Blob path is constructed inside BlobStorageService using playerPerspective/tableId
                        var playerPerspectiveStr = item.PlayerId.ToString();
                        var tableIdStr = item.TableId.ToString();

                        // Check existence (optional) and fetch
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

                        // Sanity checks (best-effort)
                        if (gameLogData == null)
                        {
                            log.LogWarning($"Deserialized GameLogData is null for TableId={item.TableId}, PlayerId={item.PlayerId}");
                            failures.Add(new { item.TableId, item.PlayerId, reason = "deserialized_null" });
                            if (stopOnError) break;
                            continue;
                        }

                        // Upsert stats
                        try
                        {
                            await statsService.UpsertGameStatsAsync(gameLogData);
                            upserted++;
                        }
                        catch (Exception ux)
                        {
                            log.LogError(ux, $"Failed to upsert stats for TableId={item.TableId}, PlayerId={item.PlayerId}");
                            failures.Add(new { item.TableId, item.PlayerId, reason = "upsert_failed", error = ux.Message });
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
                    upserted = upserted,
                    missingBlob = missingBlob,
                    failures = failures
                };

                log.LogInformation($"Backfill completed. processed={processed}, upserted={upserted}, missingBlob={missingBlob}, failures={failures.Count}");

                return new OkObjectResult(result);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred in BackfillMissingGameStatsFunction");
                return new StatusCodeResult(500);
            }
        }
    }
}

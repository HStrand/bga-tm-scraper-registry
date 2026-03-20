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
using Dapper;

namespace BgaTmScraperRegistry
{
    public static class BackfillPlacedGenFunction
    {
        [FunctionName("BackfillPlacedGen")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", "post", Route = "backfill-placed-gen")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("BackfillPlacedGen triggered.");

            try
            {
                var sqlConnectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                var blobConnectionString = Environment.GetEnvironmentVariable("BlobStorageConnectionString");

                if (string.IsNullOrWhiteSpace(sqlConnectionString))
                    return new StatusCodeResult(500);
                if (string.IsNullOrWhiteSpace(blobConnectionString))
                    return new StatusCodeResult(500);

                int? top = null;
                if (int.TryParse(req.Query["top"].FirstOrDefault(), out var topVal))
                    top = topVal;

                bool dryRun = false;
                if (bool.TryParse(req.Query["dryRun"].FirstOrDefault(), out var dryRunVal))
                    dryRun = dryRunVal;

                bool stopOnError = false;
                if (bool.TryParse(req.Query["stopOnError"].FirstOrDefault(), out var stopOnErrorVal))
                    stopOnError = stopOnErrorVal;

                // Find all games that have at least one NULL PlacedGen
                var worklist = await GetGamesWithMissingPlacedGenAsync(sqlConnectionString, top);
                log.LogInformation("Found {count} games with missing PlacedGen", worklist.Count);

                if (worklist.Count == 0 || dryRun)
                {
                    return new OkObjectResult(new
                    {
                        dryRun,
                        totalFound = worklist.Count,
                        processed = 0,
                        updated = 0,
                        missingBlob = 0,
                        failures = new object[0]
                    });
                }

                var blobService = new BlobStorageService(blobConnectionString, log);
                var parser = new GameLogDataParser();

                int processed = 0;
                int updated = 0;
                int missingBlob = 0;
                var failures = new List<object>();

                foreach (var item in worklist)
                {
                    processed++;

                    try
                    {
                        var playerPerspective = item.PlayerPerspective.ToString();
                        var tableId = item.TableId.ToString();

                        string json;
                        try
                        {
                            json = await blobService.GetBlobContentAsync(playerPerspective, tableId);
                        }
                        catch
                        {
                            missingBlob++;
                            log.LogWarning("({p}/{total}) TableId={tableId} Player={player} — blob not found",
                                processed, worklist.Count, item.TableId, item.PlayerPerspective);
                            continue;
                        }

                        var gameLogData = JsonConvert.DeserializeObject<GameLogData>(json);
                        if (gameLogData == null)
                        {
                            failures.Add(new { item.TableId, item.PlayerPerspective, reason = "deserialized_null" });
                            log.LogWarning("({p}/{total}) TableId={tableId} Player={player} — deserialized null",
                                processed, worklist.Count, item.TableId, item.PlayerPerspective);
                            if (stopOnError) break;
                            continue;
                        }

                        var cities = parser.ParseGameCityLocations(gameLogData);
                        var greeneries = parser.ParseGameGreeneryLocations(gameLogData);

                        var citiesStillNull = cities.Count(c => !c.PlacedGen.HasValue);
                        var greeneriesStillNull = greeneries.Count(g => !g.PlacedGen.HasValue);
                        if (citiesStillNull > 0 || greeneriesStillNull > 0)
                        {
                            log.LogWarning("({p}/{total}) TableId={tableId} Player={player} — still missing PlacedGen: cities={citiesNull}/{citiesTotal} greeneries={greeneriesNull}/{greeneriesTotal}",
                                processed, worklist.Count, item.TableId, item.PlayerPerspective,
                                citiesStillNull, cities.Count, greeneriesStillNull, greeneries.Count);
                        }

                        int rowsUpdated = await UpdateMissingPlacedGenAsync(
                            sqlConnectionString, item.TableId, cities, greeneries);

                        log.LogInformation("({p}/{total}) TableId={tableId} Player={player} — cities={cities} greeneries={greeneries} rowsUpdated={rows}",
                            processed, worklist.Count, item.TableId, item.PlayerPerspective,
                            cities.Count, greeneries.Count, rowsUpdated);

                        if (rowsUpdated > 0)
                            updated++;
                    }
                    catch (Exception ex)
                    {
                        log.LogError(ex, "Error processing TableId={tableId}", item.TableId);
                        failures.Add(new { item.TableId, item.PlayerPerspective, reason = ex.Message });
                        if (stopOnError) break;
                    }
                }

                var result = new
                {
                    dryRun,
                    totalFound = worklist.Count,
                    processed,
                    updated,
                    missingBlob,
                    failures
                };

                log.LogInformation("BackfillPlacedGen completed. processed={processed}, updated={updated}, missingBlob={missingBlob}, failures={failures}",
                    processed, updated, missingBlob, failures.Count);

                return new OkObjectResult(result);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error in BackfillPlacedGen");
                return new StatusCodeResult(500);
            }
        }

        private static async Task<List<MissingPlacedGenItem>> GetGamesWithMissingPlacedGenAsync(string connectionString, int? top)
        {
            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();

            var topClause = top.HasValue && top.Value > 0 ? $"TOP({top.Value})" : "";

            var sql = $@"
                SELECT {topClause} t.TableId, MIN(g.PlayerPerspective) AS PlayerPerspective
                FROM (
                    SELECT DISTINCT TableId FROM GameCityLocations WHERE PlacedGen IS NULL
                    UNION
                    SELECT DISTINCT TableId FROM GameGreeneryLocations WHERE PlacedGen IS NULL
                ) t
                INNER JOIN Games g ON g.TableId = t.TableId
                WHERE g.ScrapedAt IS NOT NULL
                GROUP BY t.TableId
                ORDER BY t.TableId";

            var results = await connection.QueryAsync<MissingPlacedGenItem>(sql, commandTimeout: 300);
            return results.ToList();
        }

        private static async Task<int> UpdateMissingPlacedGenAsync(
            string connectionString,
            int tableId,
            List<GameCityLocation> cities,
            List<GameGreeneryLocation> greeneries)
        {
            var cityUpdates = cities.Where(c => c.PlacedGen.HasValue).ToList();
            var greeneryUpdates = greeneries.Where(g => g.PlacedGen.HasValue).ToList();

            if (cityUpdates.Count == 0 && greeneryUpdates.Count == 0)
                return 0;

            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();

            int totalUpdated = 0;

            if (cityUpdates.Count > 0)
            {
                var rows = await connection.ExecuteAsync(@"
                    UPDATE GameCityLocations
                    SET PlacedGen = @PlacedGen, UpdatedAt = @UpdatedAt
                    WHERE TableId = @TableId AND PlayerId = @PlayerId AND CityLocation = @CityLocation
                      AND PlacedGen IS NULL",
                    cityUpdates.Select(c => new { c.TableId, c.PlayerId, c.CityLocation, c.PlacedGen, UpdatedAt = DateTime.UtcNow }),
                    commandTimeout: 60);
                totalUpdated += rows;
            }

            if (greeneryUpdates.Count > 0)
            {
                var rows = await connection.ExecuteAsync(@"
                    UPDATE GameGreeneryLocations
                    SET PlacedGen = @PlacedGen, UpdatedAt = @UpdatedAt
                    WHERE TableId = @TableId AND PlayerId = @PlayerId AND GreeneryLocation = @GreeneryLocation
                      AND PlacedGen IS NULL",
                    greeneryUpdates.Select(g => new { g.TableId, g.PlayerId, g.GreeneryLocation, g.PlacedGen, UpdatedAt = DateTime.UtcNow }),
                    commandTimeout: 60);
                totalUpdated += rows;
            }

            return totalUpdated;
        }

        private class MissingPlacedGenItem
        {
            public int TableId { get; set; }
            public int PlayerPerspective { get; set; }
        }
    }
}

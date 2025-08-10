using System;
using System.Data;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Caching.Memory;
using Dapper;
using Microsoft.Data.SqlClient;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetAllCorporationStats
    {
        private static readonly MemoryCache Cache = new MemoryCache(new MemoryCacheOptions());
        private const string CacheKey = "AllCorporationPlayerStats:v1";

        public class AllCorporationPlayerStatsRow
        {
            public int TableId { get; set; }
            public string Map { get; set; }
            public bool PreludeOn { get; set; }
            public bool ColoniesOn { get; set; }
            public bool DraftOn { get; set; }
            public string GameMode { get; set; }
            public string GameSpeed { get; set; }
            public int? PlayerCount { get; set; }
            public int? DurationMinutes { get; set; }
            public int? Generations { get; set; }
            public string Corporation { get; set; }
            public int? FinalScore { get; set; }
            public int? FinalTr { get; set; }
            public int? GreeneryPoints { get; set; }
            public int? CityPoints { get; set; }
            public int? MilestonePoints { get; set; }
            public int? AwardPoints { get; set; }
            public int? CardPoints { get; set; }
            public int PlayerId { get; set; }
            public string PlayerName { get; set; }
            public int? Elo { get; set; }
            public int? EloChange { get; set; }
            public int? Position { get; set; }
        }

        [FunctionName(nameof(GetAllCorporationStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "corporations/playerstats")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetAllCorporationStats function processed a request");

            try
            {
                // Check cache first
                if (Cache.TryGetValue(CacheKey, out List<AllCorporationPlayerStatsRow> cachedData))
                {
                    log.LogInformation($"Returning {cachedData.Count} rows from cache");
                    return new OkObjectResult(cachedData);
                }

                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var sql = @"
SELECT	
    gs.TableId,
    g.Map,
	g.PreludeOn,
	g.ColoniesOn,
	g.DraftOn,
	g.GameMode,
	g.GameSpeed,
	gs.PlayerCount,
	gs.DurationMinutes,
	gs.Generations, 
	gps.Corporation,  
	gps.FinalScore,
	gps.FinalTr,
	gps.GreeneryPoints,
	gps.CityPoints,
	gps.MilestonePoints,
	gps.AwardPoints,
	gps.CardPoints,
	gps.PlayerId,
	gp.PlayerName AS PlayerName,
	gp.Elo,
	gp.EloChange,
	gp.Position
FROM GamePlayerStats gps
INNER JOIN Games g ON gps.TableId = g.TableId
INNER JOIN GameStats gs ON gs.TableId = gps.TableId
INNER JOIN GamePlayers gp ON gp.TableId = gs.TableId AND gp.PlayerId = gps.PlayerId
WHERE gps.Corporation <> 'Unknown'
ORDER BY gs.TableId DESC";

                using var conn = new SqlConnection(connectionString);
                await conn.OpenAsync();

                var rows = await conn.QueryAsync<AllCorporationPlayerStatsRow>(sql);
                var list = rows.ToList();

                // Cache the results for 24 hours
                var cacheOptions = new MemoryCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24)
                };
                Cache.Set(CacheKey, list, cacheOptions);

                log.LogInformation($"Retrieved and cached {list.Count} player stats records for all corporations");

                return new OkObjectResult(list);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting all corporation player stats");
                return new StatusCodeResult(500);
            }
        }
    }
}

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
using Dapper;
using Microsoft.Data.SqlClient;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetCorporationStats
    {
        public class CorporationPlayerStatsRow
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

        [FunctionName(nameof(GetCorporationStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "corporations/{corporation}/playerstats")] HttpRequest req,
            string corporation,
            ILogger log)
        {
            corporation = corporation.Replace("_", " ");
            log.LogInformation($"GetCorporationStats function processed a request for corporation: {corporation}");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                if (string.IsNullOrWhiteSpace(corporation))
                {
                    log.LogWarning("Corporation parameter is null or empty");
                    return new BadRequestObjectResult("Corporation parameter is required");
                }

                var sql = @"
WITH best_g AS (
    SELECT g.TableId, g.Map, g.PreludeOn, g.ColoniesOn, g.DraftOn,
           g.GameMode, g.GameSpeed,
           rn = ROW_NUMBER() OVER (
               PARTITION BY g.TableId
               ORDER BY g.IndexedAt DESC, g.Id DESC   -- pick the most recent row per game
           )
    FROM Games g
),
best_gp AS (
    SELECT gp.TableId, gp.PlayerId,
           gp.PlayerName, gp.Elo, gp.EloChange, gp.Position,
           rn = ROW_NUMBER() OVER (
               PARTITION BY gp.TableId, gp.PlayerId
               ORDER BY gp.GameId DESC                -- pick latest row per player in game
           )
    FROM GamePlayers gp
)
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
    gps.FinalScore,
    gps.FinalTr,
    gps.GreeneryPoints,
    gps.CityPoints,
    gps.MilestonePoints,
    gps.AwardPoints,
    gps.CardPoints,
    gps.PlayerId,
    gp.PlayerName,
    gp.Elo,
    gp.EloChange,
    gp.Position
FROM GamePlayerStats gps
JOIN GameStats gs
  ON gs.TableId = gps.TableId
JOIN best_g g
  ON g.TableId = gps.TableId AND g.rn = 1
JOIN best_gp gp
  ON gp.TableId = gps.TableId
 AND gp.PlayerId = gps.PlayerId
 AND gp.rn = 1
WHERE gps.Corporation = @Corporation
ORDER BY gs.TableId DESC;";

                using var conn = new SqlConnection(connectionString);
                await conn.OpenAsync();

                var rows = await conn.QueryAsync<CorporationPlayerStatsRow>(sql, new { Corporation = corporation });
                var list = rows.ToList();

                log.LogInformation($"Retrieved {list.Count} player stats records for corporation: {corporation}");

                return new OkObjectResult(list);
            }
            catch (Exception ex)
            {
                log.LogError(ex, $"Error occurred while getting corporation player stats for corporation: {corporation}");
                return new StatusCodeResult(500);
            }
        }
    }
}

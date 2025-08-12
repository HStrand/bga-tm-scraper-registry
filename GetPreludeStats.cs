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
    public static class GetPreludeStats
    {
        public class PreludePlayerStatsRow
        {
            public int TableId { get; set; }
            public int PlayerId { get; set; }
            public string Map {  get; set; }
            public string GameMode { get; set; }
            public string GameSpeed { get; set; }
            public bool PreludeOn { get; set; }
            public bool ColoniesOn { get; set; }
            public bool DraftOn { get; set; }
            public int? SeenGen { get; set; }
            public int? DrawnGen { get; set; }
            public int? KeptGen { get; set; }
            public int? DraftedGen { get; set; }
            public int? BoughtGen { get; set; }
            public int? PlayedGen { get; set; }
            public string DrawType { get; set; }
            public string DrawReason { get; set; }
            public int? VpScored { get; set; }
            public string PlayerName { get; set; }
            public int? Elo { get; set; }
            public int? EloChange { get; set; }
            public int? Position { get; set; }
            public string Corporation { get; set; }
            public int? PlayerCount { get; set; }
        }

        [FunctionName(nameof(GetPreludeStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "preludes/{cardName}/playerstats")] HttpRequest req,
            string cardName,
            ILogger log)
        {
            cardName = cardName.Replace("_", " ");
            log.LogInformation($"GetPreludeStats function processed a request for card: {cardName}");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                if (string.IsNullOrWhiteSpace(cardName))
                {
                    log.LogWarning("Card name parameter is null or empty");
                    return new BadRequestObjectResult("Card name parameter is required");
                }

                var sql = @"
-- Keys limited to players who actually played the card and have a known corp
WITH keys AS (
  SELECT DISTINCT gc.TableId, gc.PlayerId
  FROM GameCards gc WITH (NOLOCK)
  JOIN GamePlayerStats gps WITH (NOLOCK)
    ON gps.TableId = gc.TableId AND gps.PlayerId = gc.PlayerId
   AND gps.Corporation <> 'Unknown'
  WHERE gc.Card = @CardName
    AND gc.PlayedGen IS NOT NULL
),
best_gp AS (  -- choose one GamePlayers row per (TableId, PlayerId)
  SELECT
    gp.TableId, gp.PlayerId,
    gp.PlayerName, gp.Elo, gp.EloChange, gp.Position,
    rn = ROW_NUMBER() OVER (
      PARTITION BY gp.TableId, gp.PlayerId
      ORDER BY CASE WHEN gp.PlayerPerspective = gp.PlayerId THEN 0 ELSE 1 END,
               gp.GameId DESC
    )
  FROM GamePlayers gp WITH (NOLOCK)
  JOIN keys k ON k.TableId = gp.TableId AND k.PlayerId = gp.PlayerId
),
best_g AS (    -- choose one Games row per TableId
  SELECT
    g.TableId, g.Map, g.GameMode, g.GameSpeed, g.PreludeOn, g.ColoniesOn, g.DraftOn,
    rn = ROW_NUMBER() OVER (
      PARTITION BY g.TableId
      ORDER BY g.IndexedAt DESC, g.Id DESC
    )
  FROM Games g WITH (NOLOCK)
  JOIN (SELECT DISTINCT TableId FROM keys) t ON t.TableId = g.TableId
)
SELECT
  gc.TableId,
  gc.PlayerId,
  g.Map, g.GameMode, g.GameSpeed, g.PreludeOn, g.ColoniesOn, g.DraftOn,
  gc.SeenGen, gc.DrawnGen, gc.KeptGen, gc.DraftedGen, gc.BoughtGen,
  gc.PlayedGen, gc.DrawType, gc.DrawReason, gc.VpScored,
  gp.PlayerName, gp.Elo, gp.EloChange, gp.Position,
  gps.Corporation,
  gs.PlayerCount
FROM GameCards gc WITH (NOLOCK)
JOIN (SELECT * FROM best_gp WHERE rn = 1) gp
  ON gp.TableId = gc.TableId AND gp.PlayerId = gc.PlayerId
JOIN (SELECT * FROM best_g  WHERE rn = 1) g
  ON g.TableId = gc.TableId
JOIN GamePlayerStats gps WITH (NOLOCK)
  ON gps.TableId = gc.TableId AND gps.PlayerId = gc.PlayerId
JOIN GameStats gs WITH (NOLOCK)
  ON gs.TableId = gc.TableId
WHERE gc.Card = @CardName
  AND gc.PlayedGen IS NOT NULL
  AND gps.Corporation <> 'Unknown';";

                using var conn = new SqlConnection(connectionString);
                await conn.OpenAsync();

                var rows = await conn.QueryAsync<PreludePlayerStatsRow>(sql, new { CardName = cardName });

                var list = rows.ToList();

                log.LogInformation($"Retrieved {list.Count} player stats records for prelude card: {cardName}");

                return new OkObjectResult(list);
            }
            catch (Exception ex)
            {
                log.LogError(ex, $"Error occurred while getting prelude player stats for card: {cardName}");
                return new StatusCodeResult(500);
            }
        }
    }
}

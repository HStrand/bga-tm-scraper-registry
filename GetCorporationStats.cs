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
            public string Map {  get; set; }
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

        public class CorporationMilestoneStats
        {
            public string Milestone { get; set; }
            public int ClaimedCount { get; set; }
            public int TotalGames { get; set; }
            public double ClaimRate { get; set; }
        }

        public class CorporationAwardStats
        {
            public string Award { get; set; }
            public int WonCount { get; set; }
            public int TotalGames { get; set; }
            public double WinRate { get; set; }
        }

        public class CorporationStatsResponse
        {
            public List<CorporationPlayerStatsRow> PlayerStats { get; set; }
            public List<CorporationMilestoneStats> MilestoneStats { get; set; }
            public List<CorporationAwardStats> AwardStats { get; set; }
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

                var playerStatsSql = @"
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
	gp.PlayerName AS PlayerName,
	gp.Elo,
	gp.EloChange,
	gp.Position
FROM GamePlayerStats gps
INNER JOIN Games g ON gps.TableId = g.TableId
INNER JOIN GameStats gs ON gs.TableId = gps.TableId
INNER JOIN GamePlayers gp ON gp.TableId = gs.TableId AND gp.PlayerId = gps.PlayerId
WHERE LOWER(gps.Corporation) = LOWER(@Corporation)
ORDER BY gs.TableId DESC";

                var milestonesSql = @"
SELECT
	gm.TableId,
	gm.Milestone,
	gm.ClaimedBy AS PlayerId
FROM GameMilestones gm
INNER JOIN GamePlayerStats gps ON gps.TableId = gm.TableId AND gps.PlayerId = gm.ClaimedBy
WHERE LOWER(gps.Corporation) = LOWER(@Corporation)";

                var awardsSql = @"
SELECT
	gm.TableId,
	gm.Award,
	gm.PlayerId
FROM GamePlayerAwards gm
INNER JOIN GamePlayerStats gps ON gps.TableId = gm.TableId AND gps.PlayerId = gm.PlayerId
WHERE LOWER(gps.Corporation) = LOWER(@Corporation)
	AND gm.PlayerPlace = 1";

                using var conn = new SqlConnection(connectionString);
                await conn.OpenAsync();

                // Execute all queries
                var playerStatsRows = await conn.QueryAsync<CorporationPlayerStatsRow>(playerStatsSql, new { Corporation = corporation });
                var milestoneRows = await conn.QueryAsync(milestonesSql, new { Corporation = corporation });
                var awardRows = await conn.QueryAsync(awardsSql, new { Corporation = corporation });

                var playerStatsList = playerStatsRows.ToList();
                var totalGames = playerStatsList.Count;

                // Process milestone data
                var milestoneStats = milestoneRows
                    .GroupBy(row => (string)row.Milestone)
                    .Select(group => new CorporationMilestoneStats
                    {
                        Milestone = group.Key,
                        ClaimedCount = group.Count(),
                        TotalGames = totalGames,
                        ClaimRate = totalGames > 0 ? (double)group.Count() / totalGames : 0
                    })
                    .OrderByDescending(ms => ms.ClaimRate)
                    .ToList();

                // Process award data
                var awardStats = awardRows
                    .GroupBy(row => (string)row.Award)
                    .Select(group => new CorporationAwardStats
                    {
                        Award = group.Key,
                        WonCount = group.Count(),
                        TotalGames = totalGames,
                        WinRate = totalGames > 0 ? (double)group.Count() / totalGames : 0
                    })
                    .OrderByDescending(aws => aws.WinRate)
                    .ToList();

                var response = new CorporationStatsResponse
                {
                    PlayerStats = playerStatsList,
                    MilestoneStats = milestoneStats,
                    AwardStats = awardStats
                };

                log.LogInformation($"Retrieved {playerStatsList.Count} player stats, {milestoneStats.Count} milestone stats, and {awardStats.Count} award stats for corporation: {corporation}");

                return new OkObjectResult(response);
            }
            catch (Exception ex)
            {
                log.LogError(ex, $"Error occurred while getting corporation player stats for corporation: {corporation}");
                return new StatusCodeResult(500);
            }
        }
    }
}

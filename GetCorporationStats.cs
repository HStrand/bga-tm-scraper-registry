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
SELECT
	gs.TableId,
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
	p.Name AS PlayerName,
	gp.Elo,
	gp.EloChange,
	gp.Position
FROM GamePlayerStats gps
INNER JOIN GameStats gs ON gs.TableId = gps.TableId
INNER JOIN GamePlayers gp ON gp.TableId = gs.TableId AND gp.PlayerId = gps.PlayerId
INNER JOIN Players p ON p.PlayerId = gps.PlayerId
WHERE LOWER(gps.Corporation) = LOWER(@Corporation)";

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

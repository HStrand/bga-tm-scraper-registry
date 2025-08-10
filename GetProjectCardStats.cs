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
    public static class GetProjectCardStats
    {
        public class ProjectCardPlayerStatsRow
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
            public int? PlayerCount { get; set; }
        }

        [FunctionName(nameof(GetProjectCardStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "cards/{cardName}/playerstats")] HttpRequest req,
            string cardName,
            ILogger log)
        {
            cardName = cardName.Replace("_", " ");
            log.LogInformation($"GetProjectCardStats function processed a request for card: {cardName}");

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

SELECT
	gc.TableId,
	gc.PlayerId,
	g.Map,
	g.GameMode,
	g.GameSpeed,
	g.PreludeOn,
	g.ColoniesOn,
	g.DraftOn,
	gc.SeenGen,
	gc.DrawnGen,
	gc.KeptGen,
	gc.DraftedGen,
	gc.BoughtGen,
	gc.PlayedGen,
	gc.DrawType,
	gc.DrawReason,
	gc.VpScored,
	gp.PlayerName,
	gp.Elo,
	gp.EloChange,
	gp.Position,
	pc.PlayerCount
FROM GameCards gc
INNER JOIN GamePlayers gp ON gp.TableId = gc.TableId AND gp.PlayerId = gc.PlayerId
INNER JOIN Games g ON g.TableId = gp.TableId
    AND gc.PlayedGen IS NOT NULL
INNER JOIN ( SELECT TableId, PlayerCount FROM GameStats ) pc ON pc.TableId = gc.TableId
WHERE LOWER(gc.Card) = LOWER(@CardName)";

                using var conn = new SqlConnection(connectionString);
                await conn.OpenAsync();

                var rows = await conn.QueryAsync<ProjectCardPlayerStatsRow>(sql, new { CardName = cardName });

                var list = rows.ToList();

                log.LogInformation($"Retrieved {list.Count} player stats records for card: {cardName}");

                return new OkObjectResult(list);
            }
            catch (Exception ex)
            {
                log.LogError(ex, $"Error occurred while getting project card player stats for card: {cardName}");
                return new StatusCodeResult(500);
            }
        }
    }
}

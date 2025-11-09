using System;
using System.Text;
using System.Threading.Tasks;
using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;
using Dapper;

namespace BgaTmScraperRegistry
{
    public static class GetGamesCsv
    {
        private const string Query = @"
WITH g1 AS (
  SELECT g.TableId, g.VersionId, g.ParsedDateTime, g.GameMode, g.GameSpeed, g.Map, g.PreludeOn, g.ColoniesOn,
         g.CorporateEraOn, g.DraftOn, g.BeginnersCorporationsOn,
         ROW_NUMBER() OVER (PARTITION BY g.TableId ORDER BY g.Id) AS rn
  FROM Games g
),
gp1 AS (
  SELECT gp.*,
         ROW_NUMBER() OVER (
           PARTITION BY gp.TableId, gp.PlayerId
           ORDER BY CASE WHEN gp.PlayerPerspective = gp.PlayerId THEN 0 ELSE 1 END,
                    gp.Position, gp.GameId
         ) AS rn
  FROM GamePlayers gp
)
SELECT 
  gp.TableId, g.VersionId, g.ParsedDateTime, gp.PlayerId, p.Name AS PlayerName,
  g.GameMode, g.GameSpeed, g.Map, g.PreludeOn, g.ColoniesOn,
  g.CorporateEraOn, g.DraftOn, g.BeginnersCorporationsOn,
  gs.PlayerCount, gs.DurationMinutes, gs.Generations,
  gp.Elo, gp.EloChange, gp.ArenaPoints, gp.ArenaPointsChange,
  gp.Position, gs.Conceded
FROM gp1 gp
LEFT JOIN g1 g
  ON g.TableId = gp.TableId AND g.rn = 1
LEFT JOIN Players p
  ON p.PlayerId = gp.PlayerId
LEFT JOIN GameStats gs
  ON gs.TableId = gp.TableId
WHERE gp.rn = 1
ORDER BY gp.TableId, gp.PlayerId;";

        [FunctionName(nameof(GetGamesCsv))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", Route = "games/csv")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetGamesCsv function processing request.");
            try
            {
                var connStr = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrWhiteSpace(connStr))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                await using var conn = new SqlConnection(connStr);
                await conn.OpenAsync();

                var rows = await conn.QueryAsync(Query);

                var sb = new StringBuilder();
                // header
                sb.AppendLine(string.Join(",",
                    Csv("TableId"),
                    Csv("VersionId"),
                    Csv("ParsedDateTime"),
                    Csv("PlayerId"),
                    Csv("PlayerName"),
                    Csv("GameMode"),
                    Csv("GameSpeed"),
                    Csv("Map"),
                    Csv("PreludeOn"),
                    Csv("ColoniesOn"),
                    Csv("CorporateEraOn"),
                    Csv("DraftOn"),
                    Csv("BeginnersCorporationsOn"),
                    Csv("PlayerCount"),
                    Csv("DurationMinutes"),
                    Csv("Generations"),
                    Csv("Elo"),
                    Csv("EloChange"),
                    Csv("ArenaPoints"),
                    Csv("ArenaPointsChange"),
                    Csv("Position"),
                    Csv("Conceded")));

                foreach (var r in rows)
                {
                    string Bool(object v) => v is bool b ? (b ? "true" : "false") : ToStr(v);
                    string ToStr(object v)
                    {
                        if (v == null) return "";
                        return v is IFormattable f ? f.ToString(null, CultureInfo.InvariantCulture) : v.ToString();
                    }

                    string Iso(object v)
                    {
                        if (v == null) return "";
                        if (v is DateTime dt) return dt.Kind == DateTimeKind.Unspecified ? dt.ToString("s") : dt.ToUniversalTime().ToString("s");
                        if (v is DateTimeOffset dto) return dto.ToUniversalTime().ToString("s");
                        return ToStr(v);
                    }

                    sb.AppendLine(string.Join(",",
                        Csv(ToStr(r.TableId)),
                        Csv(ToStr(r.VersionId)),
                        Csv(Iso(r.ParsedDateTime)),
                        Csv(ToStr(r.PlayerId)),
                        Csv(ToStr(r.PlayerName)),
                        Csv(ToStr(r.GameMode)),
                        Csv(ToStr(r.GameSpeed)),
                        Csv(ToStr(r.Map)),
                        Csv(Bool(r.PreludeOn)),
                        Csv(Bool(r.ColoniesOn)),
                        Csv(Bool(r.CorporateEraOn)),
                        Csv(Bool(r.DraftOn)),
                        Csv(Bool(r.BeginnersCorporationsOn)),
                        Csv(ToStr(r.PlayerCount)),
                        Csv(ToStr(r.DurationMinutes)),
                        Csv(ToStr(r.Generations)),
                        Csv(ToStr(r.Elo)),
                        Csv(ToStr(r.EloChange)),
                        Csv(ToStr(r.ArenaPoints)),
                        Csv(ToStr(r.ArenaPointsChange)),
                        Csv(ToStr(r.Position)),
                        Csv(Bool(r.Conceded))
                    ));
                }

                var bytes = Encoding.UTF8.GetBytes(sb.ToString());
                var file = new FileContentResult(bytes, "text/csv; charset=utf-8")
                {
                    FileDownloadName = "games.csv"
                };
                return file;
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error generating games CSV");
                return new StatusCodeResult(500);
            }

            static string Csv(string s)
            {
                if (s == null) return "\"\"";
                var escaped = s.Replace("\"", "\"\"");
                return $"\"{escaped}\"";
            }
        }
    }
}

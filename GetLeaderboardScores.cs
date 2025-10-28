using System;
using System.Linq;
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Primitives;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetLeaderboardScores
    {
        [FunctionName(nameof(GetLeaderboardScores))]
        public static async System.Threading.Tasks.Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "leaderboards/scores")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetLeaderboardScores function processed a request");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var (filter, limit) = ParseFilter(req);

                var service = new PlayerScoreService(connectionString, log);
                var rows = await service.GetPlayerScoresFilteredAsync(filter, limit);

                log.LogInformation("Returning {count} high score rows", rows.Count);
                return new OkObjectResult(rows);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting leaderboard scores");
                return new StatusCodeResult(500);
            }
        }

        private static (PlayerScoreService.ScoreFilter filter, int limit) ParseFilter(HttpRequest req)
        {
            // Helpers
            static string? First(HttpRequest r, params string[] keys)
            {
                foreach (var k in keys)
                {
                    if (r.Query.TryGetValue(k, out var v) && v.Count > 0)
                    {
                        var s = v[0]?.Trim();
                        if (!string.IsNullOrEmpty(s)) return s;
                    }
                }
                return null;
            }

            static IEnumerable<string> CollectValues(HttpRequest r, params string[] keys)
            {
                var list = new List<string>();
                foreach (var k in keys)
                {
                    if (r.Query.TryGetValue(k, out StringValues values))
                    {
                        foreach (var raw in values)
                        {
                            if (string.IsNullOrWhiteSpace(raw)) continue;
                            foreach (var part in raw.Split(',', StringSplitOptions.RemoveEmptyEntries))
                            {
                                var t = part.Trim();
                                if (t.Length > 0) list.Add(t);
                            }
                        }
                    }
                }
                return list;
            }

            static bool? ParseBool(string? s)
            {
                if (s == null) return null;
                if (bool.TryParse(s, out var b)) return b;
                if (int.TryParse(s, out var i)) return i != 0;
                var lowered = s.Trim().ToLowerInvariant();
                return lowered switch
                {
                    "y" or "yes" or "on" => true,
                    "n" or "no" or "off" => false,
                    _ => (bool?)null
                };
            }

            static int? ParseInt(string? s) => int.TryParse(s, out var n) ? n : (int?)null;

            static int[] ParseIntArray(IEnumerable<string> items)
                => items.Select(x => int.TryParse(x, out var n) ? (int?)n : null)
                        .Where(n => n.HasValue)
                        .Select(n => n!.Value)
                        .ToArray();

            var maps = CollectValues(req, "maps", "map").ToArray();
            var modes = CollectValues(req, "modes", "gameModes").ToArray();
            var speeds = CollectValues(req, "speeds", "speed", "gameSpeeds", "gameSpeed").ToArray();
            var playerCounts = ParseIntArray(CollectValues(req, "playerCounts", "playerCount"));

            var filter = new PlayerScoreService.ScoreFilter
            {
                Maps = maps.Length > 0 ? maps : null,
                Modes = modes.Length > 0 ? modes : null,
                Speeds = speeds.Length > 0 ? speeds : null,
                PlayerCounts = playerCounts.Length > 0 ? playerCounts : null,
                PreludeOn = ParseBool(First(req, "preludeOn", "prelude")),
                ColoniesOn = ParseBool(First(req, "coloniesOn", "colonies")),
                DraftOn = ParseBool(First(req, "draftOn", "draft")),
                EloMin = ParseInt(First(req, "eloMin")),
                EloMax = ParseInt(First(req, "eloMax")),
                GenerationsMin = ParseInt(First(req, "generationsMin", "genMin")),
                GenerationsMax = ParseInt(First(req, "generationsMax", "genMax")),
                PlayerName = First(req, "playerName"),
                Corporation = First(req, "corporation")
            };

            var limit = ParseInt(First(req, "limit")) ?? 25;
            limit = Math.Clamp(limit, 1, 100);

            return (filter, limit);
        }
    }
}

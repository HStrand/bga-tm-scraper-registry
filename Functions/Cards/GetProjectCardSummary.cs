using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Primitives;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetProjectCardSummary
    {
        [FunctionName(nameof(GetProjectCardSummary))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "cards/{cardName}/summary")] HttpRequest req,
            string cardName,
            ILogger log)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(cardName))
                    return new BadRequestObjectResult("Card name parameter is required");

                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new ProjectCardStatsService(connectionString, log);
                var summary = await service.GetCardSummaryAsync(cardName, CardFilterParser.Parse(req));
                return new OkObjectResult(summary);
            }
            catch (Exception ex)
            {
                log.LogError(ex, $"Error occurred while getting project card summary for card: {cardName}");
                return new StatusCodeResult(500);
            }
        }
    }

    internal static class CardFilterParser
    {
        public static ProjectCardStatsService.CardFilter Parse(HttpRequest req)
        {
            static string First(HttpRequest r, params string[] keys)
            {
                foreach (var k in keys)
                    if (r.Query.TryGetValue(k, out var v) && v.Count > 0)
                    {
                        var s = v[0]?.Trim();
                        if (!string.IsNullOrEmpty(s)) return s;
                    }
                return null;
            }

            static IEnumerable<string> Collect(HttpRequest r, params string[] keys)
            {
                var list = new List<string>();
                foreach (var k in keys)
                    if (r.Query.TryGetValue(k, out StringValues values))
                        foreach (var raw in values)
                        {
                            if (string.IsNullOrWhiteSpace(raw)) continue;
                            foreach (var part in raw.Split(',', StringSplitOptions.RemoveEmptyEntries))
                            {
                                var t = part.Trim();
                                if (t.Length > 0) list.Add(t);
                            }
                        }
                return list;
            }

            static bool? ParseBool(string s)
            {
                if (s == null) return null;
                if (bool.TryParse(s, out var b)) return b;
                if (int.TryParse(s, out var i)) return i != 0;
                return s.Trim().ToLowerInvariant() switch
                {
                    "y" or "yes" or "on" => true,
                    "n" or "no" or "off" => false,
                    _ => (bool?)null
                };
            }

            static int? ParseInt(string s) => int.TryParse(s, out var n) ? n : (int?)null;
            static int[] ParseIntArray(IEnumerable<string> items)
                => items.Select(x => int.TryParse(x, out var n) ? (int?)n : null)
                        .Where(n => n.HasValue).Select(n => n.Value).ToArray();

            var maps = Collect(req, "maps", "map").ToArray();
            var modes = Collect(req, "modes", "gameModes", "mode").ToArray();
            var speeds = Collect(req, "speeds", "speed", "gameSpeeds", "gameSpeed").ToArray();
            var playerCounts = ParseIntArray(Collect(req, "playerCounts", "playerCount"));

            return new ProjectCardStatsService.CardFilter
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
                PlayedGenMin = ParseInt(First(req, "playedGenMin")),
                PlayedGenMax = ParseInt(First(req, "playedGenMax")),
                PlayerName = First(req, "playerName")
            };
        }
    }
}

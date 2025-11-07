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
    public static class GetPreludePlayerRows
    {
        public class RowsResponse
        {
            public List<PreludeStatsService.PreludePlayerRow> Rows { get; set; }
            public int Total { get; set; }
        }

        [FunctionName(nameof(GetPreludePlayerRows))]
        public static async System.Threading.Tasks.Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "preludes/{cardName}/playerrows")] HttpRequest req,
            string cardName,
            ILogger log)
        {
            cardName = cardName?.Replace("_", " ");
            log.LogInformation("GetPreludePlayerRows for {prelude}", cardName);

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
                    return new BadRequestObjectResult("Prelude parameter is required");
                }

                var (limit, offset) = ParsePaging(req);
                var filter = ParseFilter(req);

                var service = new PreludeStatsService(connectionString, log);
                var all = await service.GetAllPreludePlayerRowsAsync();

                IEnumerable<PreludeStatsService.PreludePlayerRow> q = all.Where(r => string.Equals(r.Prelude, cardName, StringComparison.OrdinalIgnoreCase));

                if (filter != null)
                {
                    if (filter.Maps != null && filter.Maps.Length > 0)
                        q = q.Where(r => !string.IsNullOrEmpty(r.Map) && filter.Maps.Contains(r.Map));
                    if (filter.PreludeOn.HasValue)
                        q = q.Where(r => r.PreludeOn.HasValue && r.PreludeOn.Value == filter.PreludeOn.Value);
                    if (filter.ColoniesOn.HasValue)
                        q = q.Where(r => r.ColoniesOn.HasValue && r.ColoniesOn.Value == filter.ColoniesOn.Value);
                    if (filter.DraftOn.HasValue)
                        q = q.Where(r => r.DraftOn.HasValue && r.DraftOn.Value == filter.DraftOn.Value);
                    if (filter.Modes != null && filter.Modes.Length > 0)
                        q = q.Where(r => !string.IsNullOrEmpty(r.GameMode) && filter.Modes.Contains(r.GameMode));
                    if (filter.Speeds != null && filter.Speeds.Length > 0)
                        q = q.Where(r => !string.IsNullOrEmpty(r.GameSpeed) && filter.Speeds.Contains(r.GameSpeed));
                    if (filter.PlayerCounts != null && filter.PlayerCounts.Length > 0)
                        q = q.Where(r => r.PlayerCount.HasValue && filter.PlayerCounts.Contains(r.PlayerCount.Value));
                    if (filter.Corporations != null && filter.Corporations.Length > 0)
                        q = q.Where(r => !string.IsNullOrEmpty(r.Corporation) && filter.Corporations.Contains(r.Corporation));
                    if (!string.IsNullOrWhiteSpace(filter.Corporation))
                        q = q.Where(r => !string.IsNullOrEmpty(r.Corporation) && string.Equals(r.Corporation, filter.Corporation, StringComparison.OrdinalIgnoreCase));
                    if (filter.EloMin.HasValue)
                        q = q.Where(r => r.Elo.HasValue && r.Elo.Value > 0 && r.Elo.Value >= filter.EloMin.Value);
                    if (filter.EloMax.HasValue)
                        q = q.Where(r => r.Elo.HasValue && r.Elo.Value > 0 && r.Elo.Value <= filter.EloMax.Value);
                    if (!string.IsNullOrWhiteSpace(filter.PlayerName))
                        q = q.Where(r => !string.IsNullOrEmpty(r.PlayerName) && r.PlayerName.Contains(filter.PlayerName, StringComparison.OrdinalIgnoreCase));
                }

                var total = q.Count();
                var rows = q.OrderByDescending(r => r.TableId)
                            .Skip(offset)
                            .Take(limit)
                            .ToList();

                return new OkObjectResult(new RowsResponse { Rows = rows, Total = total });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting prelude rows for {prelude}", cardName);
                return new StatusCodeResult(500);
            }
        }

        private class DetailFilter
        {
            public string[] Maps { get; set; }
            public bool? PreludeOn { get; set; }
            public bool? ColoniesOn { get; set; }
            public bool? DraftOn { get; set; }
            public string[] Modes { get; set; }
            public string[] Speeds { get; set; }
            public int[] PlayerCounts { get; set; }
            public string[] Corporations { get; set; }
            public string Corporation { get; set; }
            public int? EloMin { get; set; }
            public int? EloMax { get; set; }
            public string PlayerName { get; set; }
        }

        private static DetailFilter ParseFilter(HttpRequest req)
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
            var corporations = CollectValues(req, "corporations", "corp").ToArray();
            var corpName = First(req, "corporation");

            return new DetailFilter
            {
                Maps = maps.Length > 0 ? maps : null,
                Modes = modes.Length > 0 ? modes : null,
                Speeds = speeds.Length > 0 ? speeds : null,
                PlayerCounts = playerCounts.Length > 0 ? playerCounts : null,
                Corporations = corporations.Length > 0 ? corporations : null,
                Corporation = string.IsNullOrWhiteSpace(corpName) ? null : corpName,
                PreludeOn = ParseBool(First(req, "preludeOn", "prelude")),
                ColoniesOn = ParseBool(First(req, "coloniesOn", "colonies")),
                DraftOn = ParseBool(First(req, "draftOn", "draft")),
                EloMin = ParseInt(First(req, "eloMin")),
                EloMax = ParseInt(First(req, "eloMax")),
                PlayerName = First(req, "playerName")
            };
        }

        private static (int limit, int offset) ParsePaging(HttpRequest req)
        {
            int TryParse(string? s, int def) => int.TryParse(s, out var n) ? n : def;
            var limit = TryParse(req.Query["limit"], 200);
            var offset = TryParse(req.Query["offset"], 0);
            limit = Math.Clamp(limit, 1, 1000);
            offset = Math.Max(0, offset);
            return (limit, offset);
        }
    }
}

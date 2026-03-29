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
    public static class GetCorporationGames
    {
        public class GamesResponse
        {
            public List<CorporationStatsService.CorporationPlayerStatsRow> Rows { get; set; }
            public int Total { get; set; }
        }

        [FunctionName(nameof(GetCorporationGames))]
        public static async System.Threading.Tasks.Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "corporations/{corporation}/games")] HttpRequest req,
            string corporation,
            ILogger log)
        {
            corporation = corporation?.Replace("_", " ");
            log.LogInformation("GetCorporationGames for {corp}", corporation);

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
                    return new BadRequestObjectResult("Corporation parameter is required");
                }

                var filter = ParseFilter(req);
                var (limit, offset) = ParsePaging(req);

                var service = new CorporationStatsService(connectionString, log);
                var all = await service.GetAllCorporationPlayerStatsAsync();

                IEnumerable<CorporationStatsService.CorporationPlayerStatsRow> q = all.Where(r => string.Equals(r.Corporation, corporation, StringComparison.OrdinalIgnoreCase));

                if (filter != null)
                {
                    if (filter.Maps != null && filter.Maps.Length > 0)
                        q = q.Where(r => !string.IsNullOrEmpty(r.Map) && filter.Maps.Contains(r.Map));
                    if (filter.PreludeOn.HasValue)
                        q = q.Where(r => r.PreludeOn == filter.PreludeOn.Value);
                    if (filter.ColoniesOn.HasValue)
                        q = q.Where(r => r.ColoniesOn == filter.ColoniesOn.Value);
                    if (filter.DraftOn.HasValue)
                        q = q.Where(r => r.DraftOn == filter.DraftOn.Value);
                    if (filter.Modes != null && filter.Modes.Length > 0)
                        q = q.Where(r => !string.IsNullOrEmpty(r.GameMode) && filter.Modes.Contains(r.GameMode));
                    if (filter.Speeds != null && filter.Speeds.Length > 0)
                        q = q.Where(r => !string.IsNullOrEmpty(r.GameSpeed) && filter.Speeds.Contains(r.GameSpeed));
                    if (filter.PlayerCounts != null && filter.PlayerCounts.Length > 0)
                        q = q.Where(r => r.PlayerCount.HasValue && filter.PlayerCounts.Contains(r.PlayerCount.Value));
                    if (filter.EloMin.HasValue)
                        q = q.Where(r => r.Elo.HasValue && r.Elo.Value > 0 && r.Elo.Value >= filter.EloMin.Value);
                    if (filter.EloMax.HasValue)
                        q = q.Where(r => r.Elo.HasValue && r.Elo.Value > 0 && r.Elo.Value <= filter.EloMax.Value);
                    if (filter.GenerationsMin.HasValue)
                        q = q.Where(r => r.Generations.HasValue && r.Generations.Value >= filter.GenerationsMin.Value);
                    if (filter.GenerationsMax.HasValue)
                        q = q.Where(r => r.Generations.HasValue && r.Generations.Value <= filter.GenerationsMax.Value);
                    if (!string.IsNullOrWhiteSpace(filter.PlayerName))
                        q = q.Where(r => !string.IsNullOrEmpty(r.PlayerName) && r.PlayerName.Contains(filter.PlayerName, StringComparison.OrdinalIgnoreCase));
                }

                var total = q.Count();
                var rows = q.OrderByDescending(r => r.TableId)
                            .Skip(offset)
                            .Take(limit)
                            .ToList();

                return new OkObjectResult(new GamesResponse { Rows = rows, Total = total });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting corporation games for {corp}", corporation);
                return new StatusCodeResult(500);
            }
        }

        private static CorporationStatsService.CorpFilter ParseFilter(HttpRequest req)
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

            return new CorporationStatsService.CorpFilter
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

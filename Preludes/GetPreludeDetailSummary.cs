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
    public static class GetPreludeDetailSummary
    {
        public class HistogramBinDto
        {
            public double Min { get; set; }
            public double Max { get; set; }
            public int Count { get; set; }
            public string Label { get; set; }
        }

        public class CorporationPerformanceDto
        {
            public string Corporation { get; set; }
            public int GamesPlayed { get; set; }
            public int Wins { get; set; }
            public double WinRate { get; set; }
            public double AvgEloChange { get; set; }
        }

        public class PreludeDetailSummaryDto
        {
            public int TotalGames { get; set; }
            public double WinRate { get; set; }            // 0..1 fraction
            public double AvgElo { get; set; }
            public double AvgEloChange { get; set; }
            public List<HistogramBinDto> EloHistogramBins { get; set; } = new();
            public List<HistogramBinDto> EloChangeHistogramBins { get; set; } = new();
            public List<CorporationPerformanceDto> CorporationPerformance { get; set; } = new();
        }

        [FunctionName(nameof(GetPreludeDetailSummary))]
        public static async System.Threading.Tasks.Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "preludes/{cardName}/summary")] HttpRequest req,
            string cardName,
            ILogger log)
        {
            cardName = cardName?.Replace("_", " ");
            log.LogInformation("GetPreludeDetailSummary for {prelude}", cardName);

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

                var service = new PreludeStatsService(connectionString, log);
                var all = await service.GetAllPreludePlayerRowsAsync();

                IEnumerable<PreludeStatsService.PreludePlayerRow> q = all.Where(r => string.Equals(r.Prelude, cardName, StringComparison.OrdinalIgnoreCase));

                // Parse filters (mirrors PreludeDetailFilters)
                var filter = ParseFilter(req);

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
                    {
                        var corpNeedle = filter.Corporation.Trim();
                        q = q.Where(r =>
                            !string.IsNullOrWhiteSpace(r.Corporation) &&
                            r.Corporation.Trim().IndexOf(corpNeedle, StringComparison.OrdinalIgnoreCase) >= 0);
                    }
                    if (filter.EloMin.HasValue)
                        q = q.Where(r => r.Elo.HasValue && r.Elo.Value > 0 && r.Elo.Value >= filter.EloMin.Value);
                    if (filter.EloMax.HasValue)
                        q = q.Where(r => r.Elo.HasValue && r.Elo.Value > 0 && r.Elo.Value <= filter.EloMax.Value);
                    if (!string.IsNullOrWhiteSpace(filter.PlayerName))
                        q = q.Where(r => !string.IsNullOrEmpty(r.PlayerName) && r.PlayerName.Contains(filter.PlayerName, StringComparison.OrdinalIgnoreCase));
                }

                var list = q.ToList();

                // Filter to rows with a known result for aggregate stats
                var valid = list.Where(r => r.Position.HasValue).ToList();
                var total = valid.Count;

                var dto = new PreludeDetailSummaryDto();
                if (total == 0)
                {
                    return new OkObjectResult(dto);
                }

                double Avg(IEnumerable<int?> seq) => seq.Select(v => (double)(v ?? 0)).DefaultIfEmpty(0).Average();

                var wins = valid.Count(r => (r.Position ?? 0) == 1);
                dto.TotalGames = total;
                dto.WinRate = total == 0 ? 0 : (double)wins / total;
                dto.AvgElo = Avg(valid.Select(r => r.Elo));
                dto.AvgEloChange = Avg(valid.Select(r => r.EloChange));

                // Elo histogram (dynamic bin count similar to corp)
                var elos = valid.Where(r => r.Elo.HasValue && r.Elo.Value > 0).Select(r => (double)r.Elo!.Value).ToList();
                dto.EloHistogramBins = BuildDynamicHistogram(elos);

                // Elo change histogram: fixed -20..20 with 20 bins
                var eloChanges = valid.Where(r => r.EloChange.HasValue).Select(r => (double)r.EloChange!.Value).ToList();
                dto.EloChangeHistogramBins = BuildFixedHistogram(eloChanges, -20, 20, 20);

                // Corporation performance aggregation
                var corpPerf = valid
                    .Where(r => !string.IsNullOrWhiteSpace(r.Corporation))
                    .GroupBy(r => r.Corporation)
                    .Select(g => new CorporationPerformanceDto
                    {
                        Corporation = g.Key,
                        GamesPlayed = g.Count(),
                        Wins = g.Count(r => (r.Position ?? 0) == 1),
                        WinRate = g.Count() == 0 ? 0.0 : (double)g.Count(r => (r.Position ?? 0) == 1) / g.Count(),
                        AvgEloChange = g.Select(r => (double)(r.EloChange ?? 0)).DefaultIfEmpty(0).Average()
                    })
                    .Where(x => x.GamesPlayed >= 3)
                    .OrderByDescending(x => x.GamesPlayed)
                    .ToList();

                dto.CorporationPerformance = corpPerf;

                return new OkObjectResult(dto);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting prelude detail summary for {prelude}", cardName);
                return new StatusCodeResult(500);
            }
        }

        private static List<HistogramBinDto> BuildDynamicHistogram(List<double> values)
        {
            var bins = new List<HistogramBinDto>();
            if (values == null || values.Count == 0) return bins;

            var min = values.Min();
            var max = values.Max();
            if (min == max)
            {
                bins.Add(new HistogramBinDto { Min = min, Max = max, Count = values.Count, Label = $"{Math.Round(min)}-{Math.Round(max)}" });
                return bins;
            }

            var binCount = Math.Min(12, Math.Max(5, (int)Math.Ceiling(values.Count / 20.0)));
            var binSize = (max - min) / binCount;

            for (int i = 0; i < binCount; i++)
            {
                var bMin = min + i * binSize;
                var bMax = (i == binCount - 1) ? max : min + (i + 1) * binSize;
                var count = values.Count(v => v >= bMin && (i == binCount - 1 ? v <= bMax : v < bMax));
                bins.Add(new HistogramBinDto
                {
                    Min = bMin,
                    Max = bMax,
                    Count = count,
                    Label = $"{Math.Round(bMin)}-{Math.Round(bMax)}"
                });
            }
            return bins;
        }

        private static List<HistogramBinDto> BuildFixedHistogram(List<double> values, double min, double max, int binCount)
        {
            var bins = new List<HistogramBinDto>();
            if (binCount <= 0) return bins;
            var binSize = (max - min) / binCount;

            for (int i = 0; i < binCount; i++)
            {
                var bMin = min + i * binSize;
                var bMax = min + (i + 1) * binSize;
                var count = values.Count(v => v >= min && v <= max && v >= bMin && (i == binCount - 1 ? v <= bMax : v < bMax));
                bins.Add(new HistogramBinDto
                {
                    Min = bMin,
                    Max = bMax,
                    Count = count,
                    Label = $"{Math.Round(bMin)}-{Math.Round(bMax)}"
                });
            }
            return bins;
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
    }
}

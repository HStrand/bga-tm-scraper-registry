using BgaTmScraperRegistry.Models;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace BgaTmScraperRegistry.Services
{
    public static class GameLogMapResolver
    {
        private const int MapSearchMoveLimit = 20;

        private static readonly Regex MapDescriptionRegex = new Regex(
            @"\bMap:\s*([^|]+?)(?:\s*\||$)",
            RegexOptions.Compiled);

        // Ordered longest-first so two-word names match before any single-word prefix
        // (otherwise "Map: Vastitas Borealis" could be truncated to "Vastitas").
        private static readonly string[] KnownMapsPreferLongest = new[]
        {
            "Vastitas Borealis",
            "Amazonis Planitia",
            "Tharsis",
            "Hellas",
            "Elysium",
        };

        // Each map has its own set of milestones, so any single claimed/visible milestone
        // pins the map. Scrape data uses upper-case names (e.g. "TYCOON"); DB / parquet uses
        // title case (e.g. "Tycoon"); BGA also abbreviates a couple ("POLAR", "RIM"). Match
        // case-insensitively to cover all three.
        private static readonly Dictionary<string, string> MilestoneToMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            // Tharsis
            { "Terraformer", "Tharsis" },
            { "Mayor", "Tharsis" },
            { "Gardener", "Tharsis" },
            { "Builder", "Tharsis" },
            { "Planner", "Tharsis" },

            // Hellas
            { "Diversifier", "Hellas" },
            { "Tactician", "Hellas" },
            { "Polar Explorer", "Hellas" },
            { "Polar", "Hellas" },
            { "Energizer", "Hellas" },
            { "Rim Settler", "Hellas" },
            { "Rim", "Hellas" },

            // Elysium
            { "Generalist", "Elysium" },
            { "Specialist", "Elysium" },
            { "Ecologist", "Elysium" },
            { "Tycoon", "Elysium" },
            { "Legend", "Elysium" },

            // Vastitas Borealis
            { "Agronomist", "Vastitas Borealis" },
            { "Engineer", "Vastitas Borealis" },
            { "Spacefarer", "Vastitas Borealis" },
            { "Geologist", "Vastitas Borealis" },
            { "Farmer", "Vastitas Borealis" },
        };

        /// <summary>
        /// Returns the best-effort raw map name for a game log: the top-level field when it
        /// is set and not "Random", otherwise a "Map: {name}" hint scraped from the first
        /// 20 move descriptions. Returns null when neither source yields a value — callers
        /// should treat that as "leave the stored map alone".
        /// </summary>
        public static string ResolveMap(GameLogData gameLogData, ILogger logger)
        {
            if (gameLogData == null) return null;

            var rawMap = gameLogData.Map;
            if (!string.IsNullOrWhiteSpace(rawMap) &&
                !string.Equals(rawMap, "Random", StringComparison.OrdinalIgnoreCase))
            {
                return rawMap;
            }

            var fromMoves = TryExtractMapFromMoves(gameLogData.Moves);
            if (!string.IsNullOrWhiteSpace(fromMoves))
            {
                logger?.LogInformation($"Resolved map '{fromMoves}' from move descriptions (map field was '{rawMap ?? "null"}')");
                return fromMoves;
            }

            var fromMilestones = TryExtractMapFromMilestones(gameLogData, out var unmatched);
            if (!string.IsNullOrWhiteSpace(fromMilestones))
            {
                logger?.LogInformation($"Resolved map '{fromMilestones}' from milestones (map field was '{rawMap ?? "null"}')");
                return fromMilestones;
            }

            if (unmatched != null && unmatched.Count > 0)
            {
                // Surface unknown milestone names so we can extend the mapping (e.g. Amazonis
                // Planitia milestones which aren't catalogued here yet).
                logger?.LogWarning($"Found milestones but none mapped to a known map. Names: [{string.Join(", ", unmatched)}]");
            }

            return null;
        }

        private static string TryExtractMapFromMilestones(GameLogData gameLogData, out HashSet<string> unmatched)
        {
            unmatched = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // Source 1: final move's game state has a milestones dict keyed by name.
            if (gameLogData.Moves != null && gameLogData.Moves.Count > 0)
            {
                for (var i = gameLogData.Moves.Count - 1; i >= 0; i--)
                {
                    var milestones = gameLogData.Moves[i]?.GameState?.Milestones;
                    if (milestones == null || milestones.Count == 0) continue;
                    foreach (var name in milestones.Keys)
                    {
                        if (string.IsNullOrWhiteSpace(name)) continue;
                        if (MilestoneToMap.TryGetValue(name.Trim(), out var map))
                            return map;
                        unmatched.Add(name.Trim());
                    }
                    break; // only inspect the latest move that has milestones
                }
            }

            // Source 2: per-player milestones_claimed lists.
            if (gameLogData.Players != null)
            {
                foreach (var player in gameLogData.Players.Values)
                {
                    var claimed = player?.MilestonesClaimed;
                    if (claimed == null) continue;
                    foreach (var name in claimed)
                    {
                        if (string.IsNullOrWhiteSpace(name)) continue;
                        if (MilestoneToMap.TryGetValue(name.Trim(), out var map))
                            return map;
                        unmatched.Add(name.Trim());
                    }
                }
            }

            return null;
        }

        private static string TryExtractMapFromMoves(List<GameLogMove> moves)
        {
            if (moves == null || moves.Count == 0)
                return null;

            var limit = Math.Min(MapSearchMoveLimit, moves.Count);

            // First pass: exact match against known English map names after "Map:".
            for (var i = 0; i < limit; i++)
            {
                var desc = moves[i]?.Description;
                if (string.IsNullOrWhiteSpace(desc)) continue;

                var idx = desc.IndexOf("Map:", StringComparison.Ordinal);
                if (idx < 0) continue;

                var remainder = desc.Substring(idx + "Map:".Length).TrimStart();
                foreach (var name in KnownMapsPreferLongest)
                {
                    if (remainder.StartsWith(name, StringComparison.Ordinal))
                        return name;
                }
            }

            // Second pass: generic "Map: X" extraction for localized names not yet catalogued.
            for (var i = 0; i < limit; i++)
            {
                var desc = moves[i]?.Description;
                if (string.IsNullOrWhiteSpace(desc)) continue;

                var match = MapDescriptionRegex.Match(desc);
                if (!match.Success) continue;

                var extracted = match.Groups[1].Value.Trim();
                if (!string.IsNullOrWhiteSpace(extracted))
                    return extracted;
            }

            return null;
        }
    }
}

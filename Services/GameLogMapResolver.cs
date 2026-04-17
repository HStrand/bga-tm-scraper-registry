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

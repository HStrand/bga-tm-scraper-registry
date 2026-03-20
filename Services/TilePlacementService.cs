using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;
using Dapper;

namespace BgaTmScraperRegistry.Services
{
    public class TilePlacementService
    {
        private readonly string _connectionString;
        private readonly ILogger _logger;

        private static readonly Regex HexCoordsRegex = new Regex(
            @"(\d+)\s*,\s*(\d+)", RegexOptions.Compiled);

        public TilePlacementService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString;
            _logger = logger;
        }

        private static string NormalizeLocation(string raw)
        {
            var trimmed = raw.Trim();
            if (trimmed.IndexOf("Hex", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                var m = HexCoordsRegex.Match(trimmed);
                if (m.Success)
                    return $"Hex {m.Groups[1].Value},{m.Groups[2].Value}";
            }
            return trimmed;
        }

        private static readonly HashSet<string> ExcludedLocations = new(StringComparer.OrdinalIgnoreCase)
        {
            "Ganymede Colony", "Phobos Space Haven", "Hex", ""
        };

        private static bool ShouldInclude(string location)
        {
            return !ExcludedLocations.Contains(location)
                && !location.StartsWith("tile", StringComparison.OrdinalIgnoreCase);
        }

        public async Task<Dictionary<string, List<TilePlacementOverview>>> GetAllOverviewsAsync(TileType tileType)
        {
            var (table, column) = GetTableAndColumn(tileType);

            var sql = $@"
                SELECT
                    g.Map,
                    LTRIM(RTRIM(t.{column})) AS TileLocation,
                    gp.EloChange
                FROM {table} t
                JOIN Games_Canonical g ON g.TableId = t.TableId
                JOIN GamePlayers_Canonical gp ON gp.TableId = t.TableId AND gp.PlayerId = t.PlayerId";

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            var rows = await connection.QueryAsync<RawRowWithMap>(sql);

            return rows
                .Where(r => !string.IsNullOrEmpty(r.Map))
                .Select(r => new { r.Map, Location = NormalizeLocation(r.TileLocation), r.EloChange })
                .Where(r => ShouldInclude(r.Location))
                .GroupBy(r => r.Map)
                .ToDictionary(
                    mg => mg.Key,
                    mg => mg
                        .GroupBy(r => r.Location)
                        .Select(g => new TilePlacementOverview
                        {
                            TileLocation = g.Key,
                            GameCount = g.Count(),
                            AvgEloChange = g.Average(r => r.EloChange ?? 0),
                        })
                        .OrderByDescending(r => r.AvgEloChange)
                        .ToList());
        }

        public async Task<Dictionary<string, List<TilePlacementByGen>>> GetAllByGenAsync(TileType tileType)
        {
            var (table, column) = GetTableAndColumn(tileType);

            var sql = $@"
                SELECT
                    g.Map,
                    LTRIM(RTRIM(t.{column})) AS TileLocation,
                    t.PlacedGen,
                    gp.EloChange
                FROM {table} t
                JOIN Games_Canonical g ON g.TableId = t.TableId
                JOIN GamePlayers_Canonical gp ON gp.TableId = t.TableId AND gp.PlayerId = t.PlayerId
                WHERE t.PlacedGen IS NOT NULL";

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            var rows = await connection.QueryAsync<RawRowWithMapAndGen>(sql);

            return rows
                .Where(r => !string.IsNullOrEmpty(r.Map))
                .Select(r => new { r.Map, Location = NormalizeLocation(r.TileLocation), r.PlacedGen, r.EloChange })
                .Where(r => ShouldInclude(r.Location))
                .GroupBy(r => r.Map)
                .ToDictionary(
                    mg => mg.Key,
                    mg => mg
                        .GroupBy(r => new { r.Location, r.PlacedGen })
                        .Select(g => new TilePlacementByGen
                        {
                            TileLocation = g.Key.Location,
                            PlacedGen = g.Key.PlacedGen,
                            GameCount = g.Count(),
                            AvgEloChange = g.Average(r => r.EloChange ?? 0),
                        })
                        .OrderBy(r => r.TileLocation)
                        .ThenBy(r => r.PlacedGen)
                        .ToList());
        }

        private static (string table, string column) GetTableAndColumn(TileType tileType) => tileType switch
        {
            TileType.City => ("GameCityLocations", "CityLocation"),
            TileType.Greenery => ("GameGreeneryLocations", "GreeneryLocation"),
            _ => ("GameCityLocations", "CityLocation"),
        };

        private class RawRowWithMap
        {
            public string Map { get; set; }
            public string TileLocation { get; set; }
            public double? EloChange { get; set; }
        }

        private class RawRowWithMapAndGen
        {
            public string Map { get; set; }
            public string TileLocation { get; set; }
            public int? PlacedGen { get; set; }
            public double? EloChange { get; set; }
        }

        public enum TileType
        {
            City,
            Greenery,
        }

        public class TilePlacementOverview
        {
            public string TileLocation { get; set; }
            public int GameCount { get; set; }
            public double AvgEloChange { get; set; }
        }

        public class TilePlacementByGen
        {
            public string TileLocation { get; set; }
            public int? PlacedGen { get; set; }
            public int GameCount { get; set; }
            public double AvgEloChange { get; set; }
        }
    }
}

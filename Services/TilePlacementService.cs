using System.Collections.Generic;
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

        public TilePlacementService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString;
            _logger = logger;
        }

        public async Task<IEnumerable<TilePlacementOverview>> GetOverviewAsync(string map, TileType tileType)
        {
            var (table, column) = GetTableAndColumn(tileType);

            var sql = $@"
                SELECT
                    LTRIM(RTRIM(t.{column})) AS TileLocation,
                    COUNT(*) AS GameCount,
                    ISNULL(AVG(CAST(gp.EloChange AS float)), 0) AS AvgEloChange
                FROM {table} t
                JOIN Games_Canonical g
                    ON g.TableId = t.TableId
                JOIN GamePlayers_Canonical gp
                    ON gp.TableId = t.TableId
                    AND gp.PlayerId = t.PlayerId
                WHERE
                    g.Map = @Map
                    AND LTRIM(RTRIM(t.{column})) NOT IN ('Ganymede Colony', 'Phobos Space Haven', 'Hex')
                    AND LEFT(LTRIM(t.{column}), 4) <> 'tile'
                GROUP BY
                    LTRIM(RTRIM(t.{column}))
                ORDER BY
                    AvgEloChange DESC";

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            return await connection.QueryAsync<TilePlacementOverview>(sql, new { Map = map });
        }

        public async Task<IEnumerable<TilePlacementByGen>> GetByGenAsync(string map, TileType tileType)
        {
            var (table, column) = GetTableAndColumn(tileType);

            var sql = $@"
                SELECT
                    LTRIM(RTRIM(t.{column})) AS TileLocation,
                    t.PlacedGen,
                    COUNT(*) AS GameCount,
                    ISNULL(AVG(CAST(gp.EloChange AS float)), 0) AS AvgEloChange
                FROM {table} t
                JOIN Games_Canonical g
                    ON g.TableId = t.TableId
                JOIN GamePlayers_Canonical gp
                    ON gp.TableId = t.TableId
                    AND gp.PlayerId = t.PlayerId
                WHERE
                    g.Map = @Map
                    AND LTRIM(RTRIM(t.{column})) NOT IN ('Ganymede Colony', 'Phobos Space Haven', 'Hex')
                    AND LEFT(LTRIM(t.{column}), 4) <> 'tile'
                    AND t.PlacedGen IS NOT NULL
                GROUP BY
                    LTRIM(RTRIM(t.{column})),
                    t.PlacedGen
                ORDER BY
                    LTRIM(RTRIM(t.{column})),
                    t.PlacedGen";

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            return await connection.QueryAsync<TilePlacementByGen>(sql, new { Map = map });
        }

        private static (string table, string column) GetTableAndColumn(TileType tileType) => tileType switch
        {
            TileType.City => ("GameCityLocations", "CityLocation"),
            TileType.Greenery => ("GameGreeneryLocations", "GreeneryLocation"),
            _ => ("GameCityLocations", "CityLocation"),
        };

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

using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;
using Dapper;

namespace BgaTmScraperRegistry.Services
{
    public class CityPlacementService
    {
        private readonly string _connectionString;
        private readonly ILogger _logger;

        public CityPlacementService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString;
            _logger = logger;
        }

        public async Task<IEnumerable<CityPlacementOverview>> GetOverviewAsync(string map)
        {
            const string sql = @"
                SELECT
                    LTRIM(RTRIM(gcl.CityLocation)) AS CityLocation,
                    COUNT(*) AS GameCount,
                    ISNULL(AVG(CAST(gp.EloChange AS float)), 0) AS AvgEloChange
                FROM GameCityLocations gcl
                JOIN Games_Canonical g
                    ON g.TableId = gcl.TableId
                JOIN GamePlayers_Canonical gp
                    ON gp.TableId = gcl.TableId
                    AND gp.PlayerId = gcl.PlayerId
                WHERE
                    g.Map = @Map
                    AND LTRIM(RTRIM(gcl.CityLocation)) NOT IN ('Ganymede Colony', 'Phobos Space Haven', 'Hex')
                    AND LEFT(LTRIM(gcl.CityLocation), 4) <> 'tile'
                GROUP BY
                    LTRIM(RTRIM(gcl.CityLocation))
                ORDER BY
                    AvgEloChange DESC";

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            return await connection.QueryAsync<CityPlacementOverview>(sql, new { Map = map });
        }

        public async Task<IEnumerable<CityPlacementByGen>> GetByGenAsync(string map)
        {
            const string sql = @"
                SELECT
                    LTRIM(RTRIM(gcl.CityLocation)) AS CityLocation,
                    gcl.PlacedGen,
                    COUNT(*) AS GameCount,
                    ISNULL(AVG(CAST(gp.EloChange AS float)), 0) AS AvgEloChange
                FROM GameCityLocations gcl
                JOIN Games_Canonical g
                    ON g.TableId = gcl.TableId
                JOIN GamePlayers_Canonical gp
                    ON gp.TableId = gcl.TableId
                    AND gp.PlayerId = gcl.PlayerId
                WHERE
                    g.Map = @Map
                    AND LTRIM(RTRIM(gcl.CityLocation)) NOT IN ('Ganymede Colony', 'Phobos Space Haven', 'Hex')
                    AND LEFT(LTRIM(gcl.CityLocation), 4) <> 'tile'
                GROUP BY
                    LTRIM(RTRIM(gcl.CityLocation)),
                    gcl.PlacedGen
                ORDER BY
                    LTRIM(RTRIM(gcl.CityLocation)),
                    gcl.PlacedGen";

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            return await connection.QueryAsync<CityPlacementByGen>(sql, new { Map = map });
        }

        public class CityPlacementOverview
        {
            public string CityLocation { get; set; }
            public int GameCount { get; set; }
            public double AvgEloChange { get; set; }
        }

        public class CityPlacementByGen
        {
            public string CityLocation { get; set; }
            public int? PlacedGen { get; set; }
            public int GameCount { get; set; }
            public double AvgEloChange { get; set; }
        }
    }
}

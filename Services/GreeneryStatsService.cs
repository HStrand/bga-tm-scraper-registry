using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using BgaTmScraperRegistry.Models;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

namespace BgaTmScraperRegistry.Services
{
    public class GreeneryStatsService
    {
        private readonly string _connectionString;
        private readonly ILogger _logger;

        public GreeneryStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<List<PlayerGreeneryStats>> GetPlayerGreeneryStatsAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"
                ;WITH agg AS (
                  SELECT
                      gl.PlayerId,
                      Greeneries   = COUNT(*),
                      GameCount    = COUNT(DISTINCT gl.TableId)
                  FROM dbo.GameGreeneryLocations AS gl
                  GROUP BY gl.PlayerId
                )
                SELECT
                    p.Name,
                    p.PlayerId,
                    a.Greeneries,
                    a.GameCount,
                    GreeneriesPerGame = CAST(a.Greeneries AS decimal(18,4)) / NULLIF(a.GameCount, 0)
                FROM agg AS a
                JOIN dbo.Players AS p
                  ON p.PlayerId = a.PlayerId
                WHERE a.GameCount >= 30
                ORDER BY GreeneriesPerGame DESC;";

            var results = await connection.QueryAsync<PlayerGreeneryStats>(query);
            var statsList = results.ToList();
            
            _logger.LogInformation($"Retrieved greenery statistics for {statsList.Count} players");
            return statsList;
        }
    }
}

using System;
using System.Data;
using System.Threading.Tasks;
using BgaTmScraperRegistry.Models;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

namespace BgaTmScraperRegistry.Services
{
    public class GameStatsService
    {
        private readonly string _connectionString;
        private readonly ILogger _logger;

        public GameStatsService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task UpsertGameStatsAsync(GameLogData gameLogData)
        {
            if (gameLogData == null)
                throw new ArgumentNullException(nameof(gameLogData));

            // Parse TableId from ReplayId - fail if this fails
            if (!int.TryParse(gameLogData.ReplayId, out int tableId))
            {
                throw new ArgumentException($"Cannot parse ReplayId '{gameLogData.ReplayId}' to integer", nameof(gameLogData));
            }

            // Parse duration - set to null if parsing fails
            int? durationMinutes = ParseDurationToMinutes(gameLogData.GameDuration);

            // Generations can be null
            int? generations = gameLogData.Generations;

            var gameStats = new GameStats
            {
                TableId = tableId,
                Generations = generations,
                DurationMinutes = durationMinutes,
                UpdatedAt = DateTime.UtcNow
            };

            _logger.LogInformation($"Upserting GameStats for TableId {tableId}: Generations={generations}, DurationMinutes={durationMinutes}");

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            using var transaction = connection.BeginTransaction();
            try
            {
                await UpsertGameStatsAsync(connection, transaction, gameStats);
                transaction.Commit();
                
                _logger.LogInformation($"Successfully upserted GameStats for TableId {tableId}");
            }
            catch (Exception ex)
            {
                transaction.Rollback();
                _logger.LogError(ex, $"Error upserting GameStats for TableId {tableId}");
                throw;
            }
        }

        private async Task UpsertGameStatsAsync(SqlConnection connection, SqlTransaction transaction, GameStats gameStats)
        {
            var mergeQuery = @"
                MERGE GameStats AS target
                USING (SELECT @TableId AS TableId, @Generations AS Generations, @DurationMinutes AS DurationMinutes, @UpdatedAt AS UpdatedAt) AS source
                ON target.TableId = source.TableId
                WHEN MATCHED THEN
                    UPDATE SET 
                        Generations = source.Generations,
                        DurationMinutes = source.DurationMinutes,
                        UpdatedAt = source.UpdatedAt
                WHEN NOT MATCHED THEN
                    INSERT (TableId, Generations, DurationMinutes, UpdatedAt)
                    VALUES (source.TableId, source.Generations, source.DurationMinutes, source.UpdatedAt);";

            await connection.ExecuteAsync(
                mergeQuery,
                new
                {
                    TableId = gameStats.TableId,
                    Generations = gameStats.Generations,
                    DurationMinutes = gameStats.DurationMinutes,
                    UpdatedAt = gameStats.UpdatedAt
                },
                transaction);
        }

        private int? ParseDurationToMinutes(string gameDuration)
        {
            if (string.IsNullOrWhiteSpace(gameDuration))
            {
                _logger.LogWarning("GameDuration is null or empty, setting DurationMinutes to null");
                return null;
            }

            try
            {
                // Expected format: "MM:SS" (e.g., "00:55")
                var parts = gameDuration.Split(':');
                if (parts.Length != 2)
                {
                    _logger.LogWarning($"GameDuration '{gameDuration}' is not in expected MM:SS format, setting DurationMinutes to null");
                    return null;
                }

                if (!int.TryParse(parts[0], out int minutes) || !int.TryParse(parts[1], out int seconds))
                {
                    _logger.LogWarning($"GameDuration '{gameDuration}' contains non-numeric values, setting DurationMinutes to null");
                    return null;
                }

                // Convert to total minutes (round to nearest minute)
                var totalMinutes = minutes + Math.Round(seconds / 60.0, 0);
                
                _logger.LogDebug($"Parsed GameDuration '{gameDuration}' to {totalMinutes} minutes");
                
                return (int)totalMinutes;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, $"Error parsing GameDuration '{gameDuration}', setting DurationMinutes to null");
                return null;
            }
        }
    }
}

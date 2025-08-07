using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
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

            var parser = new GameLogDataParser();
            var gameStats = parser.ParseGameStats(gameLogData);
            var playerStats = parser.ParseGamePlayerStats(gameLogData);
            var startingHandCorporations = parser.ParseStartingHandCorporations(gameLogData);

            _logger.LogInformation($"Upserting GameStats for TableId {gameStats.TableId}: Generations={gameStats.Generations}, DurationMinutes={gameStats.DurationMinutes}");

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            using var transaction = connection.BeginTransaction();
            try
            {
                await UpsertGameStatsAsync(connection, transaction, gameStats);
                await UpsertGamePlayerStatsAsync(connection, transaction, playerStats);
                await UpsertStartingHandCorporationsAsync(connection, transaction, startingHandCorporations);
                transaction.Commit();
                
                _logger.LogInformation($"Successfully upserted GameStats for TableId {gameStats.TableId}");
            }
            catch (Exception ex)
            {
                transaction.Rollback();
                _logger.LogError(ex, $"Error upserting GameStats for TableId {gameStats.TableId}");
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
                    gameStats.TableId,
                    gameStats.Generations,
                    gameStats.DurationMinutes,
                    gameStats.UpdatedAt
                },
                transaction);
        }

        private async Task UpsertGamePlayerStatsAsync(SqlConnection connection, SqlTransaction transaction, List<GamePlayerStats> playerStats)
        {
            var mergeQuery = @"
                MERGE GamePlayerStats AS target
                USING (SELECT @TableId AS TableId, @PlayerId AS PlayerId, @Corporation AS Corporation, @FinalScore AS FinalScore, @FinalTr AS FinalTr, @AwardPoints AS AwardPoints, @MilestonePoints AS MilestonePoints, @CityPoints AS CityPoints, @GreeneryPoints AS GreeneryPoints, @CardPoints AS CardPoints, @UpdatedAt AS UpdatedAt) AS source
                ON target.TableId = source.TableId AND target.PlayerId = source.PlayerId
                WHEN MATCHED THEN
                    UPDATE SET
                        Corporation = source.Corporation,
                        FinalScore = source.FinalScore,
                        FinalTr = source.FinalTr,
                        AwardPoints = source.AwardPoints,
                        MilestonePoints = source.MilestonePoints,
                        CityPoints = source.CityPoints,
                        GreeneryPoints = source.GreeneryPoints,
                        CardPoints = source.CardPoints,
                        UpdatedAt = source.UpdatedAt
                WHEN NOT MATCHED THEN
                    INSERT (TableId, PlayerId, Corporation, FinalScore, FinalTr, AwardPoints, MilestonePoints, CityPoints, GreeneryPoints, CardPoints, UpdatedAt)
                    VALUES (source.TableId, source.PlayerId, source.Corporation, source.FinalScore, source.FinalTr, source.AwardPoints, source.MilestonePoints, source.CityPoints, source.GreeneryPoints, source.CardPoints, source.UpdatedAt);";

            foreach (var stats in playerStats)
            {
                await connection.ExecuteAsync(mergeQuery, stats, transaction);
            }
        }

        private async Task UpsertStartingHandCorporationsAsync(SqlConnection connection, SqlTransaction transaction, List<StartingHandCorporations> startingHandCorporations)
        {
            // Group by GameId + PlayerId to handle the sync approach
            var playerGroups = startingHandCorporations.GroupBy(x => new { x.GameId, x.PlayerId });

            foreach (var playerGroup in playerGroups)
            {
                // First, delete existing records for this GameId + PlayerId combination
                var deleteQuery = @"
                    DELETE FROM StartingHandCorporations 
                    WHERE GameId = @GameId AND PlayerId = @PlayerId";

                await connection.ExecuteAsync(deleteQuery, new { playerGroup.Key.GameId, playerGroup.Key.PlayerId }, transaction);

                // Then, insert all new records for this player
                var insertQuery = @"
                    INSERT INTO StartingHandCorporations (GameId, PlayerId, Corporation, Kept, UpdatedAt)
                    VALUES (@GameId, @PlayerId, @Corporation, @Kept, @UpdatedAt)";

                foreach (var corp in playerGroup)
                {
                    await connection.ExecuteAsync(insertQuery, corp, transaction);
                }
            }
        }
    }
}

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
            var startingHandPreludes = parser.ParseStartingHandPreludes(gameLogData);
            var startingHandCards = parser.ParseStartingHandCards(gameLogData);
            var gameMilestones = parser.ParseGameMilestones(gameLogData);
            var gamePlayerAwards = parser.ParseGamePlayerAwards(gameLogData);
            var parameterChanges = parser.ParseParameterChanges(gameLogData);

            _logger.LogInformation($"Upserting GameStats for TableId {gameStats.TableId}: Generations={gameStats.Generations}, DurationMinutes={gameStats.DurationMinutes}");

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            using var transaction = connection.BeginTransaction();
            try
            {
                await UpsertGameStatsAsync(connection, transaction, gameStats);
                await UpsertGamePlayerStatsAsync(connection, transaction, playerStats);
                await UpsertStartingHandCorporationsAsync(connection, transaction, startingHandCorporations);
                await UpsertStartingHandPreludesAsync(connection, transaction, startingHandPreludes);
                await UpsertStartingHandCardsAsync(connection, transaction, startingHandCards);
                await UpsertGameMilestonesAsync(connection, transaction, gameMilestones);
                await UpsertGamePlayerAwardsAsync(connection, transaction, gamePlayerAwards);
                await UpsertParameterChangesAsync(connection, transaction, parameterChanges);
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
            // Group by TableId + PlayerId to handle the sync approach
            var playerGroups = startingHandCorporations.GroupBy(x => new { x.TableId, x.PlayerId });

            foreach (var playerGroup in playerGroups)
            {
                // First, delete existing records for this TableId + PlayerId combination
                var deleteQuery = @"
                    DELETE FROM StartingHandCorporations 
                    WHERE TableId = @TableId AND PlayerId = @PlayerId";

                await connection.ExecuteAsync(deleteQuery, new { playerGroup.Key.TableId, playerGroup.Key.PlayerId }, transaction);

                // Then, insert all new records for this player
                var insertQuery = @"
                    INSERT INTO StartingHandCorporations (TableId, PlayerId, Corporation, Kept, UpdatedAt)
                    VALUES (@TableId, @PlayerId, @Corporation, @Kept, @UpdatedAt)";

                foreach (var corp in playerGroup)
                {
                    await connection.ExecuteAsync(insertQuery, corp, transaction);
                }
            }
        }

        private async Task UpsertStartingHandPreludesAsync(SqlConnection connection, SqlTransaction transaction, List<StartingHandPreludes> startingHandPreludes)
        {
            // Group by TableId + PlayerId to handle the sync approach
            var playerGroups = startingHandPreludes.GroupBy(x => new { x.TableId, x.PlayerId });

            foreach (var playerGroup in playerGroups)
            {
                // First, delete existing records for this TableId + PlayerId combination
                var deleteQuery = @"
                    DELETE FROM StartingHandPreludes 
                    WHERE TableId = @TableId AND PlayerId = @PlayerId";

                await connection.ExecuteAsync(deleteQuery, new { playerGroup.Key.TableId, playerGroup.Key.PlayerId }, transaction);

                // Then, insert all new records for this player
                var insertQuery = @"
                    INSERT INTO StartingHandPreludes (TableId, PlayerId, Prelude, Kept, UpdatedAt)
                    VALUES (@TableId, @PlayerId, @Prelude, @Kept, @UpdatedAt)";

                foreach (var prelude in playerGroup)
                {
                    await connection.ExecuteAsync(insertQuery, prelude, transaction);
                }
            }
        }

        private async Task UpsertStartingHandCardsAsync(SqlConnection connection, SqlTransaction transaction, List<StartingHandCards> startingHandCards)
        {
            // Group by TableId + PlayerId to handle the sync approach
            var playerGroups = startingHandCards.GroupBy(x => new { x.TableId, x.PlayerId });

            foreach (var playerGroup in playerGroups)
            {
                // First, delete existing records for this TableId + PlayerId combination
                var deleteQuery = @"
                    DELETE FROM StartingHandCards 
                    WHERE TableId = @TableId AND PlayerId = @PlayerId";

                await connection.ExecuteAsync(deleteQuery, new { playerGroup.Key.TableId, playerGroup.Key.PlayerId }, transaction);

                // Then, insert all new records for this player
                var insertQuery = @"
                    INSERT INTO StartingHandCards (TableId, PlayerId, Card, Kept, UpdatedAt)
                    VALUES (@TableId, @PlayerId, @Card, @Kept, @UpdatedAt)";

                foreach (var card in playerGroup)
                {
                    await connection.ExecuteAsync(insertQuery, card, transaction);
                }
            }
        }

        private async Task UpsertGameMilestonesAsync(SqlConnection connection, SqlTransaction transaction, List<GameMilestone> milestones)
        {
            if (milestones == null || milestones.Count == 0)
            {
                return;
            }

            // Sync strategy: replace all for the TableId
            var tableId = milestones[0].TableId;

            var deleteQuery = @"
                DELETE FROM GameMilestones
                WHERE TableId = @TableId";

            await connection.ExecuteAsync(deleteQuery, new { TableId = tableId }, transaction);

            var insertQuery = @"
                INSERT INTO GameMilestones (TableId, Milestone, ClaimedBy, ClaimedGen, UpdatedAt)
                VALUES (@TableId, @Milestone, @ClaimedBy, @ClaimedGen, @UpdatedAt)";

            foreach (var ms in milestones)
            {
                await connection.ExecuteAsync(insertQuery, ms, transaction);
            }
        }

        private async Task UpsertGamePlayerAwardsAsync(SqlConnection connection, SqlTransaction transaction, List<GamePlayerAward> awards)
        {
            if (awards == null || awards.Count == 0)
            {
                return;
            }

            // Sync strategy: replace all awards for the TableId
            var tableId = awards[0].TableId;

            var deleteQuery = @"
                DELETE FROM GamePlayerAwards
                WHERE TableId = @TableId";

            await connection.ExecuteAsync(deleteQuery, new { TableId = tableId }, transaction);

            var insertQuery = @"
                INSERT INTO GamePlayerAwards (TableId, PlayerId, Award, FundedBy, FundedGen, PlayerPlace, PlayerCounter, UpdatedAt)
                VALUES (@TableId, @PlayerId, @Award, @FundedBy, @FundedGen, @PlayerPlace, @PlayerCounter, @UpdatedAt)";

            foreach (var row in awards)
            {
                await connection.ExecuteAsync(insertQuery, row, transaction);
            }
        }

        private async Task UpsertParameterChangesAsync(SqlConnection connection, SqlTransaction transaction, List<ParameterChange> changes)
        {
            // Even if there are no changes we still want to clear existing to maintain sync if reupload happens
            int tableId = 0;
            if (changes != null && changes.Count > 0)
            {
                tableId = changes[0].TableId;
            }
            else
            {
                // Derive TableId from transaction context is not available; if list is empty, we cannot know TableId.
                // In our workflow, ParseParameterChanges is executed with the same GameLogData. We can safely skip if empty.
                return;
            }

            var deleteQuery = @"
                DELETE FROM ParameterChanges
                WHERE TableId = @TableId";

            await connection.ExecuteAsync(deleteQuery, new { TableId = tableId }, transaction);

            if (changes.Count == 0)
            {
                return;
            }

            var insertQuery = @"
                INSERT INTO ParameterChanges (TableId, Parameter, Generation, IncreasedTo, IncreasedBy, UpdatedAt)
                VALUES (@TableId, @Parameter, @Generation, @IncreasedTo, @IncreasedBy, @UpdatedAt)";

            foreach (var row in changes)
            {
                await connection.ExecuteAsync(insertQuery, row, transaction);
            }
        }
    }
}

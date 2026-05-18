using BgaTmScraperRegistry.Models;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using System;
using System.Data;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace BgaTmScraperRegistry.Services
{
    public class GameStatsService
    {
        // Per-statement timeout. Was 180–600s; that was masking a chatty implementation.
        // After bulk-ification, individual statements should finish in single-digit seconds.
        private const int CommandTimeoutSeconds = 60;

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
            var gameCards = parser.ParseGameCards(gameLogData);
            var cityLocations = parser.ParseGameCityLocations(gameLogData);
            var greeneryLocations = parser.ParseGameGreeneryLocations(gameLogData);
            var resolvedMap = GameLogMapResolver.ResolveMap(gameLogData, _logger);

            _logger.LogInformation($"Upserting GameStats for TableId {gameStats.TableId}: Generations={gameStats.Generations}, DurationMinutes={gameStats.DurationMinutes}");

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            // Map resolution runs outside the transaction: it's an idempotent single-row UPDATE,
            // and keeping it out shortens the lock window on Games (which the assignments query hits).
            await UpdateGameMapIfRandomAsync(connection, null, gameStats.TableId, resolvedMap);

            // Atomic core: stats + per-player stats. These two together are the
            // "this game has been processed" signal and must commit together.
            using (var transaction = connection.BeginTransaction())
            {
                try
                {
                    await UpsertGameStatsRowAsync(connection, transaction, gameStats);
                    await UpsertGamePlayerStatsAsync(connection, transaction, playerStats);
                    transaction.Commit();
                }
                catch (Exception ex)
                {
                    transaction.Rollback();
                    _logger.LogError(ex, $"Error upserting core GameStats for TableId {gameStats.TableId}");
                    throw;
                }
            }

            // Per-table replace operations run outside the transaction. Each is idempotent
            // (full DELETE-by-TableId then bulk INSERT), so a function retry just redoes the same replace.
            await UpsertStartingHandCorporationsAsync(connection, startingHandCorporations);
            await UpsertStartingHandPreludesAsync(connection, startingHandPreludes);
            await UpsertStartingHandCardsAsync(connection, startingHandCards);
            await UpsertGameMilestonesAsync(connection, gameMilestones);
            await UpsertGamePlayerAwardsAsync(connection, gamePlayerAwards);
            await UpsertParameterChangesAsync(connection, parameterChanges);
            await UpsertGameCardsAsync(connection, gameCards);
            await UpsertGameCityLocationsAsync(connection, cityLocations);
            await UpsertGameGreeneryLocationsAsync(connection, greeneryLocations);

            _logger.LogInformation($"Successfully upserted GameStats for TableId {gameStats.TableId}");
        }

        private async Task UpsertGameStatsRowAsync(SqlConnection connection, SqlTransaction transaction, GameStats gameStats)
        {
            var mergeQuery = @"
                MERGE GameStats AS target
                USING (SELECT @TableId AS TableId, @Generations AS Generations, @DurationMinutes AS DurationMinutes, @PlayerCount AS PlayerCount, @Winner AS Winner, @UpdatedAt AS UpdatedAt, @Conceded as Conceded) AS source
                ON target.TableId = source.TableId
                WHEN MATCHED THEN
                    UPDATE SET
                        Generations = source.Generations,
                        DurationMinutes = source.DurationMinutes,
                        PlayerCount = source.PlayerCount,
                        Winner = source.Winner,
                        Conceded = source.Conceded,
                        UpdatedAt = source.UpdatedAt
                WHEN NOT MATCHED THEN
                    INSERT (TableId, Generations, DurationMinutes, PlayerCount, Winner, UpdatedAt, Conceded)
                    VALUES (source.TableId, source.Generations, source.DurationMinutes, source.PlayerCount, source.Winner, source.UpdatedAt, source.Conceded);";

            await connection.ExecuteAsync(
                mergeQuery,
                new
                {
                    gameStats.TableId,
                    gameStats.Generations,
                    gameStats.DurationMinutes,
                    gameStats.PlayerCount,
                    gameStats.Winner,
                    gameStats.Conceded,
                    gameStats.UpdatedAt
                },
                transaction,
                commandTimeout: CommandTimeoutSeconds);
        }

        private async Task UpsertGamePlayerStatsAsync(SqlConnection connection, SqlTransaction transaction, List<GamePlayerStats> playerStats)
        {
            if (playerStats == null || playerStats.Count == 0) return;

            var createStage = @"
                CREATE TABLE #PlayerStatsStage
                (
                    TableId INT NOT NULL,
                    PlayerId INT NOT NULL,
                    Corporation NVARCHAR(255) NULL,
                    FinalScore INT NULL,
                    FinalTr INT NULL,
                    AwardPoints INT NULL,
                    MilestonePoints INT NULL,
                    CityPoints INT NULL,
                    GreeneryPoints INT NULL,
                    CardPoints INT NULL,
                    UpdatedAt DATETIME NOT NULL
                );";
            await connection.ExecuteAsync(createStage, transaction: transaction, commandTimeout: CommandTimeoutSeconds);

            var dt = new DataTable();
            dt.Columns.Add("TableId", typeof(int));
            dt.Columns.Add("PlayerId", typeof(int));
            dt.Columns.Add("Corporation", typeof(string));
            dt.Columns.Add("FinalScore", typeof(int));
            dt.Columns.Add("FinalTr", typeof(int));
            dt.Columns.Add("AwardPoints", typeof(int));
            dt.Columns.Add("MilestonePoints", typeof(int));
            dt.Columns.Add("CityPoints", typeof(int));
            dt.Columns.Add("GreeneryPoints", typeof(int));
            dt.Columns.Add("CardPoints", typeof(int));
            dt.Columns.Add("UpdatedAt", typeof(DateTime));

            foreach (var s in playerStats)
            {
                dt.Rows.Add(
                    s.TableId,
                    s.PlayerId,
                    string.IsNullOrWhiteSpace(s.Corporation) ? (object)DBNull.Value : s.Corporation,
                    (object?)s.FinalScore ?? DBNull.Value,
                    (object?)s.FinalTr ?? DBNull.Value,
                    (object?)s.AwardPoints ?? DBNull.Value,
                    (object?)s.MilestonePoints ?? DBNull.Value,
                    (object?)s.CityPoints ?? DBNull.Value,
                    (object?)s.GreeneryPoints ?? DBNull.Value,
                    (object?)s.CardPoints ?? DBNull.Value,
                    s.UpdatedAt);
            }

            using (var bulk = new SqlBulkCopy(connection, SqlBulkCopyOptions.Default, transaction))
            {
                bulk.DestinationTableName = "#PlayerStatsStage";
                await bulk.WriteToServerAsync(dt);
            }

            // MERGE preserves any pre-existing rows for players not in the new payload.
            var merge = @"
                MERGE GamePlayerStats AS target
                USING #PlayerStatsStage AS source
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
            await connection.ExecuteAsync(merge, transaction: transaction, commandTimeout: CommandTimeoutSeconds);

            await connection.ExecuteAsync("DROP TABLE #PlayerStatsStage;", transaction: transaction, commandTimeout: CommandTimeoutSeconds);
        }

        private async Task UpsertStartingHandCorporationsAsync(SqlConnection connection, List<StartingHandCorporations> rows)
        {
            if (rows == null || rows.Count == 0) return;

            var createStage = @"
                CREATE TABLE #StartHandCorpStage
                (
                    TableId INT NOT NULL,
                    PlayerId INT NOT NULL,
                    Corporation NVARCHAR(255) NOT NULL,
                    Kept BIT NOT NULL,
                    UpdatedAt DATETIME NOT NULL
                );";
            await connection.ExecuteAsync(createStage, commandTimeout: CommandTimeoutSeconds);

            var dt = new DataTable();
            dt.Columns.Add("TableId", typeof(int));
            dt.Columns.Add("PlayerId", typeof(int));
            dt.Columns.Add("Corporation", typeof(string));
            dt.Columns.Add("Kept", typeof(bool));
            dt.Columns.Add("UpdatedAt", typeof(DateTime));

            foreach (var r in rows)
            {
                dt.Rows.Add(r.TableId, r.PlayerId, r.Corporation, r.Kept, r.UpdatedAt);
            }

            using (var bulk = new SqlBulkCopy(connection))
            {
                bulk.DestinationTableName = "#StartHandCorpStage";
                await bulk.WriteToServerAsync(dt);
            }

            var deleteQuery = @"
                DELETE shc
                FROM StartingHandCorporations shc
                INNER JOIN (SELECT DISTINCT TableId, PlayerId FROM #StartHandCorpStage) s
                  ON shc.TableId = s.TableId AND shc.PlayerId = s.PlayerId;";
            await connection.ExecuteAsync(deleteQuery, commandTimeout: CommandTimeoutSeconds);

            var insertFromStage = @"
                INSERT INTO StartingHandCorporations (TableId, PlayerId, Corporation, Kept, UpdatedAt)
                SELECT TableId, PlayerId, Corporation, Kept, UpdatedAt
                FROM #StartHandCorpStage;";
            await connection.ExecuteAsync(insertFromStage, commandTimeout: CommandTimeoutSeconds);

            await connection.ExecuteAsync("DROP TABLE #StartHandCorpStage;", commandTimeout: CommandTimeoutSeconds);
        }

        private async Task UpsertStartingHandPreludesAsync(SqlConnection connection, List<StartingHandPreludes> rows)
        {
            if (rows == null || rows.Count == 0) return;

            var createStage = @"
                CREATE TABLE #StartHandPreludeStage
                (
                    TableId INT NOT NULL,
                    PlayerId INT NOT NULL,
                    Prelude NVARCHAR(255) NOT NULL,
                    Kept BIT NOT NULL,
                    UpdatedAt DATETIME NOT NULL
                );";
            await connection.ExecuteAsync(createStage, commandTimeout: CommandTimeoutSeconds);

            var dt = new DataTable();
            dt.Columns.Add("TableId", typeof(int));
            dt.Columns.Add("PlayerId", typeof(int));
            dt.Columns.Add("Prelude", typeof(string));
            dt.Columns.Add("Kept", typeof(bool));
            dt.Columns.Add("UpdatedAt", typeof(DateTime));

            foreach (var r in rows)
            {
                dt.Rows.Add(r.TableId, r.PlayerId, r.Prelude, r.Kept, r.UpdatedAt);
            }

            using (var bulk = new SqlBulkCopy(connection))
            {
                bulk.DestinationTableName = "#StartHandPreludeStage";
                await bulk.WriteToServerAsync(dt);
            }

            var deleteQuery = @"
                DELETE shp
                FROM StartingHandPreludes shp
                INNER JOIN (SELECT DISTINCT TableId, PlayerId FROM #StartHandPreludeStage) s
                  ON shp.TableId = s.TableId AND shp.PlayerId = s.PlayerId;";
            await connection.ExecuteAsync(deleteQuery, commandTimeout: CommandTimeoutSeconds);

            var insertFromStage = @"
                INSERT INTO StartingHandPreludes (TableId, PlayerId, Prelude, Kept, UpdatedAt)
                SELECT TableId, PlayerId, Prelude, Kept, UpdatedAt
                FROM #StartHandPreludeStage;";
            await connection.ExecuteAsync(insertFromStage, commandTimeout: CommandTimeoutSeconds);

            await connection.ExecuteAsync("DROP TABLE #StartHandPreludeStage;", commandTimeout: CommandTimeoutSeconds);
        }

        private async Task UpsertStartingHandCardsAsync(SqlConnection connection, List<StartingHandCards> rows)
        {
            if (rows == null || rows.Count == 0) return;

            var createStage = @"
                CREATE TABLE #StartHandCardStage
                (
                    TableId INT NOT NULL,
                    PlayerId INT NOT NULL,
                    Card NVARCHAR(255) NOT NULL,
                    Kept BIT NOT NULL,
                    UpdatedAt DATETIME NOT NULL
                );";
            await connection.ExecuteAsync(createStage, commandTimeout: CommandTimeoutSeconds);

            var dt = new DataTable();
            dt.Columns.Add("TableId", typeof(int));
            dt.Columns.Add("PlayerId", typeof(int));
            dt.Columns.Add("Card", typeof(string));
            dt.Columns.Add("Kept", typeof(bool));
            dt.Columns.Add("UpdatedAt", typeof(DateTime));

            foreach (var r in rows)
            {
                dt.Rows.Add(r.TableId, r.PlayerId, r.Card, r.Kept, r.UpdatedAt);
            }

            using (var bulk = new SqlBulkCopy(connection))
            {
                bulk.DestinationTableName = "#StartHandCardStage";
                await bulk.WriteToServerAsync(dt);
            }

            var deleteQuery = @"
                DELETE shc
                FROM StartingHandCards shc
                INNER JOIN (SELECT DISTINCT TableId, PlayerId FROM #StartHandCardStage) s
                  ON shc.TableId = s.TableId AND shc.PlayerId = s.PlayerId;";
            await connection.ExecuteAsync(deleteQuery, commandTimeout: CommandTimeoutSeconds);

            var insertFromStage = @"
                INSERT INTO StartingHandCards (TableId, PlayerId, Card, Kept, UpdatedAt)
                SELECT TableId, PlayerId, Card, Kept, UpdatedAt
                FROM #StartHandCardStage;";
            await connection.ExecuteAsync(insertFromStage, commandTimeout: CommandTimeoutSeconds);

            await connection.ExecuteAsync("DROP TABLE #StartHandCardStage;", commandTimeout: CommandTimeoutSeconds);
        }

        public async Task UpsertGameCardsAsync(SqlConnection connection, List<GameCard> cards)
        {
            if (cards == null || cards.Count == 0)
            {
                return;
            }

            var createStage = @"
                CREATE TABLE #GameCardsStage
                (
                    TableId INT NOT NULL,
                    PlayerId INT NOT NULL,
                    Card NVARCHAR(255) NOT NULL,
                    SeenGen INT NULL,
                    DrawnGen INT NULL,
                    KeptGen INT NULL,
                    DraftedGen INT NULL,
                    BoughtGen INT NULL,
                    DrawType NVARCHAR(255) NULL,
                    DrawReason NVARCHAR(255) NULL,
                    PlayedGen INT NULL,
                    VpScored INT NULL,
                    UpdatedAt DATETIME NOT NULL
                );";
            await connection.ExecuteAsync(createStage, commandTimeout: CommandTimeoutSeconds);

            var dt = new DataTable();
            dt.Columns.Add("TableId", typeof(int));
            dt.Columns.Add("PlayerId", typeof(int));
            dt.Columns.Add("Card", typeof(string));
            dt.Columns.Add("SeenGen", typeof(int));
            dt.Columns.Add("DrawnGen", typeof(int));
            dt.Columns.Add("KeptGen", typeof(int));
            dt.Columns.Add("DraftedGen", typeof(int));
            dt.Columns.Add("BoughtGen", typeof(int));
            dt.Columns.Add("DrawType", typeof(string));
            dt.Columns.Add("DrawReason", typeof(string));
            dt.Columns.Add("PlayedGen", typeof(int));
            dt.Columns.Add("VpScored", typeof(int));
            dt.Columns.Add("UpdatedAt", typeof(DateTime));

            foreach (var c in cards)
            {
                dt.Rows.Add(
                    c.TableId,
                    c.PlayerId,
                    c.Card,
                    (object?)c.SeenGen ?? DBNull.Value,
                    (object?)c.DrawnGen ?? DBNull.Value,
                    (object?)c.KeptGen ?? DBNull.Value,
                    (object?)c.DraftedGen ?? DBNull.Value,
                    (object?)c.BoughtGen ?? DBNull.Value,
                    string.IsNullOrWhiteSpace(c.DrawType) ? (object)DBNull.Value : c.DrawType,
                    string.IsNullOrWhiteSpace(c.DrawReason) ? (object)DBNull.Value : c.DrawReason,
                    (object?)c.PlayedGen ?? DBNull.Value,
                    (object?)c.VpScored ?? DBNull.Value,
                    c.UpdatedAt);
            }

            using (var bulk = new SqlBulkCopy(connection))
            {
                bulk.DestinationTableName = "#GameCardsStage";
                await bulk.WriteToServerAsync(dt);
            }

            var deleteQuery = @"
                DELETE gc
                FROM GameCards gc
                INNER JOIN (SELECT DISTINCT TableId, PlayerId FROM #GameCardsStage) s
                  ON gc.TableId = s.TableId AND gc.PlayerId = s.PlayerId;";
            await connection.ExecuteAsync(deleteQuery, commandTimeout: CommandTimeoutSeconds);

            var insertFromStage = @"
                INSERT INTO GameCards (TableId, PlayerId, Card, SeenGen, DrawnGen, KeptGen, DraftedGen, BoughtGen, DrawType, DrawReason, PlayedGen, VpScored, UpdatedAt)
                SELECT TableId, PlayerId, Card, SeenGen, DrawnGen, KeptGen, DraftedGen, BoughtGen, DrawType, DrawReason, PlayedGen, VpScored, UpdatedAt
                FROM #GameCardsStage;";
            await connection.ExecuteAsync(insertFromStage, commandTimeout: CommandTimeoutSeconds);

            await connection.ExecuteAsync("DROP TABLE #GameCardsStage;", commandTimeout: CommandTimeoutSeconds);
        }

        private async Task UpsertGameMilestonesAsync(SqlConnection connection, List<GameMilestone> milestones)
        {
            if (milestones == null || milestones.Count == 0) return;

            var tableId = milestones[0].TableId;

            var createStage = @"
                CREATE TABLE #MilestoneStage
                (
                    TableId INT NOT NULL,
                    Milestone NVARCHAR(255) NOT NULL,
                    ClaimedBy INT NOT NULL,
                    ClaimedGen INT NOT NULL,
                    UpdatedAt DATETIME NOT NULL
                );";
            await connection.ExecuteAsync(createStage, commandTimeout: CommandTimeoutSeconds);

            var dt = new DataTable();
            dt.Columns.Add("TableId", typeof(int));
            dt.Columns.Add("Milestone", typeof(string));
            dt.Columns.Add("ClaimedBy", typeof(int));
            dt.Columns.Add("ClaimedGen", typeof(int));
            dt.Columns.Add("UpdatedAt", typeof(DateTime));

            foreach (var m in milestones)
            {
                dt.Rows.Add(m.TableId, m.Milestone, m.ClaimedBy, m.ClaimedGen, m.UpdatedAt);
            }

            using (var bulk = new SqlBulkCopy(connection))
            {
                bulk.DestinationTableName = "#MilestoneStage";
                await bulk.WriteToServerAsync(dt);
            }

            await connection.ExecuteAsync("DELETE FROM GameMilestones WHERE TableId = @TableId;",
                new { TableId = tableId }, commandTimeout: CommandTimeoutSeconds);

            var insertFromStage = @"
                INSERT INTO GameMilestones (TableId, Milestone, ClaimedBy, ClaimedGen, UpdatedAt)
                SELECT TableId, Milestone, ClaimedBy, ClaimedGen, UpdatedAt
                FROM #MilestoneStage;";
            await connection.ExecuteAsync(insertFromStage, commandTimeout: CommandTimeoutSeconds);

            await connection.ExecuteAsync("DROP TABLE #MilestoneStage;", commandTimeout: CommandTimeoutSeconds);
        }

        private async Task UpsertGamePlayerAwardsAsync(SqlConnection connection, List<GamePlayerAward> awards)
        {
            if (awards == null || awards.Count == 0) return;

            var tableId = awards[0].TableId;

            var createStage = @"
                CREATE TABLE #AwardStage
                (
                    TableId INT NOT NULL,
                    PlayerId INT NOT NULL,
                    Award NVARCHAR(255) NOT NULL,
                    FundedBy INT NOT NULL,
                    FundedGen INT NOT NULL,
                    PlayerPlace INT NULL,
                    PlayerCounter INT NULL,
                    UpdatedAt DATETIME NOT NULL
                );";
            await connection.ExecuteAsync(createStage, commandTimeout: CommandTimeoutSeconds);

            var dt = new DataTable();
            dt.Columns.Add("TableId", typeof(int));
            dt.Columns.Add("PlayerId", typeof(int));
            dt.Columns.Add("Award", typeof(string));
            dt.Columns.Add("FundedBy", typeof(int));
            dt.Columns.Add("FundedGen", typeof(int));
            dt.Columns.Add("PlayerPlace", typeof(int));
            dt.Columns.Add("PlayerCounter", typeof(int));
            dt.Columns.Add("UpdatedAt", typeof(DateTime));

            foreach (var a in awards)
            {
                dt.Rows.Add(
                    a.TableId,
                    a.PlayerId,
                    a.Award,
                    a.FundedBy,
                    a.FundedGen,
                    (object?)a.PlayerPlace ?? DBNull.Value,
                    (object?)a.PlayerCounter ?? DBNull.Value,
                    a.UpdatedAt);
            }

            using (var bulk = new SqlBulkCopy(connection))
            {
                bulk.DestinationTableName = "#AwardStage";
                await bulk.WriteToServerAsync(dt);
            }

            await connection.ExecuteAsync("DELETE FROM GamePlayerAwards WHERE TableId = @TableId;",
                new { TableId = tableId }, commandTimeout: CommandTimeoutSeconds);

            var insertFromStage = @"
                INSERT INTO GamePlayerAwards (TableId, PlayerId, Award, FundedBy, FundedGen, PlayerPlace, PlayerCounter, UpdatedAt)
                SELECT TableId, PlayerId, Award, FundedBy, FundedGen, PlayerPlace, PlayerCounter, UpdatedAt
                FROM #AwardStage;";
            await connection.ExecuteAsync(insertFromStage, commandTimeout: CommandTimeoutSeconds);

            await connection.ExecuteAsync("DROP TABLE #AwardStage;", commandTimeout: CommandTimeoutSeconds);
        }

        private async Task UpsertParameterChangesAsync(SqlConnection connection, List<ParameterChange> changes)
        {
            if (changes == null || changes.Count == 0) return;

            var tableId = changes[0].TableId;

            var createStage = @"
                CREATE TABLE #ParamStage
                (
                    TableId INT NOT NULL,
                    Parameter NVARCHAR(255) NOT NULL,
                    Generation INT NOT NULL,
                    IncreasedTo INT NOT NULL,
                    IncreasedBy INT NULL,
                    UpdatedAt DATETIME NOT NULL
                );";
            await connection.ExecuteAsync(createStage, commandTimeout: CommandTimeoutSeconds);

            var dt = new DataTable();
            dt.Columns.Add("TableId", typeof(int));
            dt.Columns.Add("Parameter", typeof(string));
            dt.Columns.Add("Generation", typeof(int));
            dt.Columns.Add("IncreasedTo", typeof(int));
            dt.Columns.Add("IncreasedBy", typeof(int));
            dt.Columns.Add("UpdatedAt", typeof(DateTime));

            foreach (var r in changes)
            {
                dt.Rows.Add(
                    r.TableId,
                    string.IsNullOrWhiteSpace(r.Parameter) ? (object)DBNull.Value : r.Parameter,
                    r.Generation,
                    r.IncreasedTo,
                    (object?)r.IncreasedBy ?? DBNull.Value,
                    r.UpdatedAt);
            }

            using (var bulk = new SqlBulkCopy(connection))
            {
                bulk.DestinationTableName = "#ParamStage";
                await bulk.WriteToServerAsync(dt);
            }

            await connection.ExecuteAsync("DELETE FROM ParameterChanges WHERE TableId = @TableId;",
                new { TableId = tableId }, commandTimeout: CommandTimeoutSeconds);

            var insertFromStage = @"
                INSERT INTO ParameterChanges (TableId, Parameter, Generation, IncreasedTo, IncreasedBy, UpdatedAt)
                SELECT TableId, Parameter, Generation, IncreasedTo, IncreasedBy, UpdatedAt
                FROM #ParamStage;";
            await connection.ExecuteAsync(insertFromStage, commandTimeout: CommandTimeoutSeconds);

            await connection.ExecuteAsync("DROP TABLE #ParamStage;", commandTimeout: CommandTimeoutSeconds);
        }

        private async Task UpsertGameCityLocationsAsync(SqlConnection connection, List<GameCityLocation> cityLocations)
        {
            if (cityLocations == null || cityLocations.Count == 0) return;

            var tableId = cityLocations[0].TableId;

            var createStage = @"
                CREATE TABLE #CityStage
                (
                    TableId INT NOT NULL,
                    PlayerId INT NOT NULL,
                    CityLocation NVARCHAR(255) NOT NULL,
                    Points INT NOT NULL,
                    PlacedGen INT NULL,
                    UpdatedAt DATETIME NOT NULL
                );";
            await connection.ExecuteAsync(createStage, commandTimeout: CommandTimeoutSeconds);

            var dt = new DataTable();
            dt.Columns.Add("TableId", typeof(int));
            dt.Columns.Add("PlayerId", typeof(int));
            dt.Columns.Add("CityLocation", typeof(string));
            dt.Columns.Add("Points", typeof(int));
            dt.Columns.Add("PlacedGen", typeof(int));
            dt.Columns.Add("UpdatedAt", typeof(DateTime));

            foreach (var c in cityLocations)
            {
                dt.Rows.Add(
                    c.TableId,
                    c.PlayerId,
                    c.CityLocation,
                    c.Points,
                    (object?)c.PlacedGen ?? DBNull.Value,
                    c.UpdatedAt);
            }

            using (var bulk = new SqlBulkCopy(connection))
            {
                bulk.DestinationTableName = "#CityStage";
                await bulk.WriteToServerAsync(dt);
            }

            await connection.ExecuteAsync("DELETE FROM GameCityLocations WHERE TableId = @TableId;",
                new { TableId = tableId }, commandTimeout: CommandTimeoutSeconds);

            var insertFromStage = @"
                INSERT INTO GameCityLocations (TableId, PlayerId, CityLocation, Points, PlacedGen, UpdatedAt)
                SELECT TableId, PlayerId, CityLocation, Points, PlacedGen, UpdatedAt
                FROM #CityStage;";
            await connection.ExecuteAsync(insertFromStage, commandTimeout: CommandTimeoutSeconds);

            await connection.ExecuteAsync("DROP TABLE #CityStage;", commandTimeout: CommandTimeoutSeconds);
        }

        private async Task UpsertGameGreeneryLocationsAsync(SqlConnection connection, List<GameGreeneryLocation> greeneryLocations)
        {
            if (greeneryLocations == null || greeneryLocations.Count == 0) return;

            var tableId = greeneryLocations[0].TableId;

            var createStage = @"
                CREATE TABLE #GreenStage
                (
                    TableId INT NOT NULL,
                    PlayerId INT NOT NULL,
                    GreeneryLocation NVARCHAR(255) NOT NULL,
                    PlacedGen INT NULL,
                    UpdatedAt DATETIME NOT NULL
                );";
            await connection.ExecuteAsync(createStage, commandTimeout: CommandTimeoutSeconds);

            var dt = new DataTable();
            dt.Columns.Add("TableId", typeof(int));
            dt.Columns.Add("PlayerId", typeof(int));
            dt.Columns.Add("GreeneryLocation", typeof(string));
            dt.Columns.Add("PlacedGen", typeof(int));
            dt.Columns.Add("UpdatedAt", typeof(DateTime));

            foreach (var r in greeneryLocations)
            {
                dt.Rows.Add(
                    r.TableId,
                    r.PlayerId,
                    r.GreeneryLocation,
                    (object?)r.PlacedGen ?? DBNull.Value,
                    r.UpdatedAt);
            }

            using (var bulk = new SqlBulkCopy(connection))
            {
                bulk.DestinationTableName = "#GreenStage";
                await bulk.WriteToServerAsync(dt);
            }

            await connection.ExecuteAsync("DELETE FROM GameGreeneryLocations WHERE TableId = @TableId;",
                new { TableId = tableId }, commandTimeout: CommandTimeoutSeconds);

            var insertFromStage = @"
                INSERT INTO GameGreeneryLocations (TableId, PlayerId, GreeneryLocation, PlacedGen, UpdatedAt)
                SELECT TableId, PlayerId, GreeneryLocation, PlacedGen, UpdatedAt
                FROM #GreenStage;";
            await connection.ExecuteAsync(insertFromStage, commandTimeout: CommandTimeoutSeconds);

            await connection.ExecuteAsync("DROP TABLE #GreenStage;", commandTimeout: CommandTimeoutSeconds);
        }

        // Not called from the blob trigger path today; preserved for callers elsewhere.
        private async Task UpsertGamePlayerTrackerChangesAsync(SqlConnection connection, SqlTransaction transaction, List<GamePlayerTrackerChange> changes)
        {
            if (changes == null || changes.Count == 0)
            {
                return;
            }

            var tableId = changes[0].TableId;

            var createStage = @"
                CREATE TABLE #TrackerStage
                (
                    TableId INT NOT NULL,
                    PlayerId INT NOT NULL,
                    Tracker NVARCHAR(255) NOT NULL,
                    TrackerType NVARCHAR(255) NOT NULL,
                    Generation INT NOT NULL,
                    MoveNumber INT NULL,
                    ChangedTo INT NOT NULL,
                    UpdatedAt DATETIME NOT NULL
                );";
            await connection.ExecuteAsync(createStage, transaction: transaction, commandTimeout: CommandTimeoutSeconds);

            var dt = new DataTable();
            dt.Columns.Add("TableId", typeof(int));
            dt.Columns.Add("PlayerId", typeof(int));
            dt.Columns.Add("Tracker", typeof(string));
            dt.Columns.Add("TrackerType", typeof(string));
            dt.Columns.Add("Generation", typeof(int));
            dt.Columns.Add("MoveNumber", typeof(int));
            dt.Columns.Add("ChangedTo", typeof(int));
            dt.Columns.Add("UpdatedAt", typeof(DateTime));

            foreach (var r in changes)
            {
                dt.Rows.Add(
                    r.TableId,
                    r.PlayerId,
                    r.Tracker,
                    r.TrackerType,
                    r.Generation,
                    (object?)r.MoveNumber ?? DBNull.Value,
                    r.ChangedTo,
                    r.UpdatedAt);
            }

            using (var bulk = new SqlBulkCopy(connection, SqlBulkCopyOptions.Default, transaction))
            {
                bulk.DestinationTableName = "#TrackerStage";
                await bulk.WriteToServerAsync(dt);
            }

            await connection.ExecuteAsync("DELETE FROM GamePlayerTrackerChanges WHERE TableId = @TableId;", new { TableId = tableId }, transaction, commandTimeout: CommandTimeoutSeconds);

            var insertFromStage = @"
                INSERT INTO GamePlayerTrackerChanges (TableId, PlayerId, Tracker, TrackerType, Generation, MoveNumber, ChangedTo, UpdatedAt)
                SELECT TableId, PlayerId, Tracker, TrackerType, Generation, MoveNumber, ChangedTo, UpdatedAt
                FROM #TrackerStage;";
            await connection.ExecuteAsync(insertFromStage, transaction: transaction, commandTimeout: CommandTimeoutSeconds);

            await connection.ExecuteAsync("DROP TABLE #TrackerStage;", transaction: transaction, commandTimeout: CommandTimeoutSeconds);
        }

        private async Task UpdateGameMapIfRandomAsync(SqlConnection connection, SqlTransaction transaction, int tableId, string newMap)
        {
            if (string.IsNullOrEmpty(newMap) || string.Equals(newMap, "Random", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            var normalizedMap = MapNameNormalizer.NormalizeMapName(newMap, _logger);

            var updateQuery = @"
                UPDATE Games
                SET Map = @NewMap
                WHERE TableId = @TableId
                  AND (Map = 'Random' OR Map IS NULL)";

            var rowsAffected = await connection.ExecuteAsync(
                updateQuery,
                new { TableId = tableId, NewMap = normalizedMap },
                transaction,
                commandTimeout: CommandTimeoutSeconds);

            if (rowsAffected > 0)
            {
                _logger.LogInformation($"Updated Games.Map from 'Random' to '{normalizedMap}' for TableId {tableId}");
            }
        }
    }
}

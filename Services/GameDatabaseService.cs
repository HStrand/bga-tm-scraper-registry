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
    public class GameDatabaseService
    {
        private readonly string _connectionString;
        private readonly ILogger _logger;
        private const int BatchSize = 1000;

        public GameDatabaseService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<int> UpsertGamesAsync(IEnumerable<Game> games, IEnumerable<GamePlayer> gamePlayers)
        {
            var gameList = games.ToList();
            var gamePlayerList = gamePlayers.ToList();
            var totalProcessed = 0;

            _logger.LogInformation($"Starting to process {gameList.Count} games and {gamePlayerList.Count} game players in batches of {BatchSize}");

            // Process games in batches
            for (int i = 0; i < gameList.Count; i += BatchSize)
            {
                var gameBatch = gameList.Skip(i).Take(BatchSize).ToList();
                var batchNumber = (i / BatchSize) + 1;
                var totalBatches = (int)Math.Ceiling((double)gameList.Count / BatchSize);

                _logger.LogInformation($"Processing game batch {batchNumber}/{totalBatches} with {gameBatch.Count} games");

                try
                {
                    var processed = await ProcessGameBatchAsync(gameBatch, gamePlayerList);
                    totalProcessed += processed;
                    _logger.LogInformation($"Successfully processed game batch {batchNumber}/{totalBatches}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Error processing game batch {batchNumber}/{totalBatches}");
                    throw;
                }
            }

            _logger.LogInformation($"Completed processing all batches. Total games processed: {totalProcessed}");
            return totalProcessed;
        }

        private async Task<int> ProcessGameBatchAsync(IList<Game> games, IList<GamePlayer> allGamePlayers)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            using var transaction = connection.BeginTransaction();
            try
            {
                // Step 1: Upsert games and get their IDs
                var gameIdMappings = await UpsertGamesAndGetIdsAsync(connection, transaction, games);

                // Step 2: Update GamePlayer records with the correct GameId and upsert them
                var gamePlayersForBatch = allGamePlayers
                    .Where(gp => games.Any(g => g.TableId == gp.TableId && g.PlayerPerspective == gp.PlayerPerspective))
                    .ToList();

                foreach (var gamePlayer in gamePlayersForBatch)
                {
                    var key = $"{gamePlayer.TableId}_{gamePlayer.PlayerPerspective}";
                    if (gameIdMappings.TryGetValue(key, out var gameId))
                    {
                        gamePlayer.GameId = gameId;
                    }
                    else
                    {
                        _logger.LogWarning($"Could not find GameId for TableId {gamePlayer.TableId}, PlayerPerspective {gamePlayer.PlayerPerspective}");
                    }
                }

                var validGamePlayers = gamePlayersForBatch.Where(gp => gp.GameId > 0).ToList();
                if (validGamePlayers.Any())
                {
                    await UpsertGamePlayersAsync(connection, transaction, validGamePlayers);
                }

                transaction.Commit();
                return games.Count;
            }
            catch (Exception ex)
            {
                transaction.Rollback();
                _logger.LogError(ex, "Error executing batch upsert operation");
                throw;
            }
        }

        private async Task<Dictionary<string, int>> UpsertGamesAndGetIdsAsync(SqlConnection connection, SqlTransaction transaction, IList<Game> games)
        {
            var dataTable = CreateGameDataTable(games);

            var mergeQuery = @"
                MERGE Games AS target
                USING @GameData AS source ON target.TableId = source.TableId AND target.PlayerPerspective = source.PlayerPerspective
                WHEN NOT MATCHED THEN
                    INSERT (TableId, PlayerPerspective, VersionId, RawDateTime, ParsedDateTime, GameMode, IndexedAt, ScrapedAt, ScrapedBy)
                    VALUES (source.TableId, source.PlayerPerspective, source.VersionId, source.RawDateTime, source.ParsedDateTime, source.GameMode, source.IndexedAt, source.ScrapedAt, source.ScrapedBy)
                OUTPUT INSERTED.Id, INSERTED.TableId, INSERTED.PlayerPerspective;";

            var results = await connection.QueryAsync<GameIdMapping>(
                mergeQuery,
                new { GameData = dataTable.AsTableValuedParameter("dbo.GameTableType") },
                transaction);

            return results.ToDictionary(r => $"{r.TableId}_{r.PlayerPerspective}", r => r.Id);
        }

        private async Task UpsertGamePlayersAsync(SqlConnection connection, SqlTransaction transaction, IList<GamePlayer> gamePlayers)
        {
            var dataTable = CreateGamePlayerDataTable(gamePlayers);

            var mergeQuery = @"
                MERGE GamePlayers AS target
                USING @GamePlayerData AS source ON target.GameId = source.GameId AND target.PlayerId = source.PlayerId
                WHEN NOT MATCHED THEN
                    INSERT (GameId, TableId, PlayerPerspective, PlayerId, PlayerName, Elo, EloChange, ArenaPoints, ArenaPointsChange, Position)
                    VALUES (source.GameId, source.TableId, source.PlayerPerspective, source.PlayerId, source.PlayerName, source.Elo, source.EloChange, source.ArenaPoints, source.ArenaPointsChange, source.Position);";

            await connection.ExecuteAsync(
                mergeQuery,
                new { GamePlayerData = dataTable.AsTableValuedParameter("dbo.GamePlayerTableType") },
                transaction);
        }

        private DataTable CreateGameDataTable(IList<Game> games)
        {
            var dataTable = new DataTable();
            dataTable.Columns.Add("TableId", typeof(int));
            dataTable.Columns.Add("PlayerPerspective", typeof(int));
            dataTable.Columns.Add("VersionId", typeof(string));
            dataTable.Columns.Add("RawDateTime", typeof(string));
            dataTable.Columns.Add("ParsedDateTime", typeof(DateTime));
            dataTable.Columns.Add("GameMode", typeof(string));
            dataTable.Columns.Add("IndexedAt", typeof(DateTime));
            dataTable.Columns.Add("ScrapedAt", typeof(DateTime));
            dataTable.Columns.Add("ScrapedBy", typeof(string));

            foreach (var game in games)
            {
                // Validate and truncate string fields
                var versionId = ValidateAndTruncateString(game.VersionId, 255, $"Game TableId {game.TableId} VersionId");
                var rawDateTime = ValidateAndTruncateString(game.RawDateTime, 255, $"Game TableId {game.TableId} RawDateTime");
                var gameMode = ValidateAndTruncateString(game.GameMode, 255, $"Game TableId {game.TableId} GameMode");
                var scrapedBy = ValidateAndTruncateString(game.ScrapedBy, 255, $"Game TableId {game.TableId} ScrapedBy");

                dataTable.Rows.Add(
                    game.TableId,
                    game.PlayerPerspective,
                    versionId,
                    rawDateTime,
                    game.ParsedDateTime,
                    gameMode,
                    game.IndexedAt,
                    game.ScrapedAt,
                    scrapedBy);
            }

            return dataTable;
        }

        private DataTable CreateGamePlayerDataTable(IList<GamePlayer> gamePlayers)
        {
            var dataTable = new DataTable();
            dataTable.Columns.Add("GameId", typeof(int));
            dataTable.Columns.Add("TableId", typeof(int));
            dataTable.Columns.Add("PlayerPerspective", typeof(int));
            dataTable.Columns.Add("PlayerId", typeof(int));
            dataTable.Columns.Add("PlayerName", typeof(string));
            dataTable.Columns.Add("Elo", typeof(int));
            dataTable.Columns.Add("EloChange", typeof(int));
            dataTable.Columns.Add("ArenaPoints", typeof(int));
            dataTable.Columns.Add("ArenaPointsChange", typeof(int));
            dataTable.Columns.Add("Position", typeof(int));

            foreach (var gamePlayer in gamePlayers)
            {
                // Validate player name
                if (string.IsNullOrWhiteSpace(gamePlayer.PlayerName))
                {
                    _logger.LogWarning($"GamePlayer with PlayerId {gamePlayer.PlayerId} has invalid name, skipping");
                    continue;
                }

                dataTable.Rows.Add(
                    gamePlayer.GameId,
                    gamePlayer.TableId,
                    gamePlayer.PlayerPerspective,
                    gamePlayer.PlayerId,
                    gamePlayer.PlayerName,
                    gamePlayer.Elo,
                    gamePlayer.EloChange,
                    gamePlayer.ArenaPoints,
                    gamePlayer.ArenaPointsChange,
                    gamePlayer.Position);
            }

            return dataTable;
        }

        private string ValidateAndTruncateString(string value, int maxLength, string fieldDescription)
        {
            if (string.IsNullOrEmpty(value))
                return value;

            if (value.Length > maxLength)
            {
                _logger.LogWarning($"{fieldDescription} longer than {maxLength} characters, truncating");
                return value.Substring(0, maxLength);
            }

            return value;
        }

        private class GameIdMapping
        {
            public int Id { get; set; }
            public int TableId { get; set; }
            public int PlayerPerspective { get; set; }
        }
    }
}

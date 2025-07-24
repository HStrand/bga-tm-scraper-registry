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
                    INSERT (TableId, PlayerPerspective, VersionId, RawDateTime, ParsedDateTime, GameMode, IndexedAt, ScrapedAt, ScrapedBy, AssignedTo, AssignedAt, Map, PreludeOn, ColoniesOn, CorporateEraOn, DraftOn, BeginnersCorporationsOn)
                    VALUES (source.TableId, source.PlayerPerspective, source.VersionId, source.RawDateTime, source.ParsedDateTime, source.GameMode, source.IndexedAt, source.ScrapedAt, source.ScrapedBy, source.AssignedTo, source.AssignedAt, source.Map, source.PreludeOn, source.ColoniesOn, source.CorporateEraOn, source.DraftOn, source.BeginnersCorporationsOn)
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
            dataTable.Columns.Add("AssignedTo", typeof(string));
            dataTable.Columns.Add("AssignedAt", typeof(DateTime));
            dataTable.Columns.Add("Map", typeof(string));
            dataTable.Columns.Add("PreludeOn", typeof(bool));
            dataTable.Columns.Add("ColoniesOn", typeof(bool));
            dataTable.Columns.Add("CorporateEraOn", typeof(bool));
            dataTable.Columns.Add("DraftOn", typeof(bool));
            dataTable.Columns.Add("BeginnersCorporationsOn", typeof(bool));

            foreach (var game in games)
            {
                // Validate and truncate string fields
                var versionId = ValidateAndTruncateString(game.VersionId, 255, $"Game TableId {game.TableId} VersionId");
                var rawDateTime = ValidateAndTruncateString(game.RawDateTime, 255, $"Game TableId {game.TableId} RawDateTime");
                var gameMode = ValidateAndTruncateString(game.GameMode, 255, $"Game TableId {game.TableId} GameMode");
                var scrapedBy = ValidateAndTruncateString(game.ScrapedBy, 255, $"Game TableId {game.TableId} ScrapedBy");
                var assignedTo = ValidateAndTruncateString(game.AssignedTo, 255, $"Game TableId {game.TableId} AssignedTo");

                var map = ValidateAndTruncateString(game.Map, 255, $"Game TableId {game.TableId} Map");

                dataTable.Rows.Add(
                    game.TableId,
                    game.PlayerPerspective,
                    versionId,
                    rawDateTime,
                    game.ParsedDateTime,
                    gameMode,
                    game.IndexedAt,
                    game.ScrapedAt,
                    scrapedBy,
                    assignedTo,
                    game.AssignedAt,
                    map,
                    game.PreludeOn,
                    game.ColoniesOn,
                    game.CorporateEraOn,
                    game.DraftOn,
                    game.BeginnersCorporationsOn);
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

        public async Task<int> UpsertSingleGameAsync(Game game, IEnumerable<GamePlayer> gamePlayers)
        {
            var gamePlayerList = gamePlayers.ToList();
            
            _logger.LogInformation($"Processing single game with TableId {game.TableId} and {gamePlayerList.Count} players");

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            using var transaction = connection.BeginTransaction();
            try
            {
                // Step 1: Upsert the game and get its ID
                var gameId = await UpsertSingleGameAndGetIdAsync(connection, transaction, game);

                // Step 2: Update GamePlayer records with the correct GameId and upsert them
                foreach (var gamePlayer in gamePlayerList)
                {
                    gamePlayer.GameId = gameId;
                }

                if (gamePlayerList.Any())
                {
                    await UpsertGamePlayersAsync(connection, transaction, gamePlayerList);
                }

                transaction.Commit();
                _logger.LogInformation($"Successfully processed single game with TableId {game.TableId}");
                return gameId;
            }
            catch (Exception ex)
            {
                transaction.Rollback();
                _logger.LogError(ex, $"Error executing single game upsert operation for TableId {game.TableId}");
                throw;
            }
        }

        private async Task<int> UpsertSingleGameAndGetIdAsync(SqlConnection connection, SqlTransaction transaction, Game game)
        {
            // Validate and truncate string fields
            var versionId = ValidateAndTruncateString(game.VersionId, 255, $"Game TableId {game.TableId} VersionId");
            var rawDateTime = ValidateAndTruncateString(game.RawDateTime, 255, $"Game TableId {game.TableId} RawDateTime");
            var gameMode = ValidateAndTruncateString(game.GameMode, 255, $"Game TableId {game.TableId} GameMode");
            var scrapedBy = ValidateAndTruncateString(game.ScrapedBy, 255, $"Game TableId {game.TableId} ScrapedBy");
            var map = ValidateAndTruncateString(game.Map, 255, $"Game TableId {game.TableId} Map");

            var mergeQuery = @"
                MERGE Games AS target
                USING (SELECT @TableId AS TableId, @PlayerPerspective AS PlayerPerspective, @VersionId AS VersionId, 
                              @RawDateTime AS RawDateTime, @ParsedDateTime AS ParsedDateTime, @GameMode AS GameMode,
                              @IndexedAt AS IndexedAt, @ScrapedBy AS ScrapedBy, @Map AS Map, @PreludeOn AS PreludeOn,
                              @ColoniesOn AS ColoniesOn, @CorporateEraOn AS CorporateEraOn, @DraftOn AS DraftOn,
                              @BeginnersCorporationsOn AS BeginnersCorporationsOn) AS source
                ON target.TableId = source.TableId AND target.PlayerPerspective = source.PlayerPerspective
                WHEN NOT MATCHED THEN
                    INSERT (TableId, PlayerPerspective, VersionId, RawDateTime, ParsedDateTime, GameMode, IndexedAt, ScrapedBy, Map, PreludeOn, ColoniesOn, CorporateEraOn, DraftOn, BeginnersCorporationsOn)
                    VALUES (source.TableId, source.PlayerPerspective, source.VersionId, source.RawDateTime, source.ParsedDateTime, source.GameMode, source.IndexedAt, source.ScrapedBy, source.Map, source.PreludeOn, source.ColoniesOn, source.CorporateEraOn, source.DraftOn, source.BeginnersCorporationsOn);

                SELECT Id FROM Games 
                WHERE TableId = @TableId AND PlayerPerspective = @PlayerPerspective;";

            var result = await connection.QuerySingleAsync<int>(
                mergeQuery,
                new
                {
                    TableId = game.TableId,
                    PlayerPerspective = game.PlayerPerspective,
                    VersionId = versionId,
                    RawDateTime = rawDateTime,
                    ParsedDateTime = game.ParsedDateTime,
                    GameMode = gameMode,
                    IndexedAt = game.IndexedAt,
                    ScrapedBy = scrapedBy,
                    Map = map,
                    PreludeOn = game.PreludeOn,
                    ColoniesOn = game.ColoniesOn,
                    CorporateEraOn = game.CorporateEraOn,
                    DraftOn = game.DraftOn,
                    BeginnersCorporationsOn = game.BeginnersCorporationsOn
                },
                transaction);

            return result;
        }

        public async Task<List<int>> GetPlayerGameTableIdsAsync(int playerId)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = "SELECT TableId FROM Games WHERE PlayerPerspective = @playerId";
            
            var results = await connection.QueryAsync<int>(query, new { playerId });
            
            return results.ToList();
        }

        public async Task<bool> GameExistsAsync(int tableId, int playerPerspective)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = "SELECT COUNT(1) FROM Games WHERE TableId = @tableId AND PlayerPerspective = @playerPerspective";
            
            var count = await connection.QuerySingleAsync<int>(query, new { tableId, playerPerspective });
            
            return count > 0;
        }

        public async Task<bool> UpdateGameScrapedInfoAsync(int tableId, int playerPerspective, DateTime scrapedAt, string scrapedBy)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var scrapedByTruncated = ValidateAndTruncateString(scrapedBy, 255, $"Game TableId {tableId} ScrapedBy");

            var query = @"
                UPDATE Games 
                SET ScrapedAt = @scrapedAt, ScrapedBy = @scrapedBy 
                WHERE TableId = @tableId AND PlayerPerspective = @playerPerspective";
            
            var rowsAffected = await connection.ExecuteAsync(query, new 
            { 
                tableId, 
                playerPerspective, 
                scrapedAt, 
                scrapedBy = scrapedByTruncated 
            });
            
            _logger.LogInformation($"Updated {rowsAffected} game record(s) for TableId {tableId}, PlayerPerspective {playerPerspective}");
            
            return rowsAffected > 0;
        }

        public async Task<int> GetUnscrapedGameCountAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"
                SELECT COUNT(1) 
                FROM Games 
                WHERE ScrapedAt IS NULL 
                AND (AssignedTo IS NULL OR AssignedAt < DATEADD(hour, -24, GETUTCDATE()))";

            var count = await connection.QuerySingleAsync<int>(query);
            _logger.LogInformation($"Found {count} unscraped games available for assignment");
            
            return count;
        }

        public async Task<List<GameAssignmentDetails>> GetAndAssignUnscrapedGamesAsync(int count, string assignedTo)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            using var transaction = connection.BeginTransaction();
            try
            {
                // First, get the games to assign
                var selectQuery = @"
                    SELECT TOP (@count)
                        g.Id,
                        g.TableId,
                        g.PlayerPerspective,
                        g.VersionId,
                        g.GameMode,
                        g.ParsedDateTime as PlayedAt,
                        g.Map,
                        g.PreludeOn,
                        g.ColoniesOn,
                        g.CorporateEraOn,
                        g.DraftOn,
                        g.BeginnersCorporationsOn,
                        p.Name as PlayerName
                    FROM Games g
                    INNER JOIN Players p ON g.PlayerPerspective = p.PlayerId
                    WHERE g.ScrapedAt IS NULL 
                    AND (g.AssignedTo IS NULL OR g.AssignedAt < DATEADD(hour, -24, GETUTCDATE()))
                    ORDER BY g.Id";

                var games = await connection.QueryAsync<GameAssignmentDetails>(
                    selectQuery, 
                    new { count }, 
                    transaction);

                var gameList = games.ToList();
                
                if (!gameList.Any())
                {
                    transaction.Rollback();
                    return gameList;
                }

                // Get the game IDs to update
                var gameIds = gameList.Select(g => g.TableId).ToList();

                // Mark these games as assigned
                var updateQuery = @"
                    UPDATE Games 
                    SET AssignedTo = @assignedTo, AssignedAt = GETUTCDATE()
                    WHERE TableId IN @gameIds 
                    AND ScrapedAt IS NULL 
                    AND (AssignedTo IS NULL OR AssignedAt < DATEADD(hour, -24, GETUTCDATE()))";

                var updatedRows = await connection.ExecuteAsync(
                    updateQuery, 
                    new { assignedTo, gameIds }, 
                    transaction);

                _logger.LogInformation($"Assigned {updatedRows} games to {assignedTo}");

                // Get all player information for all games in a single query
                var gameTableIds = gameList.Select(g => g.TableId).ToList();
                var gamePlayerPerspectives = gameList.Select(g => g.PlayerPerspective).ToList();

                var playersQuery = @"
                    SELECT 
                        gp.TableId,
                        gp.PlayerPerspective,
                        gp.PlayerId,
                        gp.PlayerName,
                        gp.Elo,
                        gp.EloChange,
                        gp.ArenaPoints,
                        gp.ArenaPointsChange,
                        gp.Position
                    FROM GamePlayers gp
                    WHERE gp.TableId IN @tableIds 
                    AND gp.PlayerPerspective IN @playerPerspectives
                    ORDER BY gp.TableId, gp.PlayerPerspective, gp.Position";

                var allPlayers = await connection.QueryAsync<GamePlayerInfoWithKeys>(
                    playersQuery,
                    new { tableIds = gameTableIds, playerPerspectives = gamePlayerPerspectives },
                    transaction);

                // Group players by game and assign to the corresponding games
                var playersByGame = allPlayers
                    .GroupBy(p => new { p.TableId, p.PlayerPerspective })
                    .ToDictionary(
                        g => g.Key,
                        g => g.Select(p => new GamePlayerInfo
                        {
                            PlayerId = p.PlayerId,
                            PlayerName = p.PlayerName,
                            Elo = p.Elo,
                            EloChange = p.EloChange ?? 0,
                            ArenaPoints = p.ArenaPoints,
                            ArenaPointsChange = p.ArenaPointsChange,
                            Position = p.Position
                        }).ToList()
                    );

                // Assign players to their respective games
                foreach (var game in gameList)
                {
                    var key = new { TableId = game.TableId, PlayerPerspective = game.PlayerPerspective };
                    if (playersByGame.TryGetValue(key, out var players))
                    {
                        game.Players = players;
                    }
                    else
                    {
                        game.Players = new List<GamePlayerInfo>();
                        _logger.LogWarning($"No players found for game TableId {game.TableId}, PlayerPerspective {game.PlayerPerspective}");
                    }
                }

                transaction.Commit();
                return gameList;
            }
            catch (Exception ex)
            {
                transaction.Rollback();
                _logger.LogError(ex, $"Error assigning games to {assignedTo}");
                throw;
            }
        }

        public async Task<string> GetPlayerNameAsync(int playerId)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = "SELECT Name FROM Players WHERE PlayerId = @playerId";
            
            var playerName = await connection.QuerySingleOrDefaultAsync<string>(query, new { playerId });
            
            return playerName;
        }

        public async Task<Statistics> GetStatisticsAsync(string userEmail = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            // Get total indexed games
            var totalGamesQuery = "SELECT COUNT(*) FROM Games";
            var totalGames = await connection.QuerySingleAsync<int>(totalGamesQuery);

            // Get scraped games total
            var scrapedGamesTotalQuery = "SELECT COUNT(*) FROM Games WHERE ScrapedAt IS NOT NULL";
            var scrapedGamesTotal = await connection.QuerySingleAsync<int>(scrapedGamesTotalQuery);

            // Get scraped games by user (if email provided)
            var scrapedGamesByUser = 0;
            if (!string.IsNullOrEmpty(userEmail))
            {
                var scrapedGamesByUserQuery = "SELECT COUNT(*) FROM Games WHERE ScrapedBy = @userEmail";
                scrapedGamesByUser = await connection.QuerySingleAsync<int>(scrapedGamesByUserQuery, new { userEmail });
            }

            // Get total players
            var totalPlayersQuery = "SELECT COUNT(*) FROM Players";
            var totalPlayers = await connection.QuerySingleAsync<int>(totalPlayersQuery);

            // Get average Elo in scraped games
            var averageEloQuery = @"
                SELECT AVG(CAST(gp.Elo AS FLOAT)) 
                FROM GamePlayers gp
                INNER JOIN Games g ON gp.GameId = g.Id
                WHERE g.ScrapedAt IS NOT NULL";
            var averageEloDouble = await connection.QuerySingleOrDefaultAsync<double?>(averageEloQuery);
            var averageElo = averageEloDouble.HasValue ? (int?)Math.Round(averageEloDouble.Value) : null;

            // Get median Elo in scraped games using a simpler approach
            var medianEloQuery = @"
                WITH OrderedElos AS (
                    SELECT gp.Elo,
                           ROW_NUMBER() OVER (ORDER BY gp.Elo) as RowNum,
                           COUNT(*) OVER() as TotalCount
                    FROM GamePlayers gp
                    INNER JOIN Games g ON gp.GameId = g.Id
                    WHERE g.ScrapedAt IS NOT NULL
                ),
                MedianValues AS (
                    SELECT Elo
                    FROM OrderedElos
                    WHERE RowNum IN ((TotalCount + 1) / 2, (TotalCount + 2) / 2)
                )
                SELECT AVG(CAST(Elo AS FLOAT)) as MedianElo
                FROM MedianValues";
            
            var medianElo = await connection.QuerySingleOrDefaultAsync<double?>(medianEloQuery);
            var medianEloInt = medianElo.HasValue ? (int?)Math.Round(medianElo.Value) : null;

            _logger.LogInformation($"Retrieved statistics: {totalGames} total indexed games, {scrapedGamesTotal} scraped games, {scrapedGamesByUser} scraped by user, {totalPlayers} total players");
            
            return new Statistics
            {
                TotalIndexedGames = totalGames,
                ScrapedGamesTotal = scrapedGamesTotal,
                ScrapedGamesByUser = scrapedGamesByUser,
                TotalPlayers = totalPlayers,
                AverageEloInScrapedGames = averageElo,
                MedianEloInScrapedGames = medianEloInt
            };
        }

        private class GameIdMapping
        {
            public int Id { get; set; }
            public int TableId { get; set; }
            public int PlayerPerspective { get; set; }
        }

        private class GamePlayerInfoWithKeys
        {
            public int TableId { get; set; }
            public int PlayerPerspective { get; set; }
            public int PlayerId { get; set; }
            public string PlayerName { get; set; }
            public int Elo { get; set; }
            public int? EloChange { get; set; }
            public int? ArenaPoints { get; set; }
            public int? ArenaPointsChange { get; set; }
            public int Position { get; set; }
        }
    }
}

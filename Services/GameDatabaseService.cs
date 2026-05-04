using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
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
        private static readonly HttpClient ParquetApiClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(60)
        };

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
                WHEN MATCHED THEN
                    UPDATE SET
                        VersionId = source.VersionId,
                        GameMode = source.GameMode,
                        IndexedAt = source.IndexedAt,
                        IndexedBy = source.IndexedBy,
                        Map = source.Map,
                        PreludeOn = source.PreludeOn,
                        ColoniesOn = source.ColoniesOn,
                        CorporateEraOn = source.CorporateEraOn,
                        DraftOn = source.DraftOn,
                        BeginnersCorporationsOn = source.BeginnersCorporationsOn,
                        GameSpeed = source.GameSpeed
                WHEN NOT MATCHED THEN
                    INSERT (TableId, PlayerPerspective, VersionId, RawDateTime, ParsedDateTime, GameMode, IndexedAt, IndexedBy, ScrapedAt, AssignedTo, AssignedAt, Map, PreludeOn, ColoniesOn, CorporateEraOn, DraftOn, BeginnersCorporationsOn, GameSpeed)
                    VALUES (source.TableId, source.PlayerPerspective, source.VersionId, source.RawDateTime, source.ParsedDateTime, source.GameMode, source.IndexedAt, source.IndexedBy, source.ScrapedAt, source.AssignedTo, source.AssignedAt, source.Map, source.PreludeOn, source.ColoniesOn, source.CorporateEraOn, source.DraftOn, source.BeginnersCorporationsOn, source.GameSpeed)
                OUTPUT INSERTED.Id, INSERTED.TableId, INSERTED.PlayerPerspective;

                ;WITH deduped_games AS (
                    SELECT *, ROW_NUMBER() OVER (
                        PARTITION BY TableId
                        ORDER BY (SELECT NULL)
                    ) AS rn
                    FROM @GameData
                )
                MERGE Games_Canonical AS target
                USING (SELECT TableId, GameMode, Map, PreludeOn, ColoniesOn, CorporateEraOn,
                              DraftOn, BeginnersCorporationsOn, GameSpeed
                       FROM deduped_games WHERE rn = 1) AS source
                ON target.TableId = source.TableId
                WHEN NOT MATCHED THEN
                    INSERT (TableId, GameMode, Map, PreludeOn, ColoniesOn, CorporateEraOn, DraftOn, BeginnersCorporationsOn, GameSpeed)
                    VALUES (source.TableId, source.GameMode, source.Map, source.PreludeOn, source.ColoniesOn, source.CorporateEraOn, source.DraftOn, source.BeginnersCorporationsOn, source.GameSpeed)
                WHEN MATCHED THEN
                    UPDATE SET GameMode = source.GameMode, Map = source.Map, PreludeOn = source.PreludeOn,
                               ColoniesOn = source.ColoniesOn, CorporateEraOn = source.CorporateEraOn,
                               DraftOn = source.DraftOn, BeginnersCorporationsOn = source.BeginnersCorporationsOn,
                               GameSpeed = source.GameSpeed;";

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
                    VALUES (source.GameId, source.TableId, source.PlayerPerspective, source.PlayerId, source.PlayerName, source.Elo, source.EloChange, source.ArenaPoints, source.ArenaPointsChange, source.Position);

                ;WITH deduped AS (
                    SELECT *, ROW_NUMBER() OVER (
                        PARTITION BY TableId, PlayerId
                        ORDER BY CASE WHEN PlayerPerspective = PlayerId THEN 0 ELSE 1 END
                    ) AS rn
                    FROM @GamePlayerData
                )
                MERGE GamePlayers_Canonical AS target
                USING (SELECT GameId, TableId, PlayerId, PlayerName, Elo, EloChange,
                              ArenaPoints, ArenaPointsChange, Position
                       FROM deduped WHERE rn = 1) AS source
                ON target.TableId = source.TableId AND target.PlayerId = source.PlayerId
                WHEN NOT MATCHED THEN
                    INSERT (GameId, TableId, PlayerId, PlayerName, Elo, EloChange, ArenaPoints, ArenaPointsChange, Position)
                    VALUES (source.GameId, source.TableId, source.PlayerId, source.PlayerName, source.Elo, source.EloChange, source.ArenaPoints, source.ArenaPointsChange, source.Position)
                WHEN MATCHED THEN
                    UPDATE SET GameId = source.GameId, PlayerName = source.PlayerName, Elo = source.Elo,
                               EloChange = source.EloChange, ArenaPoints = source.ArenaPoints,
                               ArenaPointsChange = source.ArenaPointsChange, Position = source.Position;";

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
            dataTable.Columns.Add("IndexedBy", typeof(string));
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
            dataTable.Columns.Add("GameSpeed", typeof(string));

            foreach (var game in games)
            {
                // Validate and truncate string fields
                var versionId = ValidateAndTruncateString(game.VersionId, 255, $"Game TableId {game.TableId} VersionId");
                var rawDateTime = ValidateAndTruncateString(game.RawDateTime, 255, $"Game TableId {game.TableId} RawDateTime");
                var gameMode = ValidateAndTruncateString(game.GameMode, 255, $"Game TableId {game.TableId} GameMode");
                var indexedBy = ValidateAndTruncateString(game.IndexedBy, 255, $"Game TableId {game.TableId} IndexedBy");
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
                    indexedBy,
                    game.ScrapedAt,
                    scrapedBy,
                    assignedTo,
                    game.AssignedAt,
                    map,
                    game.PreludeOn,
                    game.ColoniesOn,
                    game.CorporateEraOn,
                    game.DraftOn,
                    game.BeginnersCorporationsOn,
                    game.GameSpeed);
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
            var indexedBy = ValidateAndTruncateString(game.IndexedBy, 255, $"Game TableId {game.TableId} IndexedBy");
            var scrapedBy = ValidateAndTruncateString(game.ScrapedBy, 255, $"Game TableId {game.TableId} ScrapedBy");
            var map = ValidateAndTruncateString(game.Map, 255, $"Game TableId {game.TableId} Map");

            var mergeQuery = @"
                MERGE Games AS target
                USING (SELECT @TableId AS TableId, @PlayerPerspective AS PlayerPerspective, @VersionId AS VersionId, 
                              @RawDateTime AS RawDateTime, @ParsedDateTime AS ParsedDateTime, @GameMode AS GameMode,
                              @IndexedAt AS IndexedAt, @IndexedBy AS IndexedBy, @Map AS Map, @PreludeOn AS PreludeOn,
                              @ColoniesOn AS ColoniesOn, @CorporateEraOn AS CorporateEraOn, @DraftOn AS DraftOn,
                              @BeginnersCorporationsOn AS BeginnersCorporationsOn, @GameSpeed AS GameSpeed) AS source
                ON target.TableId = source.TableId AND target.PlayerPerspective = source.PlayerPerspective
                WHEN MATCHED THEN
                    UPDATE SET 
                        VersionId = source.VersionId,
                        GameMode = source.GameMode,
                        IndexedAt = source.IndexedAt,
                        IndexedBy = source.IndexedBy,
                        Map = source.Map,
                        PreludeOn = source.PreludeOn,
                        ColoniesOn = source.ColoniesOn,
                        CorporateEraOn = source.CorporateEraOn,
                        DraftOn = source.DraftOn,
                        BeginnersCorporationsOn = source.BeginnersCorporationsOn,
                        GameSpeed = source.GameSpeed,
                        RawDateTime = source.RawDateTime,
                        ParsedDateTime = source.ParsedDateTime
                WHEN NOT MATCHED THEN
                    INSERT (TableId, PlayerPerspective, VersionId, RawDateTime, ParsedDateTime, GameMode, IndexedAt, IndexedBy, Map, PreludeOn, ColoniesOn, CorporateEraOn, DraftOn, BeginnersCorporationsOn, GameSpeed)
                    VALUES (source.TableId, source.PlayerPerspective, source.VersionId, source.RawDateTime, source.ParsedDateTime, source.GameMode, source.IndexedAt, source.IndexedBy, source.Map, source.PreludeOn, source.ColoniesOn, source.CorporateEraOn, source.DraftOn, source.BeginnersCorporationsOn, source.GameSpeed);

                MERGE Games_Canonical AS target
                USING (SELECT @TableId AS TableId, @GameMode AS GameMode, @Map AS Map,
                              @PreludeOn AS PreludeOn, @ColoniesOn AS ColoniesOn, @CorporateEraOn AS CorporateEraOn,
                              @DraftOn AS DraftOn, @BeginnersCorporationsOn AS BeginnersCorporationsOn,
                              @GameSpeed AS GameSpeed) AS source
                ON target.TableId = source.TableId
                WHEN NOT MATCHED THEN
                    INSERT (TableId, GameMode, Map, PreludeOn, ColoniesOn, CorporateEraOn, DraftOn, BeginnersCorporationsOn, GameSpeed)
                    VALUES (source.TableId, source.GameMode, source.Map, source.PreludeOn, source.ColoniesOn, source.CorporateEraOn, source.DraftOn, source.BeginnersCorporationsOn, source.GameSpeed)
                WHEN MATCHED THEN
                    UPDATE SET GameMode = source.GameMode, Map = source.Map, PreludeOn = source.PreludeOn,
                               ColoniesOn = source.ColoniesOn, CorporateEraOn = source.CorporateEraOn,
                               DraftOn = source.DraftOn, BeginnersCorporationsOn = source.BeginnersCorporationsOn,
                               GameSpeed = source.GameSpeed;

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
                    IndexedBy = indexedBy,
                    Map = map,
                    PreludeOn = game.PreludeOn,
                    ColoniesOn = game.ColoniesOn,
                    CorporateEraOn = game.CorporateEraOn,
                    DraftOn = game.DraftOn,
                    BeginnersCorporationsOn = game.BeginnersCorporationsOn,
                    GameSpeed = game.GameSpeed
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

        public async Task<bool> UpdateGameScrapedInfoAsync(int tableId, int playerPerspective, DateTime scrapedAt, string scrapedBy, string version)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var scrapedByTruncated = ValidateAndTruncateString(scrapedBy, 255, $"Game TableId {tableId} ScrapedBy");

            var query = @"
                UPDATE Games 
                SET ScrapedAt = @scrapedAt, ScrapedBy = @scrapedBy, ScraperVersion = @version
                WHERE TableId = @tableId AND PlayerPerspective = @playerPerspective";
            
            var rowsAffected = await connection.ExecuteAsync(query, new 
            { 
                tableId, 
                playerPerspective, 
                scrapedAt, 
                scrapedBy = scrapedByTruncated,
                version,
            });
            
            _logger.LogInformation($"Updated {rowsAffected} game record(s) for TableId {tableId}, PlayerPerspective {playerPerspective}");

            return rowsAffected > 0;
        }

        public async Task<bool> MarkGameAsDeletedAsync(int tableId, int playerPerspective, string reason)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"
                UPDATE Games
                SET ReplayDeleted = 1
                WHERE TableId = @tableId AND PlayerPerspective = @playerPerspective";

            var rowsAffected = await connection.ExecuteAsync(query, new { tableId, playerPerspective });

            _logger.LogInformation($"Marked {rowsAffected} game record(s) as deleted for TableId {tableId}, PlayerPerspective {playerPerspective}, reason: {reason}");

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
                AND (ReplayDeleted IS NULL OR ReplayDeleted = 0)
                AND (AssignedTo IS NULL OR AssignedAt < DATEADD(hour, -24, GETUTCDATE()))";

            var count = await connection.QuerySingleAsync<int>(query);
            _logger.LogInformation($"Found {count} unscraped games available for assignment");

            return count;
        }

        public async Task<List<GameAssignmentDetails>> GetAndAssignUnscrapedGamesAsync(int count, string assignedTo)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            // Atomically pick candidates, mark them assigned, and capture the assigned
            // rows in a table variable so we can JOIN against it instead of sending a
            // 199-element IN list back to the server.
            var assignSql = @"
                DECLARE @Assigned TABLE (
                    TableId int NOT NULL,
                    PlayerPerspective int NOT NULL,
                    VersionId nvarchar(max) NULL,
                    GameMode nvarchar(max) NULL,
                    PlayedAt datetime2 NULL,
                    Map nvarchar(max) NULL,
                    PreludeOn bit NULL,
                    ColoniesOn bit NULL,
                    CorporateEraOn bit NULL,
                    DraftOn bit NULL,
                    BeginnersCorporationsOn bit NULL,
                    GameSpeed nvarchar(max) NULL,
                    MapPriority int NOT NULL,
                    PRIMARY KEY (TableId, PlayerPerspective)
                );

                DECLARE @half int = @count / 2;

                ;WITH Unscraped AS (
                    SELECT TOP (@count) g.Id,
                        ROW_NUMBER() OVER (ORDER BY
                            CASE g.Map
                                WHEN 'Vastitas Borealis' THEN 1
                                WHEN 'Elysium' THEN 2
                                WHEN 'Random' THEN 3
                                WHEN 'Hellas' THEN 4
                                WHEN 'Tharsis' THEN 5
                                WHEN 'Amazonis Planitia' THEN 6
                                ELSE 7
                            END,
                            g.TableId) AS RN
                    FROM Games g
                    INNER JOIN Players p ON g.PlayerPerspective = p.PlayerId
                    WHERE g.ScrapedAt IS NULL
                      AND (g.ReplayDeleted IS NULL OR g.ReplayDeleted = 0)
                      AND (g.AssignedTo IS NULL OR g.AssignedAt < DATEADD(hour, -24, GETUTCDATE()))
                ),
                Rescrape AS (
                    SELECT TOP (@count) g.Id,
                        ROW_NUMBER() OVER (ORDER BY
                            CASE WHEN g.ScraperVersion IS NULL THEN 0 ELSE 1 END,
                            g.ScraperVersion ASC,
                            CASE g.Map
                                WHEN 'Vastitas Borealis' THEN 1
                                WHEN 'Elysium' THEN 2
                                WHEN 'Random' THEN 3
                                WHEN 'Hellas' THEN 4
                                WHEN 'Tharsis' THEN 5
                                WHEN 'Amazonis Planitia' THEN 6
                                ELSE 7
                            END,
                            g.TableId) AS RN
                    FROM Games g
                    INNER JOIN Players p ON g.PlayerPerspective = p.PlayerId
                    WHERE g.ScrapedAt IS NOT NULL
                      AND (g.ReplayDeleted IS NULL OR g.ReplayDeleted = 0)
                      AND (g.AssignedTo IS NULL OR g.AssignedAt < DATEADD(hour, -24, GETUTCDATE()))
                ),
                Pooled AS (
                    SELECT Id, RN,
                        CASE WHEN RN <= @half THEN 0 ELSE 2 END AS SelectionPriority
                    FROM Unscraped
                    UNION ALL
                    SELECT Id, RN,
                        CASE WHEN RN <= @half THEN 1 ELSE 3 END AS SelectionPriority
                    FROM Rescrape
                ),
                Candidates AS (
                    SELECT TOP (@count) Id
                    FROM Pooled
                    ORDER BY SelectionPriority, RN
                )
                UPDATE g
                SET AssignedTo = @assignedTo, AssignedAt = GETUTCDATE()
                OUTPUT
                    inserted.TableId,
                    inserted.PlayerPerspective,
                    inserted.VersionId,
                    inserted.GameMode,
                    inserted.ParsedDateTime,
                    inserted.Map,
                    inserted.PreludeOn,
                    inserted.ColoniesOn,
                    inserted.CorporateEraOn,
                    inserted.DraftOn,
                    inserted.BeginnersCorporationsOn,
                    inserted.GameSpeed,
                    CASE inserted.Map
                        WHEN 'Vastitas Borealis' THEN 1
                        WHEN 'Elysium' THEN 2
                        WHEN 'Random' THEN 3
                        WHEN 'Hellas' THEN 4
                        WHEN 'Tharsis' THEN 5
                        WHEN 'Amazonis Planitia' THEN 6
                        ELSE 7
                        END
                INTO @Assigned
                FROM Games g
                INNER JOIN Candidates c ON g.Id = c.Id;

                SELECT
                    a.TableId,
                    a.PlayerPerspective,
                    a.VersionId,
                    a.GameMode,
                    a.PlayedAt,
                    a.Map,
                    a.PreludeOn,
                    a.ColoniesOn,
                    a.CorporateEraOn,
                    a.DraftOn,
                    a.BeginnersCorporationsOn,
                    a.GameSpeed,
                    p.Name AS PlayerName
                FROM @Assigned a
                INNER JOIN Players p ON a.PlayerPerspective = p.PlayerId
                ORDER BY a.MapPriority, a.TableId;

                SELECT
                    gp.TableId,
                    gp.PlayerId,
                    gp.PlayerName,
                    gp.Elo,
                    gp.EloChange,
                    gp.ArenaPoints,
                    gp.ArenaPointsChange,
                    gp.Position
                FROM GamePlayers_Canonical gp
                WHERE EXISTS (SELECT 1 FROM @Assigned a WHERE a.TableId = gp.TableId)
                ORDER BY gp.TableId, gp.Position;";

            using var multi = await connection.QueryMultipleAsync(assignSql, new { count, assignedTo }, commandTimeout: 120);

            var gameList = (await multi.ReadAsync<GameAssignmentDetails>()).ToList();

            if (!gameList.Any())
            {
                _logger.LogInformation($"No unscraped games available to assign to {assignedTo}");
                return gameList;
            }

            var allPlayers = await multi.ReadAsync<GamePlayerInfoWithKeys>();

            var playersByGame = allPlayers
                .GroupBy(p => p.TableId)
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

            foreach (var game in gameList)
            {
                if (playersByGame.TryGetValue(game.TableId, out var players))
                {
                    game.Players = players;
                }
                else
                {
                    game.Players = new List<GamePlayerInfo>();
                    _logger.LogWarning($"No players found for game TableId {game.TableId}, PlayerPerspective {game.PlayerPerspective}");
                }
            }

            _logger.LogInformation($"Assigned {gameList.Count} games to {assignedTo}");
            return gameList;
        }

        public async Task<string> GetPlayerNameAsync(int playerId)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = "SELECT Name FROM Players WHERE PlayerId = @playerId";
            
            var playerName = await connection.QuerySingleOrDefaultAsync<string>(query, new { playerId });
            
            return playerName;
        }

        public async Task<GlobalStatistics> GetGlobalStatisticsAsync()
        {
            var baseUrl = (Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "https://api.tfmstats.com").TrimEnd('/');

            var response = await ParquetApiClient.GetAsync($"{baseUrl}/api/statistics/global");
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            var stats = JsonSerializer.Deserialize<GlobalStatistics>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new GlobalStatistics();

            _logger.LogInformation($"Retrieved global statistics: {stats.TotalIndexedGames} total indexed games, {stats.ScrapedGamesTotal} scraped games, {stats.TotalPlayers} total players");

            return stats;
        }

        public async Task<List<GameMetadata>> GetAllGamesMetadataAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"
                SELECT 
                    TableId,
                    PlayerPerspective,
                    ParsedDateTime,
                    Map,
                    PreludeOn,
                    ColoniesOn,
                    CorporateEraOn,
                    DraftOn,
                    BeginnersCorporationsOn,
                    GameSpeed
                FROM Games 
                WHERE ScrapedAt IS NOT NULL
                ORDER BY TableId, PlayerPerspective";

            var results = await connection.QueryAsync<GameMetadata>(query);
            var gamesList = results.ToList();
            
            _logger.LogInformation($"Retrieved metadata for {gamesList.Count} games");
            return gamesList;
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

        private class RowCount
        {
            public string TableName { get; set; }
            public int TableRowCount { get; set; }
        }

        public async Task<IEnumerable<ScraperLeaderboardEntry>> GetScraperLeaderboardAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"
                SELECT 
                  COALESCE(um.DisplayName, 'Anonymous') AS Scraper,
                  COUNT(1) AS ScrapedCount
                FROM Games g
                LEFT JOIN UserMappings um ON um.Username = g.ScrapedBy
                WHERE g.ScrapedBy IS NOT NULL
                GROUP BY 
                  CASE 
                    WHEN um.DisplayName IS NOT NULL THEN um.DisplayName
                    ELSE g.ScrapedBy
                  END,
                  um.DisplayName
                ORDER BY ScrapedCount DESC;";

            var result = await connection.QueryAsync<ScraperLeaderboardEntry>(query);
            return result;
        }

        public async Task<Game> GetGameAsync(int tableId, int playerPerspective)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = "SELECT * FROM Games WHERE TableId = @tableId AND PlayerPerspective = @playerPerspective";
            
            var game = await connection.QuerySingleOrDefaultAsync<Game>(query, new { tableId, playerPerspective });
            
            return game;
        }

        public async Task<List<MissingStatsItem>> GetGamesMissingStatsAsync(int? top = null, int? playerId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var topClause = top.HasValue && top.Value > 0 ? "TOP(@Top)" : "";
            var playerFilter = playerId.HasValue ? "AND g.PlayerPerspective = @playerId" : "";

            var query = $@"
                SELECT {topClause} g.TableId, g.PlayerPerspective AS PlayerId
                FROM Games g
                LEFT JOIN GameStats gs ON gs.TableId = g.TableId
                WHERE g.ScrapedAt IS NOT NULL
                AND gs.TableId IS NULL
                {playerFilter}";

            var results = await connection.QueryAsync<MissingStatsItem>(query, new { Top = top ?? 0, playerId = playerId ?? 0 });
            return results.ToList();
        }

        public async Task<List<MissingOpponentCardsItem>> GetGamesMissingOpponentCardsAsync(int? top = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var baseQuery = @"
                SELECT
                    DISTINCT
                    g.TableId,
                    g.PlayerPerspective
                FROM Games g
                INNER JOIN
                (
                    SELECT
                        DISTINCT 
                        g.TableId,
                        gp.PlayerId
                    FROM GamePlayers gp
                    INNER JOIN Games g ON g.TableId = gp.TableId
                    WHERE g.PlayerPerspective <> gp.PlayerId

                    EXCEPT

                    SELECT DISTINCT TableId, PlayerId
                    FROM GameCards
                ) missing ON missing.TableId = g.TableId";

            if (top.HasValue && top.Value > 0)
            {
                var topQuery = $"SELECT TOP(@Top) * FROM ({baseQuery}) AS subquery";
                var topResults = await connection.QueryAsync<MissingOpponentCardsItem>(topQuery, new { Top = top.Value });
                return topResults.ToList();
            }
            else
            {
                var results = await connection.QueryAsync<MissingOpponentCardsItem>(baseQuery);
                return results.ToList();
            }
        }

        public async Task<List<MissingStatsItem>> GetGamesWithRandomMapAsync(int? top = null)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"
                SELECT TableId, PlayerPerspective AS PlayerId
                FROM Games
                WHERE Map = 'Random' AND ScrapedAt IS NOT NULL";

            if (top.HasValue && top.Value > 0)
            {
                var topQuery = query + " ORDER BY TableId OFFSET 0 ROWS FETCH NEXT @Top ROWS ONLY";
                var topResults = await connection.QueryAsync<MissingStatsItem>(topQuery, new { Top = top.Value });
                return topResults.ToList();
            }
            else
            {
                var results = await connection.QueryAsync<MissingStatsItem>(query);
                return results.ToList();
            }
        }

        public async Task<bool> UpdateGameMapAsync(int tableId, int playerPerspective, string map)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var mapTruncated = ValidateAndTruncateString(map, 255, $"Game TableId {tableId} Map");

            var query = @"
                UPDATE Games 
                SET Map = @map
                WHERE TableId = @tableId AND PlayerPerspective = @playerPerspective";
            
            var rowsAffected = await connection.ExecuteAsync(query, new 
            { 
                tableId, 
                playerPerspective, 
                map = mapTruncated
            });
            
            _logger.LogInformation($"Updated {rowsAffected} game record(s) Map field for TableId {tableId}, PlayerPerspective {playerPerspective}");
            
            return rowsAffected > 0;
        }
    }
}

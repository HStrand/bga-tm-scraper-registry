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
    public class PlayerDatabaseService
    {
        private readonly string _connectionString;
        private readonly ILogger _logger;
        private const int BatchSize = 1000;

        public PlayerDatabaseService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<int> UpsertPlayersAsync(IEnumerable<Player> players)
        {
            var playerList = players.ToList();
            var totalProcessed = 0;

            _logger.LogInformation($"Starting to process {playerList.Count} players in batches of {BatchSize}");

            // Process players in batches
            for (int i = 0; i < playerList.Count; i += BatchSize)
            {
                var batch = playerList.Skip(i).Take(BatchSize).ToList();
                var batchNumber = (i / BatchSize) + 1;
                var totalBatches = (int)Math.Ceiling((double)playerList.Count / BatchSize);

                _logger.LogInformation($"Processing batch {batchNumber}/{totalBatches} with {batch.Count} players");

                try
                {
                    var processed = await ProcessBatchAsync(batch);
                    totalProcessed += processed;
                    _logger.LogInformation($"Successfully processed batch {batchNumber}/{totalBatches}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Error processing batch {batchNumber}/{totalBatches}");
                    throw;
                }
            }

            _logger.LogInformation($"Completed processing all batches. Total players processed: {totalProcessed}");
            return totalProcessed;
        }

        private async Task<int> ProcessBatchAsync(IList<Player> players)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            using var transaction = connection.BeginTransaction();
            try
            {
                // Create a DataTable for the batch
                var dataTable = CreatePlayerDataTable(players);

                // Use MERGE statement for efficient upsert
                var mergeQuery = @"
                    MERGE Players AS target
                    USING @PlayerData AS source ON target.PlayerId = source.PlayerId
                    WHEN MATCHED THEN 
                        UPDATE SET 
                            Name = source.Name, 
                            Country = source.Country, 
                            Elo = source.Elo, 
                            UpdatedAt = source.UpdatedAt
                    WHEN NOT MATCHED THEN
                        INSERT (PlayerId, Name, Country, Elo, UpdatedAt)
                        VALUES (source.PlayerId, source.Name, source.Country, source.Elo, source.UpdatedAt);";

                var rowsAffected = await connection.ExecuteAsync(
                    mergeQuery,
                    new { PlayerData = dataTable.AsTableValuedParameter("dbo.PlayerTableType") },
                    transaction);

                transaction.Commit();
                return players.Count;
            }
            catch (Exception ex)
            {
                transaction.Rollback();
                _logger.LogError(ex, "Error executing batch upsert operation");
                throw;
            }
        }

        private DataTable CreatePlayerDataTable(IList<Player> players)
        {
            var dataTable = new DataTable();
            dataTable.Columns.Add("PlayerId", typeof(int));
            dataTable.Columns.Add("Name", typeof(string));
            dataTable.Columns.Add("Country", typeof(string));
            dataTable.Columns.Add("Elo", typeof(int));
            dataTable.Columns.Add("UpdatedAt", typeof(DateTime));

            foreach (var player in players)
            {
                // Validate player data
                if (string.IsNullOrWhiteSpace(player.Name))
                {
                    _logger.LogWarning($"Player with ID {player.PlayerId} has invalid name, skipping");
                    continue;
                }

                if (player.Name.Length > 255)
                {
                    _logger.LogWarning($"Player with ID {player.PlayerId} has name longer than 255 characters, truncating");
                    player.Name = player.Name.Substring(0, 255);
                }

                if (!string.IsNullOrEmpty(player.Country) && player.Country.Length > 255)
                {
                    _logger.LogWarning($"Player with ID {player.PlayerId} has country longer than 255 characters, truncating");
                    player.Country = player.Country.Substring(0, 255);
                }

                dataTable.Rows.Add(
                    player.PlayerId,
                    player.Name,
                    player.Country,
                    player.Elo,
                    player.UpdatedAt);
            }

            return dataTable;
        }

        public async Task<int?> GetNextPlayerToIndexAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"
                SELECT TOP 1000
                    p.PlayerId,
                    p.Name,
                    p.Elo,
                    MAX(g.IndexedAt) AS LastIndexedAt,
                    MAX(g.ScrapedAt) AS LastScrapedAt
                FROM Players p
                LEFT JOIN Games g ON p.PlayerId = g.PlayerPerspective
                GROUP BY p.PlayerId, p.Name, p.Elo
                ORDER BY p.Elo DESC";

            var results = await connection.QueryAsync<PlayerIndexingInfo>(query);
            var playerList = results.ToList();

            if (!playerList.Any())
            {
                _logger.LogInformation("No players found in database");
                return null;
            }

            var unindexedPlayer = playerList
                .Where(p => p.LastIndexedAt == null)
                .OrderByDescending(p => p.Elo)
                .FirstOrDefault();

            if (unindexedPlayer != null)
            {
                _logger.LogInformation($"Found unindexed player: {unindexedPlayer.PlayerId} (Elo: {unindexedPlayer.Elo})");
                return unindexedPlayer.PlayerId;
            }

            // Third priority: Player with oldest LastIndexedAt
            var oldestIndexedPlayer = playerList
                .Where(p => p.LastIndexedAt.HasValue)
                .OrderBy(p => p.LastIndexedAt.Value)
                .FirstOrDefault();

            if (oldestIndexedPlayer != null)
            {
                _logger.LogInformation($"Found oldest indexed player: {oldestIndexedPlayer.PlayerId} (Last indexed: {oldestIndexedPlayer.LastIndexedAt})");
                return oldestIndexedPlayer.PlayerId;
            }

            _logger.LogInformation("No suitable player found for indexing");
            return null;
        }

        private class PlayerIndexingInfo
        {
            public int PlayerId { get; set; }
            public string Name { get; set; }
            public int Elo { get; set; }
            public DateTime? LastIndexedAt { get; set; }
            public DateTime? LastScrapedAt { get; set; }
        }
    }
}

using System;
using System.Threading.Tasks;
using BgaTmScraperRegistry.Models;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

namespace BgaTmScraperRegistry.Services
{
    public class UserMappingDatabaseService
    {
        private readonly string _connectionString;
        private readonly ILogger _logger;

        public UserMappingDatabaseService(string connectionString, ILogger logger)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<bool> SaveUserMappingAsync(UserMapping userMapping)
        {
            if (userMapping == null)
            {
                throw new ArgumentNullException(nameof(userMapping));
            }

            if (string.IsNullOrWhiteSpace(userMapping.Username))
            {
                throw new ArgumentException("Username cannot be null or empty", nameof(userMapping));
            }

            if (string.IsNullOrWhiteSpace(userMapping.DisplayName))
            {
                throw new ArgumentException("DisplayName cannot be null or empty", nameof(userMapping));
            }

            // Validate and truncate if necessary
            if (userMapping.Username.Length > 255)
            {
                _logger.LogWarning($"Username longer than 255 characters, truncating: {userMapping.Username}");
                userMapping.Username = userMapping.Username.Substring(0, 255);
            }

            if (userMapping.DisplayName.Length > 255)
            {
                _logger.LogWarning($"DisplayName longer than 255 characters, truncating: {userMapping.DisplayName}");
                userMapping.DisplayName = userMapping.DisplayName.Substring(0, 255);
            }

            try
            {
                using var connection = new SqlConnection(_connectionString);
                await connection.OpenAsync();

                var insertQuery = @"
                    INSERT INTO UserMappings (Username, DisplayName, UpdatedAt)
                    VALUES (@Username, @DisplayName, @UpdatedAt)";

                var rowsAffected = await connection.ExecuteAsync(insertQuery, userMapping);

                _logger.LogInformation($"Successfully saved user mapping: {userMapping.Username} -> {userMapping.DisplayName}");
                return rowsAffected > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error saving user mapping: {userMapping.Username} -> {userMapping.DisplayName}");
                throw;
            }
        }
    }
}

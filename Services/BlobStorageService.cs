using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Logging;

namespace BgaTmScraperRegistry.Services
{
    public class BlobStorageService
    {
        private readonly BlobServiceClient _blobServiceClient;
        private readonly ILogger _logger;
        private const string ContainerName = "games";

        public BlobStorageService(string connectionString, ILogger logger)
        {
            _blobServiceClient = new BlobServiceClient(connectionString);
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<string> UploadGameLogAsync(string playerPerspective, string tableId, string jsonContent)
        {
            try
            {
                // Generate blob path: {player_perspective}/game_{table_id}_{player_perspective}.json
                var blobPath = $"{playerPerspective}/game_{tableId}_{playerPerspective}.json";
                
                _logger.LogInformation($"Uploading game log to blob path: {blobPath}");

                // Get container client
                var containerClient = _blobServiceClient.GetBlobContainerClient(ContainerName);
                
                // Ensure container exists
                await containerClient.CreateIfNotExistsAsync(PublicAccessType.None);

                // Get blob client
                var blobClient = containerClient.GetBlobClient(blobPath);

                // Convert JSON string to stream
                using var stream = new MemoryStream(Encoding.UTF8.GetBytes(jsonContent));

                // Set content type
                var blobHttpHeaders = new BlobHttpHeaders
                {
                    ContentType = "application/json"
                };

                // Upload the blob (this will overwrite if it already exists)
                await blobClient.UploadAsync(stream, new BlobUploadOptions
                {
                    HttpHeaders = blobHttpHeaders
                });

                _logger.LogInformation($"Successfully uploaded game log to blob path: {blobPath}");
                return blobPath;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error uploading game log for player {playerPerspective}, table {tableId}");
                throw;
            }
        }

        public async Task<bool> BlobExistsAsync(string playerPerspective, string tableId)
        {
            try
            {
                var blobPath = $"{playerPerspective}/game_{tableId}_{playerPerspective}.json";
                var containerClient = _blobServiceClient.GetBlobContainerClient(ContainerName);
                var blobClient = containerClient.GetBlobClient(blobPath);

                var response = await blobClient.ExistsAsync();
                return response.Value;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error checking if blob exists for player {playerPerspective}, table {tableId}");
                return false;
            }
        }

        public async Task<string> GetBlobContentAsync(string playerPerspective, string tableId)
        {
            try
            {
                var blobPath = $"{playerPerspective}/game_{tableId}_{playerPerspective}.json";
                var containerClient = _blobServiceClient.GetBlobContainerClient(ContainerName);
                var blobClient = containerClient.GetBlobClient(blobPath);

                var response = await blobClient.DownloadContentAsync();
                return response.Value.Content.ToString();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error downloading blob content for player {playerPerspective}, table {tableId}");
                throw;
            }
        }
    }
}

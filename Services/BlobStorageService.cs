using System;
using System.Collections.Generic;
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

        public async Task<List<string>> GetAllJsonBlobsAsync()
        {
            try
            {
                var blobPaths = new List<string>();
                var containerClient = _blobServiceClient.GetBlobContainerClient(ContainerName);

                _logger.LogInformation("Listing all JSON blobs in container");

                await foreach (var blobItem in containerClient.GetBlobsAsync())
                {
                    if (blobItem.Name.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                    {
                        blobPaths.Add(blobItem.Name);
                    }
                }

                _logger.LogInformation($"Found {blobPaths.Count} JSON blobs");
                return blobPaths;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listing JSON blobs");
                throw;
            }
        }

        public async Task<Stream> DownloadBlobAsStreamAsync(string blobPath)
        {
            try
            {
                var containerClient = _blobServiceClient.GetBlobContainerClient(ContainerName);
                var blobClient = containerClient.GetBlobClient(blobPath);

                var response = await blobClient.DownloadStreamingAsync();
                return response.Value.Content;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error downloading blob as stream: {blobPath}");
                throw;
            }
        }

        public async Task<string> UploadZipArchiveAsync(Stream zipStream, string fileName)
        {
            try
            {
                const string archiveContainerName = "archives";
                
                _logger.LogInformation($"Uploading ZIP archive: {fileName}");

                // Get container client for archives
                var containerClient = _blobServiceClient.GetBlobContainerClient(archiveContainerName);
                
                // Ensure container exists
                await containerClient.CreateIfNotExistsAsync(PublicAccessType.None);

                // Get blob client
                var blobClient = containerClient.GetBlobClient(fileName);

                // Set content type
                var blobHttpHeaders = new BlobHttpHeaders
                {
                    ContentType = "application/zip"
                };

                // Reset stream position
                zipStream.Position = 0;

                // Upload the ZIP file
                await blobClient.UploadAsync(zipStream, new BlobUploadOptions
                {
                    HttpHeaders = blobHttpHeaders
                });

                _logger.LogInformation($"Successfully uploaded ZIP archive: {fileName}");
                return $"{archiveContainerName}/{fileName}";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error uploading ZIP archive: {fileName}");
                throw;
            }
        }

        public async Task<string> GetLatestZipArchiveAsync()
        {
            try
            {
                const string archiveContainerName = "archives";
                var containerClient = _blobServiceClient.GetBlobContainerClient(archiveContainerName);

                _logger.LogInformation("Finding latest ZIP archive");

                var zipFiles = new List<string>();

                await foreach (var blobItem in containerClient.GetBlobsAsync())
                {
                    if (blobItem.Name.StartsWith("game-logs-archive-") && 
                        blobItem.Name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                    {
                        zipFiles.Add(blobItem.Name);
                    }
                }

                if (zipFiles.Count == 0)
                {
                    _logger.LogWarning("No ZIP archives found");
                    return null;
                }

                // Sort by filename (which contains timestamp) to get the latest
                zipFiles.Sort();
                var latestZip = zipFiles[zipFiles.Count - 1];

                _logger.LogInformation($"Latest ZIP archive found: {latestZip}");
                return latestZip;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error finding latest ZIP archive");
                throw;
            }
        }

        public async Task<Stream> DownloadZipArchiveAsStreamAsync(string fileName)
        {
            try
            {
                const string archiveContainerName = "archives";
                var containerClient = _blobServiceClient.GetBlobContainerClient(archiveContainerName);
                var blobClient = containerClient.GetBlobClient(fileName);

                _logger.LogInformation($"Downloading ZIP archive: {fileName}");

                var response = await blobClient.DownloadStreamingAsync();
                return response.Value.Content;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error downloading ZIP archive: {fileName}");
                throw;
            }
        }

        public async Task<long> GetZipArchiveSizeAsync(string fileName)
        {
            try
            {
                const string archiveContainerName = "archives";
                var containerClient = _blobServiceClient.GetBlobContainerClient(archiveContainerName);
                var blobClient = containerClient.GetBlobClient(fileName);

                _logger.LogInformation($"Getting size of ZIP archive: {fileName}");

                var properties = await blobClient.GetPropertiesAsync();
                var sizeInBytes = properties.Value.ContentLength;

                _logger.LogInformation($"ZIP archive {fileName} size: {sizeInBytes} bytes");
                return sizeInBytes;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error getting ZIP archive size: {fileName}");
                throw;
            }
        }
    }
}

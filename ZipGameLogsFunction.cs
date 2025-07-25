using System;
using System.IO;
using System.IO.Compression;
using System.Threading.Tasks;
using BgaTmScraperRegistry.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.Extensions.Logging;

namespace BgaTmScraperRegistry
{
    public static class ZipGameLogsFunction
    {
        [Disable("disableCronJobs")]
        [FunctionName("ZipGameLogsScheduled")]
        public static async Task RunScheduled(
            [TimerTrigger("0 0 2 * * *")] TimerInfo timer,
            ILogger log)
        {
            log.LogInformation($"ZipGameLogsScheduled timer trigger function executed at: {DateTime.Now}");

            try
            {
                var result = await CreateGameLogsArchive(log);
                
                if (result.Success)
                {
                    log.LogInformation($"Scheduled ZIP creation completed successfully. Archive: {result.ArchiveFileName}, Files: {result.FilesIncluded}, Size: {result.ArchiveSize}");
                }
                else
                {
                    log.LogError($"Scheduled ZIP creation failed: {result.ErrorMessage}");
                }
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred during scheduled ZIP creation");
            }
        }

        [FunctionName("ZipGameLogsOnDemand")]
        public static async Task<IActionResult> RunOnDemand(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("ZipGameLogsOnDemand HTTP trigger function processed a request.");

            try
            {
                var result = await CreateGameLogsArchive(log);

                if (result.Success)
                {
                    return new OkObjectResult(new
                    {
                        success = true,
                        archiveFileName = result.ArchiveFileName,
                        filesIncluded = result.FilesIncluded,
                        archiveSize = result.ArchiveSize,
                        createdAt = result.CreatedAt
                    });
                }
                else
                {
                    return new BadRequestObjectResult(new
                    {
                        success = false,
                        error = result.ErrorMessage
                    });
                }
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred during on-demand ZIP creation");
                return new StatusCodeResult(500);
            }
        }

        private static async Task<ZipCreationResult> CreateGameLogsArchive(ILogger log)
        {
            try
            {
                // Get connection string from environment variables
                var blobConnectionString = Environment.GetEnvironmentVariable("BlobStorageConnectionString");

                if (string.IsNullOrEmpty(blobConnectionString))
                {
                    log.LogError("BlobStorageConnectionString environment variable is not set");
                    return new ZipCreationResult
                    {
                        Success = false,
                        ErrorMessage = "BlobStorageConnectionString environment variable is not set"
                    };
                }

                // Initialize blob service
                var blobService = new BlobStorageService(blobConnectionString, log);

                // Get all JSON blobs
                log.LogInformation("Starting to list all JSON blobs");
                var jsonBlobs = await blobService.GetAllJsonBlobsAsync();

                if (jsonBlobs.Count == 0)
                {
                    log.LogWarning("No JSON blobs found to archive");
                    return new ZipCreationResult
                    {
                        Success = false,
                        ErrorMessage = "No JSON blobs found to archive"
                    };
                }

                log.LogInformation($"Found {jsonBlobs.Count} JSON blobs to archive");

                // Create ZIP archive in memory
                using var zipStream = new MemoryStream();
                using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, true))
                {
                    int processedFiles = 0;
                    int failedFiles = 0;

                    foreach (var blobPath in jsonBlobs)
                    {
                        try
                        {
                            log.LogDebug($"Processing blob: {blobPath}");

                            // Download blob as stream
                            using var blobStream = await blobService.DownloadBlobAsStreamAsync(blobPath);

                            // Create entry in ZIP with the same path structure
                            var zipEntry = archive.CreateEntry(blobPath, CompressionLevel.Optimal);

                            // Copy blob content to ZIP entry
                            using var zipEntryStream = zipEntry.Open();
                            await blobStream.CopyToAsync(zipEntryStream);

                            processedFiles++;
                        }
                        catch (Exception ex)
                        {
                            log.LogWarning(ex, $"Failed to process blob: {blobPath}");
                            failedFiles++;
                        }
                    }

                    log.LogInformation($"ZIP archive creation completed. Processed: {processedFiles}, Failed: {failedFiles}");
                }

                // Generate archive filename with timestamp
                var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd-HHmmss");
                var archiveFileName = $"game-logs-archive-{timestamp}.zip";

                // Upload ZIP to blob storage
                log.LogInformation($"Uploading ZIP archive: {archiveFileName}");
                var archivePath = await blobService.UploadZipArchiveAsync(zipStream, archiveFileName);

                // Calculate archive size
                var archiveSize = FormatBytes(zipStream.Length);

                log.LogInformation($"ZIP archive uploaded successfully: {archivePath}, Size: {archiveSize}");

                return new ZipCreationResult
                {
                    Success = true,
                    ArchiveFileName = archiveFileName,
                    FilesIncluded = jsonBlobs.Count,
                    ArchiveSize = archiveSize,
                    CreatedAt = DateTime.UtcNow
                };
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error creating game logs archive");
                return new ZipCreationResult
                {
                    Success = false,
                    ErrorMessage = ex.Message
                };
            }
        }

        private static string FormatBytes(long bytes)
        {
            string[] suffixes = { "B", "KB", "MB", "GB", "TB" };
            int counter = 0;
            decimal number = bytes;
            while (Math.Round(number / 1024) >= 1)
            {
                number /= 1024;
                counter++;
            }
            return $"{number:n1} {suffixes[counter]}";
        }

        private class ZipCreationResult
        {
            public bool Success { get; set; }
            public string ArchiveFileName { get; set; }
            public int FilesIncluded { get; set; }
            public string ArchiveSize { get; set; }
            public DateTime CreatedAt { get; set; }
            public string ErrorMessage { get; set; }
        }
    }
}

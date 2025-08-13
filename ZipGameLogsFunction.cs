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

                // Get all JSON blobs (list only)
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

                log.LogInformation($"Found {jsonBlobs.Count} JSON blobs in container");

                // Try incremental update: open latest existing archive and add only new files
                var latestZip = await blobService.GetLatestZipArchiveAsync();
                if (!string.IsNullOrEmpty(latestZip))
                {
                    try
                    {
                        using (var existingZipRemoteStream = await blobService.DownloadZipArchiveAsStreamAsync(latestZip))
                        {
                            // Work on a seekable in-memory copy so we can open in Update mode and then upload
                            using var workingStream = new MemoryStream();
                            await existingZipRemoteStream.CopyToAsync(workingStream);
                            workingStream.Position = 0;

                            int addedFiles = 0;
                            int failedFiles = 0;
                            int existingCount = 0;

                            using (var archive = new ZipArchive(workingStream, ZipArchiveMode.Update, true))
                            {
                                // Build set of existing entries
                                var existingFiles = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                                foreach (var entry in archive.Entries)
                                {
                                    existingFiles.Add(entry.FullName);
                                }
                                existingCount = existingFiles.Count;

                                // Determine which blobs are new
                                var newFiles = jsonBlobs.FindAll(p => !existingFiles.Contains(p));

                                log.LogInformation($"Latest archive {latestZip} contains {existingCount} files. {newFiles.Count} new files to add.");

                                foreach (var blobPath in newFiles)
                                {
                                    try
                                    {
                                        log.LogDebug($"Adding new blob to archive: {blobPath}");
                                        using var blobStream = await blobService.DownloadBlobAsStreamAsync(blobPath);
                                        var zipEntry = archive.CreateEntry(blobPath, CompressionLevel.Optimal);
                                        using var entryStream = zipEntry.Open();
                                        await blobStream.CopyToAsync(entryStream);
                                        addedFiles++;

                                        if(addedFiles % 100 == 0)
                                        {
                                            log.LogInformation($"Added {addedFiles} new JSON files to Zip archive so far");
                                        }
                                    }
                                    catch (Exception ex)
                                    {
                                        log.LogWarning(ex, $"Failed to add new blob to archive: {blobPath}");
                                        failedFiles++;
                                    }
                                }

                                log.LogInformation($"Incremental update completed. Added: {addedFiles}, Failed: {failedFiles}. New total expected: {existingCount + addedFiles}");
                            }

                            // If no new files, skip upload and return metadata of existing archive
                            if (addedFiles == 0)
                            {
                                var existingArchiveSize = FormatBytes(workingStream.Length);
                                log.LogInformation($"No new files to add. Skipping upload. Returning latest archive {latestZip} unchanged.");
                                return new ZipCreationResult
                                {
                                    Success = true,
                                    ArchiveFileName = latestZip,
                                    FilesIncluded = existingCount,
                                    ArchiveSize = existingArchiveSize,
                                    CreatedAt = DateTime.UtcNow
                                };
                            }

                            // Generate archive filename with timestamp
                            var timestampInc = DateTime.UtcNow.ToString("yyyy-MM-dd-HHmmss");
                            var archiveFileNameInc = $"game-logs-archive-{timestampInc}.zip";

                            // Upload updated ZIP to blob storage
                            workingStream.Position = 0;
                            log.LogInformation($"Uploading incrementally updated ZIP archive: {archiveFileNameInc}");
                            var archivePathInc = await blobService.UploadZipArchiveAsync(workingStream, archiveFileNameInc);

                            // Calculate archive size
                            var archiveSizeInc = FormatBytes(workingStream.Length);

                            log.LogInformation($"Incrementally updated ZIP uploaded successfully: {archivePathInc}, Size: {archiveSizeInc}");

                            return new ZipCreationResult
                            {
                                Success = true,
                                ArchiveFileName = archiveFileNameInc,
                                FilesIncluded = existingCount + addedFiles,
                                ArchiveSize = archiveSizeInc,
                                CreatedAt = DateTime.UtcNow
                            };
                        }
                    }
                    catch (Exception incEx)
                    {
                        // Log and fall back to full rebuild
                        log.LogWarning(incEx, "Incremental ZIP update failed, falling back to full rebuild.");
                    }
                }

                // Full rebuild: Create ZIP archive in memory with all blobs
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

                    log.LogInformation($"ZIP archive full rebuild completed. Processed: {processedFiles}, Failed: {failedFiles}");
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

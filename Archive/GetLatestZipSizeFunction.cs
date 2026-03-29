using System;
using System.Threading.Tasks;
using BgaTmScraperRegistry.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.Extensions.Logging;

namespace BgaTmScraperRegistry
{
    public static class GetLatestZipSizeFunction
    {
        [FunctionName("GetLatestZipSize")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetLatestZipSize HTTP trigger function processed a request.");

            try
            {
                // Get connection string from environment variables
                var blobConnectionString = Environment.GetEnvironmentVariable("BlobStorageConnectionString");

                if (string.IsNullOrEmpty(blobConnectionString))
                {
                    log.LogError("BlobStorageConnectionString environment variable is not set");
                    return new BadRequestObjectResult(new
                    {
                        success = false,
                        error = "BlobStorageConnectionString environment variable is not set"
                    });
                }

                // Initialize blob service
                var blobService = new BlobStorageService(blobConnectionString, log);

                // Find the latest ZIP archive
                log.LogInformation("Finding latest ZIP archive");
                var latestZipFileName = await blobService.GetLatestZipArchiveAsync();

                if (string.IsNullOrEmpty(latestZipFileName))
                {
                    log.LogWarning("No ZIP archives found");
                    return new NotFoundObjectResult(new
                    {
                        success = false,
                        error = "No ZIP archives found"
                    });
                }

                log.LogInformation($"Latest ZIP archive: {latestZipFileName}");

                // Get the size of the ZIP file
                var sizeInBytes = await blobService.GetZipArchiveSizeAsync(latestZipFileName);

                // Format the size for human readability
                var sizeFormatted = FormatFileSize(sizeInBytes);

                log.LogInformation($"Successfully retrieved size of ZIP archive: {latestZipFileName} ({sizeInBytes} bytes)");

                return new OkObjectResult(new
                {
                    success = true,
                    fileName = latestZipFileName,
                    sizeInBytes = sizeInBytes,
                    sizeFormatted = sizeFormatted
                });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting latest ZIP archive size");
                return new StatusCodeResult(500);
            }
        }

        private static string FormatFileSize(long bytes)
        {
            string[] suffixes = { "B", "KB", "MB", "GB", "TB" };
            int counter = 0;
            decimal number = bytes;
            while (Math.Round(number / 1024) >= 1)
            {
                number = number / 1024;
                counter++;
            }
            return string.Format("{0:n1} {1}", number, suffixes[counter]);
        }
    }
}

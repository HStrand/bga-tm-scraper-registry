using System;
using System.IO;
using System.Threading.Tasks;
using BgaTmScraperRegistry.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.Extensions.Logging;

namespace BgaTmScraperRegistry
{
    public static class DownloadLatestZipFunction
    {
        [FunctionName("DownloadLatestZip")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("DownloadLatestZip HTTP trigger function processed a request.");

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

                // Download the ZIP file as stream
                var zipStream = await blobService.DownloadZipArchiveAsStreamAsync(latestZipFileName);

                // Set response headers for file download
                var response = new FileStreamResult(zipStream, "application/zip")
                {
                    FileDownloadName = latestZipFileName
                };

                log.LogInformation($"Successfully initiated download of ZIP archive: {latestZipFileName}");

                return response;
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while downloading latest ZIP archive");
                return new StatusCodeResult(500);
            }
        }
    }
}

using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetGameLog
    {
        [FunctionName("GetGameLog")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "game-log/{playerId}/{tableId}")] HttpRequest req,
            string playerId,
            string tableId,
            ILogger log)
        {
            try
            {
                var connectionString = Environment.GetEnvironmentVariable("AzureWebJobsStorage");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("AzureWebJobsStorage environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var blobService = new BlobStorageService(connectionString, log);

                var exists = await blobService.BlobExistsAsync(playerId, tableId);
                if (!exists)
                {
                    return new NotFoundResult();
                }

                var json = await blobService.GetBlobContentAsync(playerId, tableId);
                return new ContentResult
                {
                    Content = json,
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error getting game log for player {playerId}, table {tableId}", playerId, tableId);
                return new StatusCodeResult(500);
            }
        }
    }
}

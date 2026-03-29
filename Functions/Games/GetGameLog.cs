using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetGameLog
    {
        [FunctionName("GetGameLog")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "game-log/{tableId}")] HttpRequest req,
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

                var sqlConnectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(sqlConnectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                // Look up the player perspective for this table
                string playerId;
                using (var conn = new SqlConnection(sqlConnectionString))
                {
                    await conn.OpenAsync();
                    using var cmd = new SqlCommand(
                        "SELECT TOP 1 PlayerPerspective FROM Games WHERE TableId = @tableId ORDER BY ScraperVersion DESC",
                        conn);
                    cmd.Parameters.AddWithValue("@tableId", tableId);
                    var result = await cmd.ExecuteScalarAsync();
                    if (result == null || result == DBNull.Value)
                    {
                        return new NotFoundResult();
                    }
                    playerId = result.ToString();
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
                log.LogError(ex, "Error getting game log for table {tableId}", tableId);
                return new StatusCodeResult(500);
            }
        }
    }
}

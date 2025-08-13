using System;
using System.IO;
using System.Threading.Tasks;
using BgaTmScraperRegistry.Models;
using BgaTmScraperRegistry.Services;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Azure.Storage.Blobs;

namespace BgaTmScraperRegistry
{
    public static class UpsertGameStatsBlobTrigger
    {
        // Triggers on any blob created/updated in the "games" container (including subfolders).
        // Uses the same logic as UpsertGameStatsFunction: parse GameLogData JSON and upsert stats.
        // Connection points at the same storage account used elsewhere in this project.
        [FunctionName("UpsertGameStatsOnBlobUpload")]
        public static async Task Run(
            [BlobTrigger("games/{name}", Connection = "BlobStorageConnectionString")] Stream blobStream,
            string name,
            ILogger log)
        {
            log.LogInformation($"UpsertGameStatsOnBlobUpload triggered for blob: {name}");

            // Only process JSON files
            if (!name.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            {
                log.LogInformation($"Skipping non-JSON blob: {name}");
                return;
            }

            try
            {
                var sqlConnectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrWhiteSpace(sqlConnectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return;
                }


                var cutoff = DateTime.UtcNow.AddMinutes(-10);
                var blobConnectionString = Environment.GetEnvironmentVariable("BlobStorageConnectionString");
                
                try
                {
                    var blobServiceClient = new BlobServiceClient(blobConnectionString);
                    var containerClient = blobServiceClient.GetBlobContainerClient("games");
                    var blobClient = containerClient.GetBlobClient(name);
                    var props = await blobClient.GetPropertiesAsync();
                    if (props.Value.LastModified.DateTime < cutoff)
                    {
                        log.LogInformation($"Skipping blob {name} LastModified={props.Value.LastModified.UtcDateTime:o} older than cutover {cutoff:o}");
                        return;
                    }
                }
                catch (Exception ex)
                {
                    // If property fetch fails, log and continue rather than failing the function.
                    log.LogWarning(ex, $"Failed to fetch blob properties for {name} to enforce cutoff. Proceeding.");
                }
                

                string content;
                using (var reader = new StreamReader(blobStream))
                {
                    content = await reader.ReadToEndAsync();
                }

                if (string.IsNullOrWhiteSpace(content))
                {
                    log.LogWarning($"Blob content is empty for: {name}. Skipping.");
                    return;
                }

                GameLogData gameLogData;
                try
                {
                    gameLogData = JsonConvert.DeserializeObject<GameLogData>(content);
                }
                catch (JsonException ex)
                {
                    log.LogError(ex, $"Failed to deserialize JSON content for blob: {name}");
                    return;
                }

                if (gameLogData == null)
                {
                    log.LogError($"Deserialized GameLogData is null for blob: {name}");
                    return;
                }

                if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                {
                    log.LogError($"Validation failed for blob {name}: replay_id must be a valid integer");
                    return;
                }

                var service = new GameStatsService(sqlConnectionString, log);
                await service.UpsertGameStatsAsync(gameLogData);

                log.LogInformation($"Game stats upsert completed for TableId {tableId} from blob {name}");
            }
            catch (Exception ex)
            {
                log.LogError(ex, $"Error occurred while processing blob {name}");
                // Rethrow to allow built-in retry policies to apply
                throw;
            }
        }
    }
}

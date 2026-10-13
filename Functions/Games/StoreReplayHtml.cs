using System;
using System.Collections.Generic;
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
    /// <summary>
    /// POST replay-html?tableId=&amp;playerPerspective=&amp;version=&amp;scrapedBy=
    ///
    /// Stores the raw BGA replay page the scraper parsed, so a parser fix can be applied to a
    /// stored game without another replay view. The body is the page as text, either gzipped
    /// (Content-Encoding: gzip, or gzip magic bytes) or plain; it is kept gzipped as one blob
    /// per table in the "replays" container (a replay page carries every player's packets,
    /// whichever perspective loaded it). Additive to StoreGameLog: old clients never call it,
    /// and callers treat a failure here as a warning, never as a failed scrape.
    /// </summary>
    public static class StoreReplayHtml
    {
        private const long MaxBodyBytes = 20L * 1024 * 1024;
        private const int MinRawBytes = 10 * 1024; // the scraper's own sanity threshold for a replay page

        [FunctionName(nameof(StoreReplayHtml))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = "replay-html")] HttpRequest req,
            ILogger log)
        {
            string version = req.Query["version"];
            string scrapedBy = req.Query["scrapedBy"];

            if (!int.TryParse(req.Query["tableId"], out int tableId) || tableId <= 0)
                return new BadRequestObjectResult(new { error = "tableId must be a positive integer" });
            if (!int.TryParse(req.Query["playerPerspective"], out int playerPerspective) || playerPerspective <= 0)
                return new BadRequestObjectResult(new { error = "playerPerspective must be a positive integer" });

            try
            {
                var sqlConnectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                var blobConnectionString = Environment.GetEnvironmentVariable("BlobStorageConnectionString");
                if (string.IsNullOrEmpty(sqlConnectionString) || string.IsNullOrEmpty(blobConnectionString))
                {
                    log.LogError("SqlConnectionString or BlobStorageConnectionString is not set");
                    return new StatusCodeResult(500);
                }

                if (req.ContentLength.HasValue && req.ContentLength.Value > MaxBodyBytes)
                    return new BadRequestObjectResult(new { error = $"Body exceeds {MaxBodyBytes} bytes" });

                byte[] body;
                using (var ms = new MemoryStream())
                {
                    await req.Body.CopyToAsync(ms);
                    body = ms.ToArray();
                }
                if (body.Length == 0)
                    return new BadRequestObjectResult(new { error = "Request body is empty" });
                if (body.Length > MaxBodyBytes)
                    return new BadRequestObjectResult(new { error = $"Body exceeds {MaxBodyBytes} bytes" });

                bool isGzip = body.Length > 2 && body[0] == 0x1f && body[1] == 0x8b;
                string encodingHeader = req.Headers["Content-Encoding"];
                if (!isGzip && string.Equals(encodingHeader, "gzip", StringComparison.OrdinalIgnoreCase))
                    return new BadRequestObjectResult(new { error = "Content-Encoding is gzip but the body is not gzip data" });

                byte[] stored;
                long rawLength;
                if (isGzip)
                {
                    stored = body;
                    rawLength = GzipRawLength(body);
                }
                else
                {
                    rawLength = body.Length;
                    using var ms = new MemoryStream();
                    using (var gz = new GZipStream(ms, CompressionLevel.Optimal, leaveOpen: true))
                    {
                        await gz.WriteAsync(body, 0, body.Length);
                    }
                    stored = ms.ToArray();
                }
                if (rawLength < MinRawBytes)
                    return new BadRequestObjectResult(new { error = $"Replay page is too small to be a replay ({rawLength} bytes)" });

                var gameService = new GameDatabaseService(sqlConnectionString, log);
                if (!await gameService.GameExistsAsync(tableId, playerPerspective))
                {
                    log.LogWarning($"StoreReplayHtml: game {tableId}/{playerPerspective} is not registered");
                    return new NotFoundObjectResult(new { error = "Game has not been indexed in the registry", tableId, playerPerspective });
                }

                var metadata = new Dictionary<string, string>
                {
                    ["playerPerspective"] = playerPerspective.ToString(),
                    ["uploadedAt"] = DateTime.UtcNow.ToString("o"),
                    ["rawLength"] = rawLength.ToString(),
                };
                if (!string.IsNullOrWhiteSpace(version))
                    metadata["scraperVersion"] = version;

                var blobService = new BlobStorageService(blobConnectionString, log);
                var blobPath = await blobService.UploadReplayHtmlAsync(tableId, stored, metadata);

                log.LogInformation($"Stored replay page for table {tableId} (perspective {playerPerspective}, {rawLength} raw bytes, {stored.Length} stored) at {blobPath}");
                return new OkObjectResult(new { blobPath, tableId, playerPerspective, rawLength, storedBytes = stored.Length });
            }
            catch (Exception ex)
            {
                log.LogError(ex, $"Error storing replay page for table {tableId}");
                return new StatusCodeResult(500);
            }
        }

        // The last four bytes of a gzip member hold the uncompressed size modulo 2^32; a replay
        // page is far below that, so this is exact for our purposes.
        private static long GzipRawLength(byte[] gzip)
        {
            if (gzip.Length < 4) return 0;
            return BitConverter.ToUInt32(gzip, gzip.Length - 4);
        }
    }
}

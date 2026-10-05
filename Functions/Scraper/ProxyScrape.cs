using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace BgaTmScraperRegistry.Functions
{
    public static class ProxyScrape
    {
        private static readonly HttpClient _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(300)
        };

        [FunctionName("ProxyScrape")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "scrape")] HttpRequest req,
            ILogger log)
        {
            var scrapeUrl = Environment.GetEnvironmentVariable("ScrapeServiceUrl") ?? "http://20.82.3.63:8000";

            try
            {
                string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
                requestBody = await WithRegisteredPerspectiveAsync(requestBody, log);

                var response = await _httpClient.PostAsync(
                    $"{scrapeUrl}/scrape",
                    new StringContent(requestBody, Encoding.UTF8, "application/json"));

                var responseBody = await response.Content.ReadAsStringAsync();

                return new ContentResult
                {
                    Content = responseBody,
                    ContentType = "application/json",
                    StatusCode = (int)response.StatusCode
                };
            }
            catch (TaskCanceledException)
            {
                log.LogError("Scrape request timed out");
                return new ContentResult
                {
                    Content = "{\"detail\":\"Scrape request timed out\"}",
                    ContentType = "application/json",
                    StatusCode = 504
                };
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error proxying scrape request");
                return new StatusCodeResult(502);
            }
        }

        /// <summary>
        /// A request that names no player gets the perspective the table is already registered under,
        /// so that scraping it does not add a second entry for the same table. A table that is not
        /// registered is passed on as it came, and the scrape service picks the highest-rated player.
        /// </summary>
        private static async Task<string> WithRegisteredPerspectiveAsync(string requestBody, ILogger log)
        {
            JObject request;
            try
            {
                request = JObject.Parse(requestBody);
            }
            catch (JsonException)
            {
                return requestBody;
            }

            var given = request["playerPerspective"];
            if (given != null && given.Type != JTokenType.Null && !string.IsNullOrWhiteSpace(given.ToString()))
            {
                return requestBody;
            }

            if (!int.TryParse(request["tableId"]?.ToString(), out int tableId))
            {
                return requestBody;
            }

            try
            {
                var sqlConnectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                using var conn = new SqlConnection(sqlConnectionString);
                await conn.OpenAsync();
                // The same choice GetGameLog makes when it serves the table's log.
                using var cmd = new SqlCommand(
                    "SELECT TOP 1 PlayerPerspective FROM Games WHERE TableId = @tableId ORDER BY ScraperVersion DESC",
                    conn);
                cmd.Parameters.AddWithValue("@tableId", tableId);
                var result = await cmd.ExecuteScalarAsync();
                if (result == null || result == DBNull.Value)
                {
                    return requestBody;
                }

                request["playerPerspective"] = result.ToString();
                return request.ToString(Formatting.None);
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, "Could not look up the registered perspective for table {tableId}", tableId);
                return requestBody;
            }
        }
    }
}

using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

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
    }
}

using System;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace BgaTmScraperRegistry.Functions
{
    public static class ProxyScrapeHealth
    {
        private static readonly HttpClient _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(10)
        };

        [FunctionName("ProxyScrapeHealth")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "scrape-health")] HttpRequest req,
            ILogger log)
        {
            var scrapeUrl = Environment.GetEnvironmentVariable("ScrapeServiceUrl") ?? "http://20.82.3.63:8000";

            try
            {
                var response = await _httpClient.GetAsync($"{scrapeUrl}/health");
                var responseBody = await response.Content.ReadAsStringAsync();

                return new ContentResult
                {
                    Content = responseBody,
                    ContentType = "application/json",
                    StatusCode = (int)response.StatusCode
                };
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error proxying scrape health check");
                return new StatusCodeResult(502);
            }
        }
    }
}

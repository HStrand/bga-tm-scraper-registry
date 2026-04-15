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
    public static class ProxyCorporationRankings
    {
        private static readonly HttpClient _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(60)
        };

        [FunctionName("ProxyCorporationRankings")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "corporations/rankings-vm")] HttpRequest req,
            ILogger log)
        {
            var baseUrl = Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "https://api.tfmstats.com";
            var target = $"{baseUrl.TrimEnd('/')}/api/corporations/rankings{req.QueryString.Value}";

            try
            {
                var response = await _httpClient.GetAsync(target);
                var body = await response.Content.ReadAsStringAsync();

                return new ContentResult
                {
                    Content = body,
                    ContentType = "application/json",
                    StatusCode = (int)response.StatusCode
                };
            }
            catch (TaskCanceledException)
            {
                log.LogError("Corporation rankings proxy request timed out ({Target})", target);
                return new ContentResult
                {
                    Content = "{\"detail\":\"Upstream timed out\"}",
                    ContentType = "application/json",
                    StatusCode = 504
                };
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error proxying corporation rankings request to {Target}", target);
                return new StatusCodeResult(502);
            }
        }
    }
}

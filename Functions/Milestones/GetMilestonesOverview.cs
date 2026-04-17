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
    public static class GetMilestonesOverview
    {
        private static readonly HttpClient _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(60)
        };

        [FunctionName(nameof(GetMilestonesOverview))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "milestones/overview")] HttpRequest req,
            ILogger log)
        {
            var baseUrl = Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "https://api.tfmstats.com";
            var target = $"{baseUrl.TrimEnd('/')}/api/milestones/overview{req.QueryString.Value}";
            return await MilestoneProxyHelpers.ProxyGet(_httpClient, target, "milestones overview", log);
        }
    }

    internal static class MilestoneProxyHelpers
    {
        public static async Task<IActionResult> ProxyGet(HttpClient client, string target, string label, ILogger log)
        {
            try
            {
                var response = await client.GetAsync(target);
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
                log.LogError("{Label} proxy request timed out ({Target})", label, target);
                return new ContentResult
                {
                    Content = "{\"detail\":\"Upstream timed out\"}",
                    ContentType = "application/json",
                    StatusCode = 504
                };
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error proxying {Label} request to {Target}", label, target);
                return new StatusCodeResult(502);
            }
        }
    }
}

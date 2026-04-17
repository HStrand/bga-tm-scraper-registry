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
    public static class GetTilePlacementStats
    {
        private static readonly HttpClient _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(60)
        };

        [FunctionName("GetCityPlacementOverview")]
        public static Task<IActionResult> CityOverview(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tile-stats/city/overview")] HttpRequest req,
            ILogger log)
            => ProxyTileStats(req, "city", "overview", log);

        [FunctionName("GetCityPlacementByGen")]
        public static Task<IActionResult> CityByGen(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tile-stats/city/by-gen")] HttpRequest req,
            ILogger log)
            => ProxyTileStats(req, "city", "by-gen", log);

        [FunctionName("GetGreeneryPlacementOverview")]
        public static Task<IActionResult> GreeneryOverview(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tile-stats/greenery/overview")] HttpRequest req,
            ILogger log)
            => ProxyTileStats(req, "greenery", "overview", log);

        [FunctionName("GetGreeneryPlacementByGen")]
        public static Task<IActionResult> GreeneryByGen(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tile-stats/greenery/by-gen")] HttpRequest req,
            ILogger log)
            => ProxyTileStats(req, "greenery", "by-gen", log);

        private static async Task<IActionResult> ProxyTileStats(HttpRequest req, string tileType, string kind, ILogger log)
        {
            var baseUrl = Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "https://api.tfmstats.com";
            var target = $"{baseUrl.TrimEnd('/')}/api/tile-stats/{tileType}/{kind}{req.QueryString.Value}";

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
                log.LogError("Tile placement proxy request timed out ({Target})", target);
                return new ContentResult
                {
                    Content = "{\"detail\":\"Upstream timed out\"}",
                    ContentType = "application/json",
                    StatusCode = 504
                };
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error proxying tile placement request to {Target}", target);
                return new StatusCodeResult(502);
            }
        }
    }
}

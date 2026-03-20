using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;
using static BgaTmScraperRegistry.Services.TilePlacementService;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetTilePlacementStats
    {
        [FunctionName("GetCityPlacementOverview")]
        public static Task<IActionResult> CityOverview(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tile-stats/city/overview")] HttpRequest req,
            ILogger log)
            => RunOverview(TileType.City, log);

        [FunctionName("GetCityPlacementByGen")]
        public static Task<IActionResult> CityByGen(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tile-stats/city/by-gen")] HttpRequest req,
            ILogger log)
            => RunByGen(TileType.City, log);

        [FunctionName("GetGreeneryPlacementOverview")]
        public static Task<IActionResult> GreeneryOverview(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tile-stats/greenery/overview")] HttpRequest req,
            ILogger log)
            => RunOverview(TileType.Greenery, log);

        [FunctionName("GetGreeneryPlacementByGen")]
        public static Task<IActionResult> GreeneryByGen(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tile-stats/greenery/by-gen")] HttpRequest req,
            ILogger log)
            => RunByGen(TileType.Greenery, log);

        private static async Task<IActionResult> RunOverview(TileType tileType, ILogger log)
        {
            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new TilePlacementService(connectionString, log);
                var results = await service.GetAllOverviewsAsync(tileType);
                return new OkObjectResult(results);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error getting {tileType} placement overview", tileType);
                return new StatusCodeResult(500);
            }
        }

        private static async Task<IActionResult> RunByGen(TileType tileType, ILogger log)
        {
            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new TilePlacementService(connectionString, log);
                var results = await service.GetAllByGenAsync(tileType);
                return new OkObjectResult(results);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error getting {tileType} placement by-gen stats", tileType);
                return new StatusCodeResult(500);
            }
        }
    }
}

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
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "maps/{mapName}/city-stats")] HttpRequest req,
            string mapName, ILogger log)
            => RunOverview(mapName, TileType.City, log);

        [FunctionName("GetCityPlacementByGen")]
        public static Task<IActionResult> CityByGen(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "maps/{mapName}/city-stats/by-gen")] HttpRequest req,
            string mapName, ILogger log)
            => RunByGen(mapName, TileType.City, log);

        [FunctionName("GetGreeneryPlacementOverview")]
        public static Task<IActionResult> GreeneryOverview(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "maps/{mapName}/greenery-stats")] HttpRequest req,
            string mapName, ILogger log)
            => RunOverview(mapName, TileType.Greenery, log);

        [FunctionName("GetGreeneryPlacementByGen")]
        public static Task<IActionResult> GreeneryByGen(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "maps/{mapName}/greenery-stats/by-gen")] HttpRequest req,
            string mapName, ILogger log)
            => RunByGen(mapName, TileType.Greenery, log);

        private static async Task<IActionResult> RunOverview(string mapName, TileType tileType, ILogger log)
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
                var results = await service.GetOverviewAsync(mapName, tileType);
                return new OkObjectResult(results);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error getting {tileType} placement overview for map {mapName}", tileType, mapName);
                return new StatusCodeResult(500);
            }
        }

        private static async Task<IActionResult> RunByGen(string mapName, TileType tileType, ILogger log)
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
                var results = await service.GetByGenAsync(mapName, tileType);
                return new OkObjectResult(results);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error getting {tileType} placement by-gen stats for map {mapName}", tileType, mapName);
                return new StatusCodeResult(500);
            }
        }
    }
}

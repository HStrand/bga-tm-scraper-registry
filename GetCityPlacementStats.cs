using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetCityPlacementStats
    {
        [FunctionName("GetCityPlacementOverview")]
        public static async Task<IActionResult> Overview(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "maps/{mapName}/city-stats")] HttpRequest req,
            string mapName,
            ILogger log)
        {
            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new CityPlacementService(connectionString, log);
                var results = await service.GetOverviewAsync(mapName);
                return new OkObjectResult(results);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error getting city placement overview for map {mapName}", mapName);
                return new StatusCodeResult(500);
            }
        }

        [FunctionName("GetCityPlacementByGen")]
        public static async Task<IActionResult> ByGen(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "maps/{mapName}/city-stats/by-gen")] HttpRequest req,
            string mapName,
            ILogger log)
        {
            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new CityPlacementService(connectionString, log);
                var results = await service.GetByGenAsync(mapName);
                return new OkObjectResult(results);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error getting city placement by-gen stats for map {mapName}", mapName);
                return new StatusCodeResult(500);
            }
        }
    }
}

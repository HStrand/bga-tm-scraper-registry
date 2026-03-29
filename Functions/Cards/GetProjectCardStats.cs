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
    public static class GetProjectCardStats
    {
        [FunctionName(nameof(GetProjectCardStats))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "cards/{cardName}/playerstats")] HttpRequest req,
            string cardName,
            ILogger log)
        {
            log.LogInformation($"GetProjectCardStats function processed a request for card: {cardName}");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                if (string.IsNullOrWhiteSpace(cardName))
                {
                    log.LogWarning("Card name parameter is null or empty");
                    return new BadRequestObjectResult("Card name parameter is required");
                }

                var service = new ProjectCardStatsService(connectionString, log);
                var list = await service.GetCardPlayerStatsAsync(cardName);

                log.LogInformation($"Retrieved {list.Count} player stats records for card: {cardName}");

                return new OkObjectResult(list);
            }
            catch (Exception ex)
            {
                log.LogError(ex, $"Error occurred while getting project card player stats for card: {cardName}");
                return new StatusCodeResult(500);
            }
        }
    }
}

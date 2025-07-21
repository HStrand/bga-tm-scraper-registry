using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry
{
    public static class GetStatistics
    {
        [FunctionName(nameof(GetStatistics))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetStatistics function processed a request.");

            try
            {
                // Get email from query parameter
                string email = req.Query["email"];
                
                if (string.IsNullOrEmpty(email))
                {
                    log.LogError("Email parameter is required");
                    return new BadRequestObjectResult(new { message = "Email parameter is required" });
                }

                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var gameService = new GameDatabaseService(connectionString, log);

                // Get statistics
                var statistics = await gameService.GetStatisticsAsync(email);

                log.LogInformation($"Statistics requested by {email}: {statistics.TotalIndexedGames} total indexed games, {statistics.ScrapedGamesTotal} scraped games, {statistics.ScrapedGamesByUser} scraped by user");
                
                return new OkObjectResult(statistics);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting statistics");
                return new StatusCodeResult(500);
            }
        }
    }
}

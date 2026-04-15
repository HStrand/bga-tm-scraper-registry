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
    public static class GetProjectCardGames
    {
        [FunctionName(nameof(GetProjectCardGames))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "cards/{cardName}/games")] HttpRequest req,
            string cardName,
            ILogger log)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(cardName))
                    return new BadRequestObjectResult("Card name parameter is required");

                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                int.TryParse(req.Query["page"], out var page);
                int.TryParse(req.Query["pageSize"], out var pageSize);
                var sort = req.Query["sort"].ToString();
                var sortDir = req.Query["sortDir"].ToString();

                var service = new ProjectCardStatsService(connectionString, log);
                var games = await service.GetCardGamesAsync(
                    cardName,
                    CardFilterParser.Parse(req),
                    page,
                    pageSize,
                    sort,
                    sortDir);
                return new OkObjectResult(games);
            }
            catch (Exception ex)
            {
                log.LogError(ex, $"Error occurred while getting project card games for card: {cardName}");
                return new StatusCodeResult(500);
            }
        }
    }
}

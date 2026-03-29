using System;
using System.Linq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetPlayerNameSuggestions
    {
        [FunctionName(nameof(GetPlayerNameSuggestions))]
        public static async System.Threading.Tasks.Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "players/search")] HttpRequest req,
            ILogger log)
        {
            try
            {
                var q = (req.Query["q"].FirstOrDefault() ?? string.Empty).Trim();
                if (q.Length < 2)
                {
                    return new OkObjectResult(Array.Empty<string>());
                }

                var limitStr = req.Query["limit"].FirstOrDefault();
                int limit = 10;
                if (!string.IsNullOrWhiteSpace(limitStr) && int.TryParse(limitStr, out var parsed))
                {
                    limit = Math.Clamp(parsed, 1, 25);
                }

                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new CorporationStatsService(connectionString, log);
                var names = await service.GetPlayerNameSuggestionsAsync(q, limit);

                return new OkObjectResult(names);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting player name suggestions");
                return new StatusCodeResult(500);
            }
        }
    }
}

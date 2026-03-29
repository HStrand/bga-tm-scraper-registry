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
    public static class GetAllAwardRows
    {
        [FunctionName(nameof(GetAllAwardRows))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "awards/rows")] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("GetAllAwardRows function processed a request");

            try
            {
                var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(connectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                var service = new AwardStatsService(connectionString, log);
                var rows = await service.GetAllAwardRowsAsync();

                log.LogInformation($"Returning {rows.Count} award rows");
                return new OkObjectResult(rows);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting all award rows");
                return new StatusCodeResult(500);
            }
        }
    }
}

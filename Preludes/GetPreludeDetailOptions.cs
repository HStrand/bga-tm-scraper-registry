using System;
using System.Linq;
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BgaTmScraperRegistry.Services;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetPreludeDetailOptions
    {
        public class PreludeDetailOptionsDto
        {
            public string[] Maps { get; set; }
            public string[] GameModes { get; set; }
            public string[] GameSpeeds { get; set; }
            public int[] PlayerCounts { get; set; }
            public string[] Corporations { get; set; }
            public RangeDto EloRange { get; set; }

            public class RangeDto
            {
                public int Min { get; set; }
                public int Max { get; set; }
            }
        }

        [FunctionName(nameof(GetPreludeDetailOptions))]
        public static async System.Threading.Tasks.Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "preludes/{cardName}/options")] HttpRequest req,
            string cardName,
            ILogger log)
        {
            cardName = cardName?.Replace("_", " ");
            log.LogInformation("GetPreludeDetailOptions for {prelude}", cardName);

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
                    return new BadRequestObjectResult("Prelude parameter is required");
                }

                var service = new PreludeStatsService(connectionString, log);
                var rows = await service.GetAllPreludePlayerRowsAsync();
                var filtered = rows.Where(r => string.Equals(r.Prelude, cardName, StringComparison.OrdinalIgnoreCase)).ToList();

                var maps = filtered.Where(r => !string.IsNullOrWhiteSpace(r.Map))
                                   .Select(r => r.Map)
                                   .Distinct()
                                   .OrderBy(x => x)
                                   .ToArray();

                var modes = filtered.Where(r => !string.IsNullOrWhiteSpace(r.GameMode))
                                    .Select(r => r.GameMode)
                                    .Distinct()
                                    .OrderBy(x => x)
                                    .ToArray();

                var speeds = filtered.Where(r => !string.IsNullOrWhiteSpace(r.GameSpeed))
                                     .Select(r => r.GameSpeed)
                                     .Distinct()
                                     .OrderBy(x => x)
                                     .ToArray();

                var playerCounts = filtered.Where(r => r.PlayerCount.HasValue)
                                           .Select(r => r.PlayerCount!.Value)
                                           .Distinct()
                                           .OrderBy(x => x)
                                           .ToArray();

                var corporations = filtered.Where(r => !string.IsNullOrWhiteSpace(r.Corporation))
                                           .Select(r => r.Corporation)
                                           .Distinct(StringComparer.OrdinalIgnoreCase)
                                           .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
                                           .ToArray();

                var eloVals = filtered.Where(r => r.Elo.HasValue && r.Elo.Value > 0)
                                      .Select(r => r.Elo!.Value)
                                      .ToArray();

                var dto = new PreludeDetailOptionsDto
                {
                    Maps = maps,
                    GameModes = modes,
                    GameSpeeds = speeds,
                    PlayerCounts = playerCounts,
                    Corporations = corporations,
                    EloRange = new PreludeDetailOptionsDto.RangeDto
                    {
                        Min = eloVals.Length > 0 ? eloVals.Min() : 0,
                        Max = eloVals.Length > 0 ? eloVals.Max() : 0
                    }
                };

                return new OkObjectResult(dto);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while getting prelude detail options for {prelude}", cardName);
                return new StatusCodeResult(500);
            }
        }
    }
}

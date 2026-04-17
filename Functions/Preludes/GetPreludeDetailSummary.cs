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
    public static class GetPreludeDetailSummary
    {
        private static readonly HttpClient _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(60)
        };

        [FunctionName(nameof(GetPreludeDetailSummary))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "preludes/{cardName}/summary")] HttpRequest req,
            string cardName,
            ILogger log)
        {
            if (string.IsNullOrWhiteSpace(cardName))
            {
                return new BadRequestObjectResult("Prelude parameter is required");
            }

            var baseUrl = Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "https://api.tfmstats.com";
            var target = $"{baseUrl.TrimEnd('/')}/api/preludes/{Uri.EscapeDataString(cardName)}/summary{req.QueryString.Value}";
            return await PreludeProxyHelpers.ProxyGet(_httpClient, target, "prelude detail summary", log);
        }
    }
}

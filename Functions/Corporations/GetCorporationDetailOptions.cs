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
    public static class GetCorporationDetailOptions
    {
        private static readonly HttpClient _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(60)
        };

        [FunctionName(nameof(GetCorporationDetailOptions))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "corporations/{corporation}/options")] HttpRequest req,
            string corporation,
            ILogger log)
        {
            if (string.IsNullOrWhiteSpace(corporation))
            {
                return new BadRequestObjectResult("Corporation parameter is required");
            }

            var baseUrl = Environment.GetEnvironmentVariable("ParquetApiUrl") ?? "https://api.tfmstats.com";
            var target = $"{baseUrl.TrimEnd('/')}/api/corporations/{Uri.EscapeDataString(corporation)}/options{req.QueryString.Value}";
            return await CorporationProxyHelpers.ProxyGet(_httpClient, target, "corporation detail options", log);
        }
    }
}

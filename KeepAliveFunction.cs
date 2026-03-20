using System;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;

namespace BgaTmScraperRegistry
{
    public static class KeepAliveFunction
    {
        [FunctionName(nameof(KeepAliveFunction))]
        public static void Run(
            [TimerTrigger("*/90 * * * * *")] TimerInfo timer,
            ILogger log)
        {
            log.LogInformation("KeepAlive triggered at: {time}", DateTime.UtcNow);
        }
    }
}

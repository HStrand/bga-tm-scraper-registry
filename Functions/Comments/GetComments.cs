using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;
using Dapper;
using BgaTmScraperRegistry.Models;

namespace BgaTmScraperRegistry.Functions
{
    public static class GetComments
    {
        [FunctionName("GetComments")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "comments/{tableId}")] HttpRequest req,
            string tableId,
            ILogger log)
        {
            try
            {
                var sqlConnectionString = Environment.GetEnvironmentVariable("SqlConnectionString");
                if (string.IsNullOrEmpty(sqlConnectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                using var connection = new SqlConnection(sqlConnectionString);
                var comments = await connection.QueryAsync<Comment>(
                    "SELECT Id, TableId, Username, Body, CreatedAt FROM GameComments WHERE TableId = @TableId ORDER BY CreatedAt ASC",
                    new { TableId = tableId });

                return new OkObjectResult(comments);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error getting comments for table {tableId}", tableId);
                return new StatusCodeResult(500);
            }
        }
    }
}

using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;
using Dapper;
using Newtonsoft.Json;
using BgaTmScraperRegistry.Models;

namespace BgaTmScraperRegistry.Functions
{
    public static class SubmitComment
    {
        [FunctionName("SubmitComment")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "comments")] HttpRequest req,
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

                string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
                if (string.IsNullOrWhiteSpace(requestBody))
                {
                    return new BadRequestObjectResult(new { error = "Request body is empty" });
                }

                Comment comment;
                try
                {
                    comment = JsonConvert.DeserializeObject<Comment>(requestBody);
                }
                catch (JsonException ex)
                {
                    log.LogError(ex, "Failed to deserialize comment JSON");
                    return new BadRequestObjectResult(new { error = "Invalid JSON format" });
                }

                if (comment == null || string.IsNullOrWhiteSpace(comment.Body))
                {
                    return new BadRequestObjectResult(new { error = "Comment body is required" });
                }

                if (string.IsNullOrWhiteSpace(comment.TableId))
                {
                    return new BadRequestObjectResult(new { error = "TableId is required" });
                }

                if (string.IsNullOrWhiteSpace(comment.Username))
                {
                    comment.Username = "Anonymous";
                }

                using var connection = new SqlConnection(sqlConnectionString);
                var inserted = await connection.QuerySingleAsync<Comment>(
                    @"INSERT INTO GameComments (TableId, Username, Body)
                      OUTPUT INSERTED.Id, INSERTED.TableId, INSERTED.Username, INSERTED.Body, INSERTED.CreatedAt
                      VALUES (@TableId, @Username, @Body)",
                    new { comment.TableId, comment.Username, comment.Body });

                log.LogInformation("Comment submitted for table {tableId} by {username}", comment.TableId, comment.Username);

                return new OkObjectResult(inserted);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error submitting comment");
                return new StatusCodeResult(500);
            }
        }
    }
}

using System;
using System.IO;
using System.Threading.Tasks;
using BgaTmScraperRegistry.Models;
using BgaTmScraperRegistry.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry
{
    public static class StoreUserMapping
    {
        [FunctionName(nameof(StoreUserMapping))]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Function, "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("StoreUserMapping processed a request.");

            try
            {
                // Get connection string from environment variables
                var sqlConnectionString = Environment.GetEnvironmentVariable("SqlConnectionString");

                if (string.IsNullOrEmpty(sqlConnectionString))
                {
                    log.LogError("SqlConnectionString environment variable is not set");
                    return new StatusCodeResult(500);
                }

                // Read and validate JSON content
                string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
                
                if (string.IsNullOrWhiteSpace(requestBody))
                {
                    return new BadRequestObjectResult(new
                    {
                        error = "Request body is empty",
                        details = new[] { "JSON content is required" }
                    });
                }

                // Deserialize and validate the user mapping data
                UserMapping userMapping;
                try
                {
                    userMapping = JsonConvert.DeserializeObject<UserMapping>(requestBody);
                }
                catch (JsonException ex)
                {
                    log.LogError(ex, "Failed to deserialize JSON content");
                    return new BadRequestObjectResult(new
                    {
                        error = "Invalid JSON format",
                        details = new[] { ex.Message }
                    });
                }

                // Validate the deserialized data
                if (userMapping == null)
                {
                    return new BadRequestObjectResult(new
                    {
                        error = "User mapping data is null",
                        details = new[] { "Valid user mapping data is required" }
                    });
                }

                if (string.IsNullOrWhiteSpace(userMapping.Username))
                {
                    return new BadRequestObjectResult(new
                    {
                        error = "Validation failed",
                        details = new[] { "username is required and cannot be empty" }
                    });
                }

                if (string.IsNullOrWhiteSpace(userMapping.DisplayName))
                {
                    return new BadRequestObjectResult(new
                    {
                        error = "Validation failed",
                        details = new[] { "displayName is required and cannot be empty" }
                    });
                }

                // Initialize service
                var userMappingService = new UserMappingDatabaseService(sqlConnectionString, log);

                // Save the user mapping to the database
                var saveSuccess = await userMappingService.SaveUserMappingAsync(userMapping);

                if (!saveSuccess)
                {
                    log.LogError($"Failed to save user mapping: {userMapping.Username} -> {userMapping.DisplayName}");
                    return new StatusCodeResult(500);
                }

                log.LogInformation($"Successfully stored user mapping: {userMapping.Username} -> {userMapping.DisplayName}");

                return new OkObjectResult(new
                {
                    message = "User mapping stored successfully",
                    username = userMapping.Username,
                    displayName = userMapping.DisplayName,
                    updatedAt = userMapping.UpdatedAt
                });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error occurred while storing user mapping");
                return new StatusCodeResult(500);
            }
        }
    }
}

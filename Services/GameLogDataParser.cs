using System;
using System.Collections.Generic;
using System.Linq;
using BgaTmScraperRegistry.Models;
using Newtonsoft.Json.Linq;

namespace BgaTmScraperRegistry.Services
{
    public class GameLogDataParser
    {
        public GameStats ParseGameStats(GameLogData gameLogData)
        {
            if (gameLogData == null)
                throw new ArgumentNullException(nameof(gameLogData));

            // Parse TableId from ReplayId - fail if this fails
            if (!int.TryParse(gameLogData.ReplayId, out int tableId))
            {
                throw new ArgumentException($"Cannot parse ReplayId '{gameLogData.ReplayId}' to integer", nameof(gameLogData));
            }

            // Parse duration - set to null if parsing fails
            int? durationMinutes = ParseDurationToMinutes(gameLogData.GameDuration);

            // Generations can be null
            int? generations = gameLogData.Generations;

            var gameStats = new GameStats
            {
                TableId = tableId,
                Generations = generations,
                DurationMinutes = durationMinutes,
                UpdatedAt = DateTime.UtcNow
            };

            return gameStats;
        }

        public List<GamePlayerStats> ParseGamePlayerStats(GameLogData gameLogData)
        {
            if (gameLogData == null)
                throw new ArgumentNullException(nameof(gameLogData));

            if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                throw new ArgumentException($"Cannot parse ReplayId '{gameLogData.ReplayId}' to integer", nameof(gameLogData));

            var allPlayerStats = new List<GamePlayerStats>();

            foreach (var playerEntry in gameLogData.Players)
            {
                if (!int.TryParse(playerEntry.Key, out int playerId))
                {
                    // Log or handle the error for the specific player, but continue with others
                    Console.WriteLine($"Could not parse player ID '{playerEntry.Key}' for table '{tableId}'. Skipping player.");
                    continue;
                }

                var playerLog = playerEntry.Value;
                var playerStats = new GamePlayerStats
                {
                    TableId = tableId,
                    PlayerId = playerId,
                    Corporation = playerLog.Corporation,
                    FinalScore = playerLog.FinalVp,
                    FinalTr = playerLog.FinalTr,
                    UpdatedAt = DateTime.UtcNow
                };

                if (playerLog.VpBreakdown != null)
                {
                    playerStats.AwardPoints = GetVpBreakdownValue(playerLog.VpBreakdown, "awards");
                    playerStats.MilestonePoints = GetVpBreakdownValue(playerLog.VpBreakdown, "milestones");
                    playerStats.CityPoints = GetVpBreakdownValue(playerLog.VpBreakdown, "cities");
                    playerStats.GreeneryPoints = GetVpBreakdownValue(playerLog.VpBreakdown, "greeneries");
                    playerStats.CardPoints = GetVpBreakdownValue(playerLog.VpBreakdown, "cards");
                }

                allPlayerStats.Add(playerStats);
            }

            return allPlayerStats;
        }

        private int? GetVpBreakdownValue(Dictionary<string, object> vpBreakdown, string key)
        {
            if (vpBreakdown.TryGetValue(key, out object value) && value != null)
            {
                if (value is long l)
                    return (int)l;
                if (value is int i)
                    return i;
            }
            return null;
        }

        private int? ParseDurationToMinutes(string gameDuration)
        {
            if (string.IsNullOrWhiteSpace(gameDuration))
            {
                return null;
            }

            try
            {
                // Expected format: "HH:MM" (e.g., "00:55")
                var parts = gameDuration.Split(':');
                if (parts.Length != 2)
                {
                    return null;
                }

                if (!int.TryParse(parts[0], out int hours) || !int.TryParse(parts[1], out int minutes))
                {
                    return null;
                }

                return (hours * 60) + minutes;
            }
            catch (Exception)
            {
                return null;
            }
        }
    }
}

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

        public List<StartingHandCorporations> ParseStartingHandCorporations(GameLogData gameLogData)
        {
            if (gameLogData == null)
                throw new ArgumentNullException(nameof(gameLogData));

            if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                throw new ArgumentException($"Cannot parse ReplayId '{gameLogData.ReplayId}' to integer", nameof(gameLogData));

            var allStartingHandCorporations = new List<StartingHandCorporations>();

            foreach (var playerEntry in gameLogData.Players)
            {
                if (!int.TryParse(playerEntry.Key, out int playerId))
                {
                    // Log or handle the error for the specific player, but continue with others
                    Console.WriteLine($"Could not parse player ID '{playerEntry.Key}' for table '{tableId}'. Skipping player.");
                    continue;
                }

                if (playerId != int.Parse(gameLogData.PlayerPerspective))
                {
                    continue; // Starting hands should only be present for the PoV player
                }

                var playerLog = playerEntry.Value;

                // Check if starting hand exists and has corporations
                if (playerLog.StartingHand?.Corporations != null && playerLog.StartingHand.Corporations.Count > 0)
                {
                    foreach (var corporation in playerLog.StartingHand.Corporations)
                    {
                        if (!string.IsNullOrWhiteSpace(corporation))
                        {
                            var startingHandCorp = new StartingHandCorporations
                            {
                                TableId = tableId,
                                PlayerId = playerId,
                                Corporation = corporation,
                                Kept = string.Equals(corporation, playerLog.Corporation, StringComparison.OrdinalIgnoreCase),
                                UpdatedAt = DateTime.UtcNow
                            };

                            allStartingHandCorporations.Add(startingHandCorp);
                        }
                    }
                }
            }

            return allStartingHandCorporations;
        }

        public List<StartingHandPreludes> ParseStartingHandPreludes(GameLogData gameLogData)
        {
            if (gameLogData == null)
                throw new ArgumentNullException(nameof(gameLogData));

            if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                throw new ArgumentException($"Cannot parse ReplayId '{gameLogData.ReplayId}' to integer", nameof(gameLogData));

            var allStartingHandPreludes = new List<StartingHandPreludes>();

            foreach (var playerEntry in gameLogData.Players)
            {
                if (!int.TryParse(playerEntry.Key, out int playerId))
                {
                    Console.WriteLine($"Could not parse player ID '{playerEntry.Key}' for table '{tableId}'. Skipping player.");
                    continue;
                }

                if (playerId != int.Parse(gameLogData.PlayerPerspective))
                {
                    continue; // Starting hands should only be present for the PoV player
                }

                var playerLog = playerEntry.Value;

                var preludes = playerLog.StartingHand?.Preludes;
                if (preludes == null || preludes.Count == 0)
                {
                    continue;
                }

                // Build case-insensitive set of played cards to determine kept preludes
                var played = playerLog.CardsPlayed != null
                    ? new HashSet<string>(playerLog.CardsPlayed, StringComparer.OrdinalIgnoreCase)
                    : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                foreach (var prelude in preludes)
                {
                    if (string.IsNullOrWhiteSpace(prelude)) continue;

                    var row = new StartingHandPreludes
                    {
                        TableId = tableId,
                        PlayerId = playerId,
                        Prelude = prelude,
                        Kept = played.Contains(prelude),
                        UpdatedAt = DateTime.UtcNow
                    };

                    allStartingHandPreludes.Add(row);
                }
            }

            return allStartingHandPreludes;
        }

        public List<StartingHandCards> ParseStartingHandCards(GameLogData gameLogData)
        {
            if (gameLogData == null)
                throw new ArgumentNullException(nameof(gameLogData));

            if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                throw new ArgumentException($"Cannot parse ReplayId '{gameLogData.ReplayId}' to integer", nameof(gameLogData));

            var results = new List<StartingHandCards>();

            if (gameLogData.Players == null || gameLogData.Players.Count == 0)
                return results;

            foreach (var playerEntry in gameLogData.Players)
            {                
                // PlayerId for output
                if (!int.TryParse(playerEntry.Key, out int playerId))
                {
                    Console.WriteLine($"Could not parse player ID '{playerEntry.Key}' for table '{tableId}'. Skipping player.");
                    continue;
                }

                if(playerId != int.Parse(gameLogData.PlayerPerspective))
                {
                    continue; // Starting hands should only be present for the PoV player
                }

                var playerLog = playerEntry.Value;
                var offered = playerLog?.StartingHand?.ProjectCards;
                if (offered == null || offered.Count == 0)
                {
                    continue;
                }

                // Find earliest move for this player containing "You buy"
                var earliestBuyMove = gameLogData.Moves?
                    .FirstOrDefault(m =>
                        m != null &&
                        string.Equals(m.PlayerId, playerEntry.Key, StringComparison.Ordinal) &&
                        !string.IsNullOrWhiteSpace(m.Description) &&
                        m.Description.Contains("You buy", StringComparison.OrdinalIgnoreCase));

                // Parse bought card names from the move description
                var bought = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (earliestBuyMove != null)
                {
                    var desc = earliestBuyMove.Description;
                    // Split on " | " which separates phrases in these logs
                    var parts = desc.Split('|');
                    foreach (var raw in parts)
                    {
                        var part = raw.Trim();
                        const string prefix = "You buy ";
                        if (part.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                        {
                            var name = part.Substring(prefix.Length).Trim();
                            if (!string.IsNullOrWhiteSpace(name))
                            {
                                bought.Add(name);
                            }
                        }
                    }
                }

                // Emit one row per offered starting-hand project card
                foreach (var card in offered)
                {
                    if (string.IsNullOrWhiteSpace(card)) continue;

                    results.Add(new StartingHandCards
                    {
                        TableId = tableId,
                        PlayerId = playerId,
                        Card = card,
                        Kept = bought.Contains(card),
                        UpdatedAt = DateTime.UtcNow
                    });
                }
            }

            return results;
        }

        public List<GameMilestone> ParseGameMilestones(GameLogData gameLogData)
        {
            if (gameLogData == null)
                throw new ArgumentNullException(nameof(gameLogData));

            if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                throw new ArgumentException($"Cannot parse ReplayId '{gameLogData.ReplayId}' to integer", nameof(gameLogData));

            var results = new List<GameMilestone>();

            // The milestones should be present on the final move's game_state
            var finalMove = gameLogData.Moves != null && gameLogData.Moves.Count > 0
                ? gameLogData.Moves[gameLogData.Moves.Count - 1]
                : null;

            var finalMilestones = finalMove?.GameState?.Milestones;
            if (finalMilestones == null || finalMilestones.Count == 0)
            {
                return results;
            }

            foreach (var kvp in finalMilestones)
            {
                var milestoneName = kvp.Key;
                var info = kvp.Value;
                if (info == null) continue;

                // Parse player ID (claimed by)
                if (!int.TryParse(info.PlayerId, out int claimedBy))
                {
                    // If we cannot parse claimedBy, skip this record
                    Console.WriteLine($"Table {tableId}: Unable to parse PlayerId '{info.PlayerId}' for milestone '{milestoneName}', skipping.");
                    continue;
                }

                // Find the move where the milestone was claimed to get the generation
                int claimedGen = 0;
                if (info.MoveNumber.HasValue && gameLogData.Moves != null)
                {
                    var claimedMove = gameLogData.Moves.FirstOrDefault(m => m.MoveNumber == info.MoveNumber.Value);
                    claimedGen = claimedMove?.GameState?.Generation ?? 0;
                }

                results.Add(new GameMilestone
                {
                    TableId = tableId,
                    Milestone = milestoneName,
                    ClaimedBy = claimedBy,
                    ClaimedGen = claimedGen,
                    UpdatedAt = DateTime.UtcNow
                });
            }

            return results;
        }

        public List<GamePlayerAward> ParseGamePlayerAwards(GameLogData gameLogData)
        {
            if (gameLogData == null)
                throw new ArgumentNullException(nameof(gameLogData));

            if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                throw new ArgumentException($"Cannot parse ReplayId '{gameLogData.ReplayId}' to integer", nameof(gameLogData));

            var awardsRows = new List<GamePlayerAward>();

            // Use the final move's state as authoritative
            var finalMove = gameLogData.Moves != null && gameLogData.Moves.Count > 0
                ? gameLogData.Moves[gameLogData.Moves.Count - 1]
                : null;

            var finalState = finalMove?.GameState;
            var finalAwards = finalState?.Awards;
            var finalPlayerVp = finalState?.PlayerVp;

            if (finalAwards == null || finalAwards.Count == 0 || finalPlayerVp == null || finalPlayerVp.Count == 0)
            {
                return awardsRows;
            }

            // Precompute funded-by and funded generation for each award
            var fundedByMap = new Dictionary<string, (int FundedBy, int FundedGen)>(StringComparer.OrdinalIgnoreCase);
            foreach (var kvp in finalAwards)
            {
                var awardName = kvp.Key;
                var info = kvp.Value;
                if (info == null) continue;

                // FundedBy comes from AwardInfo.PlayerId
                if (!int.TryParse(info.PlayerId, out int fundedBy))
                {
                    // If fundedBy cannot be parsed, skip this award
                    Console.WriteLine($"Table {tableId}: Unable to parse AwardInfo.PlayerId '{info.PlayerId}' for award '{awardName}', skipping funding info.");
                    continue;
                }

                int fundedGen = 0;
                if (info.MoveNumber.HasValue && gameLogData.Moves != null)
                {
                    var fundedMove = gameLogData.Moves.FirstOrDefault(m => m.MoveNumber == info.MoveNumber.Value);
                    fundedGen = fundedMove?.GameState?.Generation ?? 0;
                }

                fundedByMap[awardName] = (fundedBy, fundedGen);
            }

            if (fundedByMap.Count == 0)
            {
                return awardsRows;
            }

            // For each player, read their award details (place, counter) for each funded award
            foreach (var playerEntry in finalPlayerVp)
            {
                if (!int.TryParse(playerEntry.Key, out int playerId))
                {
                    Console.WriteLine($"Table {tableId}: Unable to parse PlayerVp key '{playerEntry.Key}' to int, skipping player.");
                    continue;
                }

                var playerVp = playerEntry.Value;
                var awardDetails = playerVp?.Details?.Awards; // Dictionary<string, AwardVictoryPoints>

                if (awardDetails == null || awardDetails.Count == 0)
                {
                    continue;
                }

                foreach (var awardName in fundedByMap.Keys)
                {
                    if (!awardDetails.TryGetValue(awardName, out var awardVp) || awardVp == null)
                    {
                        // If the player doesn't have an entry for this award, skip creating a row for them
                        continue;
                    }

                    var (fundedBy, fundedGen) = fundedByMap[awardName];

                    awardsRows.Add(new GamePlayerAward
                    {
                        TableId = tableId,
                        PlayerId = playerId,
                        Award = awardName,
                        FundedBy = fundedBy,
                        FundedGen = fundedGen,
                        PlayerPlace = awardVp.Place,
                        PlayerCounter = awardVp.Counter,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
            }

            return awardsRows;
        }

        public List<ParameterChange> ParseParameterChanges(GameLogData gameLogData)
        {
            if (gameLogData == null)
                throw new ArgumentNullException(nameof(gameLogData));

            if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                throw new ArgumentException($"Cannot parse ReplayId '{gameLogData.ReplayId}' to integer", nameof(gameLogData));

            var changes = new List<ParameterChange>();

            if (gameLogData.Moves == null || gameLogData.Moves.Count == 0)
                return changes;

            int? prevTemp = null;
            int? prevOxy = null;
            int? prevOce = null;

            foreach (var move in gameLogData.Moves)
            {
                var state = move?.GameState;
                if (state == null)
                {
                    continue;
                }

                var currTemp = state.Temperature;
                var currOxy = state.Oxygen;
                var currOce = state.Oceans;
                var gen = state.Generation;
                int? actorId = null;
                if (int.TryParse(move.PlayerId, out int actor)) actorId = actor;

                // Only record changes if generation is known
                if (gen.HasValue)
                {
                    // temperature: step size is 2 per unit increase on the track
                    if (prevTemp.HasValue && currTemp.HasValue && currTemp.Value > prevTemp.Value)
                    {
                        int stepSize = 2;
                        int diff = currTemp.Value - prevTemp.Value;
                        int steps = diff / stepSize; // expected to divide evenly; if not, floor
                        for (int k = 1; k <= steps; k++)
                        {
                            int increasedTo = prevTemp.Value + k * stepSize;
                            changes.Add(new ParameterChange
                            {
                                TableId = tableId,
                                Parameter = "temperature",
                                Generation = gen.Value,
                                IncreasedTo = increasedTo,
                                IncreasedBy = actorId,
                                UpdatedAt = DateTime.UtcNow
                            });
                        }
                    }

                    // oxygen: step size is 1
                    if (prevOxy.HasValue && currOxy.HasValue && currOxy.Value > prevOxy.Value)
                    {
                        for (int v = prevOxy.Value + 1; v <= currOxy.Value; v++)
                        {
                            changes.Add(new ParameterChange
                            {
                                TableId = tableId,
                                Parameter = "oxygen",
                                Generation = gen.Value,
                                IncreasedTo = v,
                                IncreasedBy = actorId,
                                UpdatedAt = DateTime.UtcNow
                            });
                        }
                    }

                    // oceans: step size is 1
                    if (prevOce.HasValue && currOce.HasValue && currOce.Value > prevOce.Value)
                    {
                        for (int v = prevOce.Value + 1; v <= currOce.Value; v++)
                        {
                            changes.Add(new ParameterChange
                            {
                                TableId = tableId,
                                Parameter = "oceans",
                                Generation = gen.Value,
                                IncreasedTo = v,
                                IncreasedBy = actorId,
                                UpdatedAt = DateTime.UtcNow
                            });
                        }
                    }
                }

                // update previous values after processing this move
                if (currTemp.HasValue) prevTemp = currTemp.Value;
                if (currOxy.HasValue) prevOxy = currOxy.Value;
                if (currOce.HasValue) prevOce = currOce.Value;
            }

            return changes;
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

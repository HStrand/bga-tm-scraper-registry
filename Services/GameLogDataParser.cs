using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using BgaTmScraperRegistry.Models;
using Newtonsoft.Json.Linq;

namespace BgaTmScraperRegistry.Services
{
    public class GameLogDataParser
    {
        private class PendingEffect
        {
            public string Reason;
            public string SignalPattern;
            public bool RequiresSignal;
            public bool IsReady;
            public int Remaining;
            public int CreatedMoveNumber;
            public int? ReadyMoveNumber;
            public int? TargetDrawEventNo;

            public PendingEffect(string reason, string signalPattern, bool requiresSignal, bool isReady, int remaining, int createdMoveNumber, int? readyMoveNumber = null, int? targetDrawEventNo = null)
            {
                Reason = reason;
                SignalPattern = signalPattern;
                RequiresSignal = requiresSignal;
                IsReady = isReady;
                Remaining = remaining;
                CreatedMoveNumber = createdMoveNumber;
                ReadyMoveNumber = readyMoveNumber;
                TargetDrawEventNo = targetDrawEventNo;
            }
        }

        private class PendingPlayReveal
        {
            public string PlayedCard;
            public string TagKeyword; // e.g., "Space" or "Plant"
            public int Remaining;
            public int CreatedMoveNumber;
            public int LastSeenMoveNumber;

            public PendingPlayReveal(string playedCard, string tagKeyword, int remaining, int createdMoveNumber)
            {
                PlayedCard = playedCard;
                TagKeyword = tagKeyword;
                Remaining = remaining;
                CreatedMoveNumber = createdMoveNumber;
                LastSeenMoveNumber = createdMoveNumber;
            }
        }

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

            // Player count (length of players list)
            int? playerCount = gameLogData.Players?.Count ?? 0;

            bool? conceded = gameLogData.Conceded;

            // Winner resolution:
            // 1) If winner is numeric, parse as player id
            // 2) Otherwise try to match winner string to a player's PlayerName (case-insensitive) and use that player's PlayerId
            int? winner = null;
            if (!string.IsNullOrWhiteSpace(gameLogData.Winner))
            {
                var winnerRaw = gameLogData.Winner.Trim();
                if (int.TryParse(winnerRaw, out int winnerId))
                {
                    winner = winnerId;
                }
                else if (gameLogData.Players != null)
                {
                    // Try to find by player name (case-insensitive)
                    var match = gameLogData.Players
                        .FirstOrDefault(kvp => string.Equals(kvp.Value?.PlayerName, winnerRaw, StringComparison.OrdinalIgnoreCase));
                    if (!string.IsNullOrEmpty(match.Value?.PlayerId) && int.TryParse(match.Value.PlayerId, out int parsed))
                    {
                        winner = parsed;
                    }
                }
            }

            var gameStats = new GameStats
            {
                TableId = tableId,
                Generations = generations,
                DurationMinutes = durationMinutes,
                PlayerCount = playerCount,
                Winner = winner,
                Conceded = conceded,
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
                var playerLog = playerEntry.Value;
                var projectCardsInStartingHand = playerLog?.StartingHand?.ProjectCards;
                if (projectCardsInStartingHand == null || projectCardsInStartingHand.Count == 0)
                {
                    continue;
                }

                // Get opening keeps from cards_kept dictionary
                var matchingMove = gameLogData.Moves
                    .FirstOrDefault(move => move.CardsKept != null && 
                    move.CardsKept.ContainsKey(playerEntry.Key) &&
                    move.CardsKept[playerEntry.Key].Any(cardKept => projectCardsInStartingHand.Contains(cardKept)));

                List<string> playerOpeningKeeps = null;
                if (matchingMove?.CardsKept != null && 
                    matchingMove.CardsKept.TryGetValue(playerEntry.Key, out var keeps))
                {
                    playerOpeningKeeps = keeps;
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
                foreach (var card in projectCardsInStartingHand)
                {
                    if (string.IsNullOrWhiteSpace(card)) continue;

                    results.Add(new StartingHandCards
                    {
                        TableId = tableId,
                        PlayerId = playerId,
                        Card = card,
                        Kept = (playerOpeningKeeps != null && playerOpeningKeeps.Contains(card)) || bought.Contains(card),
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

        public List<GamePlayerTrackerChange> ParseGamePlayerTrackerChanges(GameLogData gameLogData)
        {
            if (gameLogData == null)
                throw new ArgumentNullException(nameof(gameLogData));

            if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                throw new ArgumentException($"Cannot parse ReplayId '{gameLogData.ReplayId}' to integer", nameof(gameLogData));

            var results = new List<GamePlayerTrackerChange>();

            if (gameLogData.Moves == null || gameLogData.Moves.Count == 0)
                return results;

            // Build reflection map: property -> raw JSON key from JsonProperty attribute
            var trackerProps = typeof(PlayerTracker).GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Select(p => new
                {
                    Prop = p,
                    JsonName = p.GetCustomAttribute<Newtonsoft.Json.JsonPropertyAttribute>()?.PropertyName
                })
                .Where(x => !string.IsNullOrWhiteSpace(x.JsonName))
                .ToList();

            string Classify(string trackerName)
            {
                if (trackerName.IndexOf("Production", StringComparison.OrdinalIgnoreCase) >= 0) return "Production";
                if (trackerName.StartsWith("Count of ", StringComparison.OrdinalIgnoreCase)
                    && trackerName.IndexOf(" tags", StringComparison.OrdinalIgnoreCase) >= 0) return "Tag";
                return "Resource";
            }

            // Keep last seen values per playerId -> trackerName
            var prevByPlayer = new Dictionary<string, Dictionary<string, int>>(StringComparer.Ordinal);

            foreach (var move in gameLogData.Moves.OrderBy(m => m?.MoveNumber ?? int.MaxValue))
            {
                var gen = move?.GameState?.Generation;
                if (!gen.HasValue) continue;

                var trackers = move?.GameState?.PlayerTrackers;
                if (trackers == null || trackers.Count == 0) continue;

                foreach (var kv in trackers)
                {
                    var playerIdStr = kv.Key;
                    var pt = kv.Value;
                    if (pt == null) continue;

                    if (!prevByPlayer.TryGetValue(playerIdStr, out var prevMap))
                    {
                        prevMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                        prevByPlayer[playerIdStr] = prevMap;
                    }

                    foreach (var def in trackerProps)
                    {
                        // Get raw tracker name and current value
                        var rawName = def.JsonName;
                        var obj = def.Prop.GetValue(pt);
                        if (obj == null) continue;

                        // Only consider numeric int? values
                        if (obj is int currValNullable)
                        {
                            int currVal = currValNullable;

                            // Compare with previous; record if changed or not seen before
                            if (!prevMap.TryGetValue(rawName, out int prevVal) || prevVal != currVal)
                            {
                                // Emit row
                                if (int.TryParse(playerIdStr, out int playerIdInt))
                                {
                                    results.Add(new GamePlayerTrackerChange
                                    {
                                        TableId = tableId,
                                        PlayerId = playerIdInt,
                                        Tracker = rawName,
                                        TrackerType = Classify(rawName),
                                        Generation = gen.Value,
                                        MoveNumber = move?.MoveNumber,
                                        ChangedTo = currVal,
                                        UpdatedAt = DateTime.UtcNow
                                    });
                                }

                                // Update previous
                                prevMap[rawName] = currVal;
                            }
                        }
                    }
                }
            }

            return results;
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

        public List<GameCityLocation> ParseGameCityLocations(GameLogData gameLogData)
        {
            if (gameLogData == null)
                throw new ArgumentNullException(nameof(gameLogData));

            if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                throw new ArgumentException($"Cannot parse ReplayId '{gameLogData.ReplayId}' to integer", nameof(gameLogData));

            var results = new List<GameCityLocation>();

            // Final state
            var finalMove = gameLogData.Moves != null && gameLogData.Moves.Count > 0
                ? gameLogData.Moves[gameLogData.Moves.Count - 1]
                : null;

            var finalState = finalMove?.GameState;
            var finalPlayerVp = finalState?.PlayerVp;

            if (finalPlayerVp == null || finalPlayerVp.Count == 0)
            {
                return results;
            }

            // Helper to find placed generation
            int? FindPlacedGenForCity(string playerIdStr, string cityLocation)
            {
                if (string.IsNullOrWhiteSpace(playerIdStr) || gameLogData.Moves == null)
                    return null;

                // Normalize helpers
                static string ExtractCoords(string s)
                {
                    if (string.IsNullOrWhiteSpace(s)) return null;
                    // Prefer coords inside parentheses if present
                    int l = s.LastIndexOf('(');
                    int r = s.LastIndexOf(')');
                    if (l >= 0 && r > l)
                    {
                        var inside = s.Substring(l + 1, r - l - 1).Trim();
                        if (inside.Contains(",")) return inside.Replace(" ", "");
                    }
                    // Fallback: try to find a "x,y" token anywhere
                    var parts = s.Split(new[] { ' ', '|', ':' }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (var p in parts.Reverse())
                    {
                        var t = p.Trim().TrimEnd('.', ',');
                        if (t.Contains(","))
                        {
                            var nums = t.Split(',');
                            if (nums.Length == 2 && int.TryParse(nums[0], out _) && int.TryParse(nums[1], out _))
                            {
                                return (nums[0] + "," + nums[1]).Replace(" ", "");
                            }
                        }
                    }
                    return null;
                }

                static string ExtractMap(string s)
                {
                    if (string.IsNullOrWhiteSpace(s)) return null;
                    // Look for "<Map> Hex"
                    var idx = s.IndexOf("Hex", StringComparison.OrdinalIgnoreCase);
                    if (idx > 0)
                    {
                        var left = s.Substring(0, idx).Trim();
                        // Take last token before "Hex" as map name
                        var tokens = left.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                        if (tokens.Length > 0) return tokens[tokens.Length - 1].Trim().ToLowerInvariant();
                    }
                    return null;
                }

                static (bool isHex, string map, string coords) NormalizeLoc(string s)
                {
                    if (string.IsNullOrWhiteSpace(s)) return (false, null, null);
                    var coords = ExtractCoords(s);
                    var map = ExtractMap(s);
                    var isHex = coords != null;
                    return (isHex, map, coords);
                }

                static bool HexMatch((bool isHex, string map, string coords) a, (bool isHex, string map, string coords) b)
                {
                    if (!(a.isHex && b.isHex)) return false;
                    if (!string.Equals(a.coords, b.coords, StringComparison.OrdinalIgnoreCase)) return false;
                    // If both have map, require equal; if either missing map, accept coords match
                    if (!string.IsNullOrEmpty(a.map) && !string.IsNullOrEmpty(b.map))
                    {
                        return string.Equals(a.map, b.map, StringComparison.OrdinalIgnoreCase);
                    }
                    return true;
                }

                var normFinal = NormalizeLoc(cityLocation);

                // First pass: use structured fields from place_tile moves for the same player
                foreach (var m in gameLogData.Moves)
                {
                    if (!string.Equals(m?.PlayerId, playerIdStr, StringComparison.Ordinal))
                        continue;

                    var gen = m?.GameState?.Generation;
                    if (!gen.HasValue) continue;

                    // Fast path: action_type and tile fields
                    if (string.Equals(m?.ActionType, "place_tile", StringComparison.OrdinalIgnoreCase) &&
                        !string.IsNullOrWhiteSpace(m?.TilePlaced) &&
                        m.TilePlaced.Equals("City", StringComparison.OrdinalIgnoreCase))
                    {
                        var loc = m.TileLocation ?? string.Empty;

                        // Direct substring match either direction
                        if (!string.IsNullOrWhiteSpace(loc) &&
                            (loc.IndexOf(cityLocation, StringComparison.OrdinalIgnoreCase) >= 0 ||
                             cityLocation.IndexOf(loc, StringComparison.OrdinalIgnoreCase) >= 0))
                        {
                            return gen.Value;
                        }

                        // Normalize and compare by map/coords
                        var normMove = NormalizeLoc(loc);
                        if (HexMatch(normFinal, normMove)) return gen.Value;
                    }

                    // Flexible description patterns for city placement
                    var desc = m?.Description ?? string.Empty;
                    if (string.IsNullOrWhiteSpace(desc)) continue;

                    if (desc.IndexOf("places City", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        desc.IndexOf("places tile City", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        // Direct substring match
                        if (desc.IndexOf(cityLocation, StringComparison.OrdinalIgnoreCase) >= 0)
                            return gen.Value;

                        // Try normalize description by extracting a location-ish tail (use whole desc)
                        var normDesc = NormalizeLoc(desc);
                        if (HexMatch(normFinal, normDesc)) return gen.Value;
                    }
                }

                // Fallback for named cities: use card play event as proxy when no explicit placement found
                // Only if final CityLocation doesn't look like a hex location
                if (!normFinal.isHex)
                {
                    foreach (var m in gameLogData.Moves)
                    {
                        if (!string.Equals(m?.PlayerId, playerIdStr, StringComparison.Ordinal))
                            continue;

                        var gen = m?.GameState?.Generation;
                        if (!gen.HasValue) continue;

                        var desc = m?.Description ?? string.Empty;

                        if (!string.IsNullOrWhiteSpace(m?.CardPlayed) &&
                            string.Equals(m.CardPlayed, cityLocation, StringComparison.OrdinalIgnoreCase))
                        {
                            return gen.Value;
                        }

                        if (desc.IndexOf("plays card ", StringComparison.OrdinalIgnoreCase) >= 0 &&
                            desc.IndexOf(cityLocation, StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            return gen.Value;
                        }
                    }
                }

                // Not found
                return null;
            }

            foreach (var pv in finalPlayerVp)
            {
                var playerIdStr = pv.Key;
                if (!int.TryParse(playerIdStr, out int playerId))
                    continue;

                var cities = pv.Value?.Details?.Cities;
                if (cities == null || cities.Count == 0)
                    continue;

                foreach (var kv in cities)
                {
                    var location = kv.Key;
                    var vp = kv.Value?.Vp ?? 0;

                    var placedGen = FindPlacedGenForCity(playerIdStr, location);

                    results.Add(new GameCityLocation
                    {
                        TableId = tableId,
                        PlayerId = playerId,
                        CityLocation = location,
                        Points = vp,
                        PlacedGen = placedGen,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
            }

            return results;
        }

        public List<GameGreeneryLocation> ParseGameGreeneryLocations(GameLogData gameLogData)
        {
            if (gameLogData == null)
                throw new ArgumentNullException(nameof(gameLogData));

            if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                throw new ArgumentException($"Cannot parse ReplayId '{gameLogData.ReplayId}' to integer", nameof(gameLogData));

            var results = new List<GameGreeneryLocation>();

            // Final state
            var finalMove = gameLogData.Moves != null && gameLogData.Moves.Count > 0
                ? gameLogData.Moves[gameLogData.Moves.Count - 1]
                : null;

            var finalState = finalMove?.GameState;
            var finalPlayerVp = finalState?.PlayerVp;

            if (finalPlayerVp == null || finalPlayerVp.Count == 0)
            {
                return results;
            }

            // Normalization helpers (same as cities)
            static string ExtractCoords(string s)
            {
                if (string.IsNullOrWhiteSpace(s)) return null;
                int l = s.LastIndexOf('(');
                int r = s.LastIndexOf(')');
                if (l >= 0 && r > l)
                {
                    var inside = s.Substring(l + 1, r - l - 1).Trim();
                    if (inside.Contains(",")) return inside.Replace(" ", "");
                }
                var parts = s.Split(new[] { ' ', '|', ':' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var p in parts.Reverse())
                {
                    var t = p.Trim().TrimEnd('.', ',');
                    if (t.Contains(","))
                    {
                        var nums = t.Split(',');
                        if (nums.Length == 2 && int.TryParse(nums[0], out _) && int.TryParse(nums[1], out _))
                        {
                            return (nums[0] + "," + nums[1]).Replace(" ", "");
                        }
                    }
                }
                return null;
            }

            static string ExtractMap(string s)
            {
                if (string.IsNullOrWhiteSpace(s)) return null;
                var idx = s.IndexOf("Hex", StringComparison.OrdinalIgnoreCase);
                if (idx > 0)
                {
                    var left = s.Substring(0, idx).Trim();
                    var tokens = left.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    if (tokens.Length > 0) return tokens[tokens.Length - 1].Trim().ToLowerInvariant();
                }
                return null;
            }

            static (bool isHex, string map, string coords) NormalizeLoc(string s)
            {
                if (string.IsNullOrWhiteSpace(s)) return (false, null, null);
                var coords = ExtractCoords(s);
                var map = ExtractMap(s);
                var isHex = coords != null;
                return (isHex, map, coords);
            }

            static bool HexMatch((bool isHex, string map, string coords) a, (bool isHex, string map, string coords) b)
            {
                if (!(a.isHex && b.isHex)) return false;
                if (!string.Equals(a.coords, b.coords, StringComparison.OrdinalIgnoreCase)) return false;
                if (!string.IsNullOrEmpty(a.map) && !string.IsNullOrEmpty(b.map))
                {
                    return string.Equals(a.map, b.map, StringComparison.OrdinalIgnoreCase);
                }
                return true;
            }

            int? FindPlacedGenForGreenery(string playerIdStr, string greeneryLocation)
            {
                if (string.IsNullOrWhiteSpace(playerIdStr) || gameLogData.Moves == null)
                    return null;

                var normFinal = NormalizeLoc(greeneryLocation);

                foreach (var m in gameLogData.Moves)
                {
                    if (!string.Equals(m?.PlayerId, playerIdStr, StringComparison.Ordinal))
                        continue;

                    var gen = m?.GameState?.Generation;
                    if (!gen.HasValue) continue;

                    // Fast path via structured fields
                    if (string.Equals(m?.ActionType, "place_tile", StringComparison.OrdinalIgnoreCase) &&
                        !string.IsNullOrWhiteSpace(m?.TilePlaced) &&
                        m.TilePlaced.Equals("Forest", StringComparison.OrdinalIgnoreCase))
                    {
                        var loc = m.TileLocation ?? string.Empty;

                        if (!string.IsNullOrWhiteSpace(loc) &&
                            (loc.IndexOf(greeneryLocation, StringComparison.OrdinalIgnoreCase) >= 0 ||
                             greeneryLocation.IndexOf(loc, StringComparison.OrdinalIgnoreCase) >= 0))
                        {
                            return gen.Value;
                        }

                        var normMove = NormalizeLoc(loc);
                        if (HexMatch(normFinal, normMove)) return gen.Value;
                    }

                    // Flexible description fallback
                    var desc = m?.Description ?? string.Empty;
                    if (string.IsNullOrWhiteSpace(desc)) continue;

                    if (desc.IndexOf("places Forest", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        desc.IndexOf("places tile Forest", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        if (desc.IndexOf(greeneryLocation, StringComparison.OrdinalIgnoreCase) >= 0)
                            return gen.Value;

                        var normDesc = NormalizeLoc(desc);
                        if (HexMatch(normFinal, normDesc)) return gen.Value;
                    }
                }

                return null;
            }

            // Build rows from final state greeneries
            foreach (var pv in finalPlayerVp)
            {
                var playerIdStr = pv.Key;
                if (!int.TryParse(playerIdStr, out int playerId))
                    continue;

                var greeneries = pv.Value?.Details?.Greeneries;
                if (greeneries == null || greeneries.Count == 0)
                    continue;

                foreach (var kv in greeneries)
                {
                    var location = kv.Key;
                    var placedGen = FindPlacedGenForGreenery(playerIdStr, location);

                    results.Add(new GameGreeneryLocation
                    {
                        TableId = tableId,
                        PlayerId = playerId,
                        GreeneryLocation = location,
                        PlacedGen = placedGen,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
            }

            return results;
        }

        public List<GameCard> ParseGameCards(GameLogData gameLogData)
        {
            if (gameLogData == null)
                throw new ArgumentNullException(nameof(gameLogData));

            if (!int.TryParse(gameLogData.ReplayId, out int tableId))
                throw new ArgumentException($"Cannot parse ReplayId '{gameLogData.ReplayId}' to integer", nameof(gameLogData));

            if (!int.TryParse(gameLogData.PlayerPerspective, out int povId))
                throw new ArgumentException($"Cannot parse PlayerPerspective '{gameLogData.PlayerPerspective}' to integer", nameof(gameLogData));

            var results = new Dictionary<string, GameCard>(StringComparer.OrdinalIgnoreCase);

            string Key(int playerId, string cardName) => $"{playerId}|{cardName}";

            GameCard GetOrCreateForPlayer(int playerId, string cardName)
            {
                var key = Key(playerId, cardName);
                if (!results.TryGetValue(key, out var gc))
                {
                    gc = new GameCard
                    {
                        TableId = tableId,
                        PlayerId = playerId,
                        Card = cardName,
                        UpdatedAt = DateTime.UtcNow
                    };
                    results[key] = gc;
                }
                gc.UpdatedAt = DateTime.UtcNow;
                return gc;
            }

            GameCard GetOrCreate(string cardName) => GetOrCreateForPlayer(povId, cardName);

            IEnumerable<string> SplitCardList(string list)
            {
                if (string.IsNullOrWhiteSpace(list))
                    return Enumerable.Empty<string>();
                return list.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                           .Select(x => x.Trim())
                           .Where(x => !string.IsNullOrWhiteSpace(x));
            }

            // Ensure POV starting-hand project cards are marked as seen/drawn in generation 1
            GameLogPlayer povPlayer = null;
            if (gameLogData.Players != null)
            {
                gameLogData.Players.TryGetValue(gameLogData.PlayerPerspective, out povPlayer);
            }
            foreach (var entry in gameLogData.Players)
            {
                var player = entry.Value;
                var playerId = int.Parse(entry.Key);
                
                foreach (var shCard in player.StartingHand.ProjectCards)
                {
                    if (string.IsNullOrWhiteSpace(shCard)) continue;
                    var gc = GetOrCreateForPlayer(playerId, shCard);
                    if (!gc.SeenGen.HasValue) gc.SeenGen = 1;
                    if (!gc.DrawnGen.HasValue) gc.DrawnGen = 1;
                    if (gc.DrawType == null) gc.DrawType = "StartingHand";
                    if (gc.DrawReason == null) gc.DrawReason = "Starting Hand";
                }
            }

            var draftEvents = new Dictionary<string, List<(int MoveNumber, int Generation, string PlayerId)>>(StringComparer.OrdinalIgnoreCase);
            var pendingEffectsByPlayer = new Dictionary<string, List<PendingEffect>>(StringComparer.OrdinalIgnoreCase);
            var drawEventNoByPlayer = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            if (gameLogData.Moves != null)
            {
                foreach (var move in gameLogData.Moves)
                {
                    var desc = move?.Description ?? string.Empty;
                    var gen = move?.GameState?.Generation;

                    // NEW FIELD PROCESSING: Handle card_options, card_drafted, and cards_kept for all players
                    
                    // DrawnGen from card_options: when cards are first offered to players
                    if (move.CardOptions != null && gen.HasValue)
                    {
                        ProcessCardOptions(gameLogData, move, gen.Value, pendingEffectsByPlayer, drawEventNoByPlayer, (pid, name) => GetOrCreateForPlayer(pid, name));
                    }

                    // DraftedGen from card_drafted: when a specific card is drafted by a player
                    if (!string.IsNullOrWhiteSpace(move.CardDrafted) && gen.HasValue)
                    {
                        ProcessCardDrafted(gameLogData, move, gen.Value, draftEvents, (pid, name) => GetOrCreateForPlayer(pid, name));
                    }

                    // KeptGen from cards_kept: when players keep specific cards
                    if (move.CardsKept != null && gen.HasValue)
                    {
                        ProcessCardsKept(gameLogData, move, gen.Value, (pid, name) => GetOrCreateForPlayer(pid, name));
                    }

                    EnqueueTriggeredCardDrawEffects(move, desc, pendingEffectsByPlayer, drawEventNoByPlayer);

                    DetectCardDrawEffects(move, desc, pendingEffectsByPlayer, drawEventNoByPlayer);

                    ProcessSeenFromNamedDrawsText(gameLogData, move, gen.Value, desc, name => GetOrCreate(name));

                    ProcessReveals(gameLogData, move, gen.Value, desc, name => GetOrCreate(name));

                    // PlayedGen: POV plays a card (via CardPlayed or description) - ignore standard projects
                    if (gen.HasValue && move?.PlayerId == gameLogData.PlayerPerspective && !string.Equals(move?.ActionType, "standard_project", StringComparison.OrdinalIgnoreCase))
                    {
                        string playedName = move?.CardPlayed;
                        if (string.IsNullOrWhiteSpace(playedName))
                        {
                            var segments = desc.Split('|');
                            foreach (var seg in segments)
                            {
                                var s = seg.Trim();
                                const string youPlay = "You play ";
                                if (s.StartsWith(youPlay, StringComparison.OrdinalIgnoreCase))
                                {
                                    playedName = s.Substring(youPlay.Length).Trim();
                                    break;
                                }
                                if (!string.IsNullOrEmpty(move?.PlayerName))
                                {
                                    var namePrefix = move.PlayerName + " plays ";
                                    if (s.StartsWith(namePrefix, StringComparison.OrdinalIgnoreCase))
                                    {
                                        playedName = s.Substring(namePrefix.Length).Trim();
                                        break;
                                    }
                                }
                            }
                        }

                        // If the play reveals cards (e.g., Acquired Space Agency), treat revealed space-tag cards as drawn by this play
                        if (!string.IsNullOrWhiteSpace(playedName) && !string.IsNullOrWhiteSpace(desc))
                        {
                            var segsCheck = desc.Split('|');
                            foreach (var segCheck in segsCheck)
                            {
                                var sCheck = segCheck.Trim();
                                int idxRev = sCheck.IndexOf("reveals ", StringComparison.OrdinalIgnoreCase);
                                if (idxRev < 0) continue;

                                // There may be multiple "reveals" tokens in the same segment; scan them
                                int searchPos = 0;
                                while (true)
                                {
                                    int found = sCheck.IndexOf("reveals ", searchPos, StringComparison.OrdinalIgnoreCase);
                                    if (found < 0) break;
                                    int nameStart = found + "reveals ".Length;
                                    int colonIdx = sCheck.IndexOf(':', nameStart);
                                    if (colonIdx < 0)
                                    {
                                        // No colon -> can't reliably parse reason/metadata; stop scanning this segment
                                        break;
                                    }
                                    var revealedName = sCheck.Substring(nameStart, colonIdx - nameStart).Trim();
                                    var after = sCheck.Substring(colonIdx + 1).Trim();

                                    if (!string.IsNullOrWhiteSpace(revealedName))
                                    {
                                        // If the reveal indicates the card has a Space tag, treat it as drawn by the played card
                                        if (after.IndexOf("has a Space tag", StringComparison.OrdinalIgnoreCase) >= 0)
                                        {
                                            var gcRevealed = GetOrCreate(revealedName);
                                            if (!gcRevealed.SeenGen.HasValue) gcRevealed.SeenGen = gen.Value;
                                            if (!gcRevealed.DrawnGen.HasValue) gcRevealed.DrawnGen = gen.Value;
                                            if (gcRevealed.DrawType == null) gcRevealed.DrawType = "PlayCard";
                                            if (gcRevealed.DrawReason == null) gcRevealed.DrawReason = playedName;
                                        }
                                        else
                                        {
                                            // Generic reveal without the desired tag: mark as seen only (existing behavior)
                                            var gcSeen = GetOrCreate(revealedName);
                                            if (!gcSeen.SeenGen.HasValue) gcSeen.SeenGen = gen.Value;
                                        }
                                    }

                                    searchPos = colonIdx + 1;
                                }
                            }

                            // Also mark the played card as seen/played (existing behavior)
                            var gc = GetOrCreate(playedName);
                            if (!gc.SeenGen.HasValue) gc.SeenGen = gen.Value;
                            if (!gc.PlayedGen.HasValue) gc.PlayedGen = gen.Value;
                        }
                    }

                    // PlayedGen: Opponent plays a card (only PlayedGen, no SeenGen/DrawType/etc.)
                    if (gen.HasValue && move?.PlayerId != gameLogData.PlayerPerspective && !string.Equals(move?.ActionType, "standard_project", StringComparison.OrdinalIgnoreCase))
                    {
                        string playedName = move?.CardPlayed;
                        if (string.IsNullOrWhiteSpace(playedName))
                        {
                            var segments = desc.Split('|');
                            foreach (var seg in segments)
                            {
                                var s = seg.Trim();
                                const string playsCardPrefix = "plays card ";
                                int idxPc = s.IndexOf(playsCardPrefix, StringComparison.OrdinalIgnoreCase);
                                if (idxPc >= 0)
                                {
                                    playedName = s.Substring(idxPc + playsCardPrefix.Length).Trim();
                                    break;
                                }

                                // Fallback: "<Name> plays <Card>"
                                if (!string.IsNullOrEmpty(move?.PlayerName))
                                {
                                    var namePrefix = move.PlayerName + " plays ";
                                    if (s.StartsWith(namePrefix, StringComparison.OrdinalIgnoreCase))
                                    {
                                        playedName = s.Substring(namePrefix.Length).Trim();
                                        break;
                                    }
                                }
                            }
                        }

                        if (!string.IsNullOrWhiteSpace(playedName) && int.TryParse(move.PlayerId, out int opponentId))
                        {
                            var gc = GetOrCreateForPlayer(opponentId, playedName);
                            if (!gc.PlayedGen.HasValue) gc.PlayedGen = gen.Value;
                        }
                    }

                    // LEGACY PROCESSING: Existing logic preserved as fallback

                    RecordDraftEventsLegacy(gameLogData, move, gen.Value, desc, draftEvents, name => GetOrCreate(name));
                    ProcessSeenFromAnyPlay(move, gen.Value, desc, name => GetOrCreate(name));

                    // Legacy DraftedGen detection: only for POV draft_card moves
                    if (gen.HasValue && string.Equals(move?.ActionType, "draft_card", StringComparison.OrdinalIgnoreCase) && move?.PlayerId == gameLogData.PlayerPerspective)
                    {
                        string draftedName = null;
                        var segments = desc.Split('|');
                        foreach (var seg in segments)
                        {
                            var s = seg.Trim();
                            const string youPrefix = "You draft ";
                            if (s.StartsWith(youPrefix, StringComparison.OrdinalIgnoreCase))
                            {
                                draftedName = s.Substring(youPrefix.Length).Trim();
                                break;
                            }
                            if (!string.IsNullOrEmpty(move?.PlayerName))
                            {
                                var namePrefix = move.PlayerName + " drafts ";
                                if (s.StartsWith(namePrefix, StringComparison.OrdinalIgnoreCase))
                                {
                                    draftedName = s.Substring(namePrefix.Length).Trim();
                                    break;
                                }
                            }
                            const string draftWord = "draft ";
                            var i2 = s.IndexOf(draftWord, StringComparison.OrdinalIgnoreCase);
                            if (i2 >= 0)
                            {
                                draftedName = s.Substring(i2 + draftWord.Length).Trim();
                                break;
                            }
                        }
                        if (!string.IsNullOrWhiteSpace(draftedName))
                        {
                            var gc = GetOrCreate(draftedName);
                            if (!gc.SeenGen.HasValue) gc.SeenGen = gen.Value;
                            if (!gc.DraftedGen.HasValue) gc.DraftedGen = gen.Value;
                            if (!gc.DrawnGen.HasValue) gc.DrawnGen = gen.Value;
                            if (gc.DrawType == null) gc.DrawType = "Draft";
                            if (gc.DrawReason == null) gc.DrawReason = "Draft";
                        }
                    }

                    // Legacy BoughtGen: POV purchases ("You buy X" or "<POV name> buys X"), supports multi-buy in a single line
                    if (gen.HasValue && !string.IsNullOrWhiteSpace(desc))
                    {
                        var segments = desc.Split('|');
                        foreach (var seg in segments)
                        {
                            var s = seg.Trim();

                            const string youBuy = "You buy ";
                            if (s.StartsWith(youBuy, StringComparison.OrdinalIgnoreCase))
                            {
                                var name = s.Substring(youBuy.Length).Trim();
                                if (!string.IsNullOrWhiteSpace(name))
                                {
                                    var gc = GetOrCreate(name);
                                    if (!gc.SeenGen.HasValue) gc.SeenGen = gen.Value;
                                    if (!gc.BoughtGen.HasValue) gc.BoughtGen = gen.Value;
                                    if (!gc.KeptGen.HasValue) gc.KeptGen = gen.Value;

                                    // Heuristic: if prior draft event exists in same generation within small window, attribute DraftedGen to POV
                                    const int draftWindow = 20;
                                    if (!gc.DraftedGen.HasValue && gen.HasValue && move?.MoveNumber.HasValue == true && draftEvents.TryGetValue(name, out var evts))
                                    {
                                        var matching = evts.Where(e => e.Generation == gen.Value && e.MoveNumber <= move.MoveNumber.Value && (move.MoveNumber.Value - e.MoveNumber) <= draftWindow);
                                        if (matching.Any())
                                        {
                                            var nearest = matching.OrderByDescending(e => e.MoveNumber).First();
                                            gc.DraftedGen = nearest.Generation;
                                            if (!gc.DrawnGen.HasValue) gc.DrawnGen = nearest.Generation;
                                            if (gc.DrawType == null) gc.DrawType = "Draft";
                                            if (gc.DrawReason == null) gc.DrawReason = "Draft";
                                        }
                                    }
                                }
                                continue;
                            }

                            if (!string.IsNullOrEmpty(move?.PlayerName) && move?.PlayerId == gameLogData.PlayerPerspective)
                            {
                                var namePrefix = move.PlayerName + " buys ";
                                if (s.StartsWith(namePrefix, StringComparison.OrdinalIgnoreCase))
                                {
                                    var name = s.Substring(namePrefix.Length).Trim();
                                    if (!string.IsNullOrWhiteSpace(name))
                                    {
                                        var gc = GetOrCreate(name);
                                        if (!gc.SeenGen.HasValue) gc.SeenGen = gen.Value;
                                        if (!gc.BoughtGen.HasValue) gc.BoughtGen = gen.Value;
                                        if (!gc.KeptGen.HasValue) gc.KeptGen = gen.Value;

                                        // Heuristic: attribute DraftedGen to POV if prior draft event exists in same generation within window
                                    const int draftWindow = 20;
                                    if (!gc.DraftedGen.HasValue && gen.HasValue && move?.MoveNumber.HasValue == true && draftEvents.TryGetValue(name, out var evts2))
                                    {
                                        var matching2 = evts2.Where(e => e.Generation == gen.Value && e.MoveNumber <= move.MoveNumber.Value && (move.MoveNumber.Value - e.MoveNumber) <= draftWindow);
                                        if (matching2.Any())
                                        {
                                            var nearest2 = matching2.OrderByDescending(e => e.MoveNumber).First();
                                            gc.DraftedGen = nearest2.Generation;
                                            if (!gc.DrawnGen.HasValue) gc.DrawnGen = nearest2.Generation;
                                            if (gc.DrawType == null) gc.DrawType = "Draft";
                                            if (gc.DrawReason == null) gc.DrawReason = "Draft";
                                        }
                                    }
                                    }
                                }
                            }
                        }
                    }

                    // Legacy DrawnGen: POV explicit draws with names + DrawSession resolution window
                    if (gen.HasValue && move?.PlayerId == gameLogData.PlayerPerspective && desc.IndexOf("draws", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        var segments = desc.Split('|');

                        // Collect all named cards in this draw move
                        var drawnNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        foreach (var seg in segments)
                        {
                            var s = seg.Trim();
                            int idx = s.IndexOf("draws ", StringComparison.OrdinalIgnoreCase);
                            if (idx >= 0)
                            {
                                var after = s.Substring(idx + "draws ".Length).Trim();
                                // If this starts with a digit it's likely "draws 1/2/3 cards" count segment; skip names parse
                                if (!string.IsNullOrWhiteSpace(after) && !char.IsDigit(after[0]))
                                {
                                    foreach (var nm in SplitCardList(after))
                                    {
                                        if (!string.IsNullOrWhiteSpace(nm))
                                            drawnNames.Add(nm);
                                    }
                                }
                            }
                        }

                        // Set SeenGen and DrawnGen for all named cards in this draw
                        foreach (var name in drawnNames)
                        {
                            var gc = GetOrCreate(name);
                            if (!gc.SeenGen.HasValue) gc.SeenGen = gen.Value;
                            if (!gc.DrawnGen.HasValue) gc.DrawnGen = gen.Value;
                        }

                        // Draft detection precedence for draws (covers pass + draft listing cases)
                        bool classifiedAsDraft = false;
                        if (drawnNames.Count > 0)
                        {
                            bool hasResearchDraft = desc.IndexOf("Research draft", StringComparison.OrdinalIgnoreCase) >= 0;
                            bool draws4 = desc.IndexOf("draws 4 card", StringComparison.OrdinalIgnoreCase) >= 0;
                            bool actionPass = string.Equals(move?.ActionType, "pass", StringComparison.OrdinalIgnoreCase);

                            bool prevGenLower = false;
                            if (move?.MoveNumber.HasValue == true && gen.HasValue)
                            {
                                var prevMove = gameLogData.Moves?
                                    .LastOrDefault(m => m != null && m.MoveNumber.HasValue && m.MoveNumber.Value < move.MoveNumber.Value);
                                if (prevMove?.GameState?.Generation.HasValue == true)
                                {
                                    prevGenLower = prevMove.GameState.Generation.Value < gen.Value;
                                }
                            }

                            bool mentionsNewGen = desc.IndexOf("New generation", StringComparison.OrdinalIgnoreCase) >= 0
                                                || desc.IndexOf("starting player for this generation", StringComparison.OrdinalIgnoreCase) >= 0;
                            bool namesCount4 = drawnNames.Count == 4;

                            if (hasResearchDraft || (draws4 && (actionPass || prevGenLower || mentionsNewGen || namesCount4)))
                            {
                                foreach (var nm in drawnNames)
                                {
                                    var gc = GetOrCreate(nm);
                                    if (gc.DrawType == null) gc.DrawType = "Draft";
                                    if (gc.DrawReason == null) gc.DrawReason = "Draft";
                                }
                                classifiedAsDraft = true;
                            }
                        }

                        // Allocate ready pending effects for this player's draws first (strict adjacency to next draw event)
                        bool classifiedAsEffect = false;
                        if (!classifiedAsDraft && drawnNames.Count > 0 && move?.MoveNumber.HasValue == true)
                        {
                            if (!drawEventNoByPlayer.TryGetValue(move.PlayerId, out var curDrawNo)) curDrawNo = 0;
                            var nextDrawEventNo = curDrawNo + 1;

                            if (pendingEffectsByPlayer.TryGetValue(move.PlayerId, out var plist) && plist.Count > 0)
                            {
                                // Select effects that target this upcoming draw event and are ready
                                var readyEffects = plist
                                    .Where(p => p.IsReady && p.Remaining > 0 && p.TargetDrawEventNo.HasValue && p.TargetDrawEventNo.Value == nextDrawEventNo)
                                    .OrderBy(p => p.ReadyMoveNumber ?? 0)
                                    .ToList();

                                // Assign per-card (preserve drawnNames order)
                                var unassigned = drawnNames.ToList();
                                int effectIndex = 0;
                                for (int i = 0; i < unassigned.Count; i++)
                                {
                                    var nm = unassigned[i];
                                    if (effectIndex >= readyEffects.Count) break;
                                    var eff = readyEffects[effectIndex];
                                    if (eff.Remaining > 0)
                                    {
                                        var gc = GetOrCreate(nm);
                                        if (gc.DrawType == null) gc.DrawType = "Effect";
                                        if (gc.DrawReason == null) gc.DrawReason = eff.Reason;
                                        eff.Remaining--;
                                        if (eff.Remaining <= 0) effectIndex++;
                                    }
                                }

                                // Remove consumed effects
                                plist.RemoveAll(p => p.Remaining <= 0);
                                classifiedAsEffect = readyEffects.Count > 0;
                            }

                            // Advance the player's draw-event counter (we handled this drawEvent)
                            drawEventNoByPlayer[move.PlayerId] = nextDrawEventNo;
                        }

                        // Infer DrawType/DrawReason by looking back up to 3 same-player moves when not draft or effect
                        if (!classifiedAsDraft && !classifiedAsEffect && drawnNames.Count > 0 && move?.MoveNumber.HasValue == true)
                        {
                            string inferredType = null;
                            string inferredReason = null;

                            var lookback = gameLogData.Moves?
                                .Where(m => m != null
                                            && m.MoveNumber.HasValue
                                            && m.MoveNumber.Value < move.MoveNumber.Value
                                            && string.Equals(m.PlayerId, move.PlayerId, StringComparison.Ordinal))
                                .OrderByDescending(m => m.MoveNumber.Value)
                                .Take(3)
                                .ToList() ?? new List<GameLogMove>();

                            foreach (var lb in lookback)
                            {
                                var ldesc = lb?.Description ?? string.Empty;

                                // Activation
                                if (string.Equals(lb?.ActionType, "activate_card", StringComparison.OrdinalIgnoreCase))
                                {
                                    var segs = ldesc.Split('|');
                                    foreach (var seg2 in segs)
                                    {
                                        var s2 = seg2.Trim();
                                        var idxAct = s2.IndexOf("activates ", StringComparison.OrdinalIgnoreCase);
                                        if (idxAct >= 0)
                                        {
                                            var name = s2.Substring(idxAct + "activates ".Length).Trim();
                                            if (!string.IsNullOrWhiteSpace(name))
                                            {
                                                inferredType = "Activation";
                                                inferredReason = name;
                                                break;
                                            }
                                        }
                                    }
                                }

                                // PlayCard
                                if (inferredType == null && string.Equals(lb?.ActionType, "play_card", StringComparison.OrdinalIgnoreCase))
                                {
                                    var name = lb?.CardPlayed;
                                    if (string.IsNullOrWhiteSpace(name))
                                    {
                                        var segs = ldesc.Split('|');
                                        foreach (var seg2 in segs)
                                        {
                                            var s2 = seg2.Trim();
                                            const string playsCardPrefix = "plays card ";
                                            var idxPc2 = s2.IndexOf(playsCardPrefix, StringComparison.OrdinalIgnoreCase);
                                            if (idxPc2 >= 0)
                                            {
                                                name = s2.Substring(idxPc2 + playsCardPrefix.Length).Trim();
                                                break;
                                            }
                                        }
                                    }
                                    if (!string.IsNullOrWhiteSpace(name))
                                    {
                                        inferredType = "PlayCard";
                                        inferredReason = name;
                                    }
                                }

                                // Tile - robust handling for various "places ..." segments including special tiles and oceans
                                if (inferredType == null)
                                {
                                    var segs = ldesc.Split('|');
                                    foreach (var seg2 in segs)
                                    {
                                        var s2 = seg2.Trim();

                                        // Require this segment to be a placement phrase and to contain a Hex or coords
                                        if (s2.IndexOf("places", StringComparison.OrdinalIgnoreCase) < 0)
                                            continue;
                                        bool hasHex = s2.IndexOf("Hex", StringComparison.OrdinalIgnoreCase) >= 0;
                                        bool hasCoords = s2.IndexOf("(") >= 0 && s2.IndexOf(")") > s2.IndexOf("(");
                                        if (!(hasHex || hasCoords))
                                            continue;

                                        // Prefer extracting the token that includes map/Hex info
                                        int idxHex = s2.IndexOf("Hex", StringComparison.OrdinalIgnoreCase);
                                        int idxOn = s2.LastIndexOf(" on ", StringComparison.OrdinalIgnoreCase);
                                        int idxInto = s2.LastIndexOf(" into ", StringComparison.OrdinalIgnoreCase);
                                        int idxAt = s2.LastIndexOf(" at ", StringComparison.OrdinalIgnoreCase);

                                        int start = -1;
                                        if (idxHex >= 0 && idxOn >= 0 && idxOn < idxHex)
                                            start = idxOn + " on ".Length; // e.g., "places Ocean on Amazonis Hex 3,8 (3,8)"
                                        else if (idxHex >= 0 && idxInto >= 0 && idxInto < idxHex)
                                            start = idxInto + " into ".Length; // e.g., "places tile ... into Hex at (6,1)"
                                        else if (idxHex >= 0)
                                            start = idxHex; // fallback to start at "Hex ..."
                                        else if (idxAt >= 0)
                                            start = idxAt + " at ".Length; // final fallback to "at (x,y)"

                                        if (start < 0 || start >= s2.Length) continue;

                                        var loc = s2.Substring(start).Trim().TrimEnd('.', ',');
                                        if (string.IsNullOrWhiteSpace(loc)) continue;

                                        // Validate extracted location contains a Hex token or coords
                                        if (loc.IndexOf("Hex", StringComparison.OrdinalIgnoreCase) >= 0
                                            || (loc.IndexOf("(") >= 0 && loc.IndexOf(")") > loc.IndexOf("(")))
                                        {
                                            inferredType = "Tile";
                                            inferredReason = loc;
                                            break;
                                        }
                                    }
                                }

                                if (inferredType != null) break;
                            }

                            if (inferredType != null)
                            {
                                foreach (var nm in drawnNames)
                                {
                                    var gc = GetOrCreate(nm);
                                    if (gc.DrawType == null) gc.DrawType = inferredType;
                                    if (gc.DrawReason == null) gc.DrawReason = inferredReason;
                                }
                            }
                        }

                        // DrawSession resolution: examine next N moves by same player
                        const int sessionWindow = 10;
                        if (drawnNames.Count > 0 && move?.MoveNumber.HasValue == true)
                        {
                            // Subsequent moves by same player with higher move_number
                            var subsequent = gameLogData.Moves?
                                .Where(m => m != null
                                            && m.MoveNumber.HasValue
                                            && m.MoveNumber.Value > move.MoveNumber.Value
                                            && string.Equals(m.PlayerId, move.PlayerId, StringComparison.Ordinal))
                                .OrderBy(m => m.MoveNumber.Value)
                                .Take(sessionWindow)
                                .ToList() ?? new List<GameLogMove>();

                            bool immediateSkip = false;
                            if (subsequent.Count > 0)
                            {
                                var firstSub = subsequent[0];
                                var firstDesc = firstSub?.Description ?? string.Empty;
                                if (firstDesc.IndexOf("skips rest of actions", StringComparison.OrdinalIgnoreCase) >= 0)
                                {
                                    immediateSkip = true;
                                }
                            }

                            if (!immediateSkip)
                            {
                                int resolvedCount = 0;

                                foreach (var sub in subsequent)
                                {
                                    var sdesc = sub?.Description ?? string.Empty;
                                    var sgen = sub?.GameState?.Generation;

                                    if (!sgen.HasValue || string.IsNullOrWhiteSpace(sdesc))
                                        continue;

                                    var parts = sdesc.Split('|');

                                    foreach (var part in parts)
                                    {
                                        var sp = part.Trim();

                                        // Keeps: "You keep X" or "<POV name> keeps X"
                                        const string youKeepPrefix = "You keep ";
                                        if (sp.StartsWith(youKeepPrefix, StringComparison.OrdinalIgnoreCase))
                                        {
                                            var afterK = sp.Substring(youKeepPrefix.Length).Trim();
                                            if (!string.IsNullOrWhiteSpace(afterK))
                                            {
                                                foreach (var nm in SplitCardList(afterK))
                                                {
                                                    if (drawnNames.Contains(nm))
                                                    {
                                                        var gc = GetOrCreate(nm);
                                                        if (!gc.SeenGen.HasValue) gc.SeenGen = sgen.Value;
                                                        if (!gc.KeptGen.HasValue) gc.KeptGen = sgen.Value;
                                                        resolvedCount++;
                                                    }
                                                }
                                            }
                                            continue;
                                        }

                                        if (!string.IsNullOrEmpty(move?.PlayerName))
                                        {
                                            var nameKeepPrefix = move.PlayerName + " keeps ";
                                            if (sp.StartsWith(nameKeepPrefix, StringComparison.OrdinalIgnoreCase))
                                            {
                                                var afterK2 = sp.Substring(nameKeepPrefix.Length).Trim();
                                                // Skip numeric-only "keeps 1 card/s"
                                                var startsWithDigit = afterK2.Length > 0 && char.IsDigit(afterK2[0]);
                                                if (!startsWithDigit && afterK2.IndexOf("card/s", StringComparison.OrdinalIgnoreCase) < 0)
                                                {
                                                    foreach (var nm in SplitCardList(afterK2))
                                                    {
                                                        if (drawnNames.Contains(nm))
                                                        {
                                                            var gc = GetOrCreate(nm);
                                                            if (!gc.SeenGen.HasValue) gc.SeenGen = sgen.Value;
                                                            if (!gc.KeptGen.HasValue) gc.KeptGen = sgen.Value;
                                                            resolvedCount++;
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        // Buys: "You buy X" or "<POV name> buys X"
                                        const string youBuyPrefix = "You buy ";
                                        if (sp.StartsWith(youBuyPrefix, StringComparison.OrdinalIgnoreCase))
                                        {
                                            var afterB = sp.Substring(youBuyPrefix.Length).Trim();
                                            if (!string.IsNullOrWhiteSpace(afterB))
                                            {
                                                foreach (var nm in SplitCardList(afterB))
                                                {
                                                    if (drawnNames.Contains(nm))
                                                    {
                                                        var gc = GetOrCreate(nm);
                                                        if (!gc.SeenGen.HasValue) gc.SeenGen = sgen.Value;
                                                        if (!gc.KeptGen.HasValue) gc.KeptGen = sgen.Value;
                                                        if (!gc.BoughtGen.HasValue) gc.BoughtGen = sgen.Value;
                                                        resolvedCount++;
                                                    }
                                                }
                                            }
                                            continue;
                                        }

                                        if (!string.IsNullOrEmpty(move?.PlayerName))
                                        {
                                            var nameBuyPrefix = move.PlayerName + " buys ";
                                            if (sp.StartsWith(nameBuyPrefix, StringComparison.OrdinalIgnoreCase))
                                            {
                                                var afterB2 = sp.Substring(nameBuyPrefix.Length).Trim();
                                                foreach (var nm in SplitCardList(afterB2))
                                                {
                                                    if (drawnNames.Contains(nm))
                                                    {
                                                        var gc = GetOrCreate(nm);
                                                        if (!gc.SeenGen.HasValue) gc.SeenGen = sgen.Value;
                                                        if (!gc.KeptGen.HasValue) gc.KeptGen = sgen.Value;
                                                        if (!gc.BoughtGen.HasValue) gc.BoughtGen = sgen.Value;
                                                        resolvedCount++;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                // Fallback: if no explicit keeps/buys found in window, consider all drawn cards kept (not bought)
                                if (resolvedCount == 0)
                                {
                                    foreach (var nm in drawnNames)
                                    {
                                        var gc = GetOrCreate(nm);
                                        if (!gc.KeptGen.HasValue)
                                        {
                                            gc.KeptGen = gen.Value; // draw generation
                                        }
                                    }
                                }
                            }
                            // else immediate skip → leave KeptGen null for all drawn cards
                        }
                    }

                    // Legacy KeptGen: POV keeps a subset of drawn cards (e.g., "You keep X" or "<POV name> keeps X")
                    if (gen.HasValue && move?.PlayerId == gameLogData.PlayerPerspective && !string.IsNullOrWhiteSpace(desc))
                    {
                        var segmentsKeep = desc.Split('|');
                        foreach (var segK in segmentsKeep)
                        {
                            var sK = segK.Trim();

                            // Pattern 1: "You keep A, B, C"
                            const string youKeepPrefix = "You keep ";
                            if (sK.StartsWith(youKeepPrefix, StringComparison.OrdinalIgnoreCase))
                            {
                                var after = sK.Substring(youKeepPrefix.Length).Trim();
                                if (!string.IsNullOrWhiteSpace(after))
                                {
                                    foreach (var name in SplitCardList(after))
                                    {
                                        var gc = GetOrCreate(name);
                                        if (!gc.SeenGen.HasValue) gc.SeenGen = gen.Value;
                                        if (!gc.KeptGen.HasValue) gc.KeptGen = gen.Value;
                                    }
                                }
                                continue;
                            }

                            // Pattern 2: "<POV name> keeps <names>" (avoid numeric-only "keeps 1 card/s")
                            if (!string.IsNullOrEmpty(move?.PlayerName))
                            {
                                var nameKeepPrefix = move.PlayerName + " keeps ";
                                if (sK.StartsWith(nameKeepPrefix, StringComparison.OrdinalIgnoreCase))
                                {
                                    var after = sK.Substring(nameKeepPrefix.Length).Trim();
                                    // Avoid count-only keeps like "1 card/s"
                                    var startsWithDigit = after.Length > 0 && char.IsDigit(after[0]);
                                    if (!startsWithDigit && after.IndexOf("card/s", StringComparison.OrdinalIgnoreCase) < 0)
                                    {
                                        foreach (var name in SplitCardList(after))
                                        {
                                            var gc = GetOrCreate(name);
                                            if (!gc.SeenGen.HasValue) gc.SeenGen = gen.Value;
                                            if (!gc.KeptGen.HasValue) gc.KeptGen = gen.Value;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                }
            }

            // VP scored from final state for all players
            var finalMove = gameLogData.Moves != null && gameLogData.Moves.Count > 0
                ? gameLogData.Moves[gameLogData.Moves.Count - 1]
                : null;

            if (finalMove?.GameState?.PlayerVp != null)
            {
                foreach (var playerVpEntry in finalMove.GameState.PlayerVp)
                {
                    var playerIdStr = playerVpEntry.Key;
                    var playerVp = playerVpEntry.Value;
                    
                    if (int.TryParse(playerIdStr, out int playerId) && playerVp?.Details?.Cards != null)
                    {
                        foreach (var kv in playerVp.Details.Cards)
                        {
                            var name = kv.Key;
                            var vp = kv.Value?.Vp;

                            var gc = GetOrCreateForPlayer(playerId, name);
                            gc.VpScored = vp;
                        }
                    }
                }
            }

            // For cards that were played but have no per-card VP entry, treat as 0 VP rather than null
            foreach (var gc in results.Values)
            {
                if (gc.PlayedGen.HasValue && gc.VpScored == null)
                {
                    gc.VpScored = 0;
                }
            }

            // FINAL NORMALIZATION: Enforce invariants
            NormalizeCardInvariants(results);

            return results.Values.ToList();
        }

        // Helper: process the new JSON card_options for all players
        private static void ProcessCardOptions(
            GameLogData data,
            GameLogMove move,
            int gen,
            Dictionary<string, List<PendingEffect>> pendingEffectsByPlayer,
            Dictionary<string, int> drawEventNoByPlayer,
            Func<int, string, GameCard> getOrCreateForPlayer)
        {
            if (move?.CardOptions == null || move.CardOptions.Count == 0) return;
            var desc = move.Description ?? string.Empty;

            bool isStartOfDraft = desc.IndexOf("drafts 4 cards", StringComparison.OrdinalIgnoreCase) >= 0;
            bool hasActionTypeDraft = move.ActionType == "draft";
            bool hasResearchDraft = desc.IndexOf("Research draft", StringComparison.OrdinalIgnoreCase) >= 0;
            bool draws4Any = desc.IndexOf("draws 4 card", StringComparison.OrdinalIgnoreCase) >= 0;
            bool actionPass = string.Equals(move.ActionType, "pass", StringComparison.OrdinalIgnoreCase);

            bool prevGenLower = false;
            if (move?.MoveNumber.HasValue == true && data?.Moves != null)
            {
                var prevMove = data.Moves.LastOrDefault(m => m != null && m.MoveNumber.HasValue && m.MoveNumber.Value < move.MoveNumber.Value);
                if (prevMove?.GameState?.Generation.HasValue == true)
                    prevGenLower = prevMove.GameState.Generation.Value < gen;
            }

            bool mentionsNewGen = desc.IndexOf("New generation", StringComparison.OrdinalIgnoreCase) >= 0
                               || desc.IndexOf("starting player for this generation", StringComparison.OrdinalIgnoreCase) >= 0;

            foreach (var kvp in move.CardOptions)
            {
                var playerIdStr = kvp.Key;
                var cardList = kvp.Value;
                if (!int.TryParse(playerIdStr, out int playerId) || cardList == null || cardList.Count == 0)
                    continue;

                var drawnNames = new List<string>();
                foreach (var cardName in cardList)
                {                    
                    if (string.IsNullOrWhiteSpace(cardName)) continue;
                    drawnNames.Add(cardName);
                    var gc = getOrCreateForPlayer(playerId, cardName);
                    if (!gc.SeenGen.HasValue) gc.SeenGen = gen;
                    if (!gc.DrawnGen.HasValue) gc.DrawnGen = gen;
                }

                bool optionCount4 = cardList.Count == 4;
                bool isDraft = isStartOfDraft || hasActionTypeDraft || hasResearchDraft || (draws4Any && (actionPass || prevGenLower || mentionsNewGen || optionCount4));
                bool classifiedAsDraft = false;
                if (isDraft && drawnNames.Count > 0)
                {
                    foreach (var nm in drawnNames)
                    {
                        var gc = getOrCreateForPlayer(playerId, nm);
                        if (gc.DrawType == null) gc.DrawType = "Draft";
                        if (gc.DrawReason == null) gc.DrawReason = "Draft";
                    }
                    classifiedAsDraft = true;
                }

                bool classifiedAsEffect = false;
                if (!classifiedAsDraft && drawnNames.Count > 0 && move?.MoveNumber.HasValue == true)
                {
                    if (!drawEventNoByPlayer.TryGetValue(playerIdStr, out var curDrawNo)) curDrawNo = 0;
                    var nextDrawEventNo = curDrawNo + 1;

                    if (pendingEffectsByPlayer.TryGetValue(playerIdStr, out var plist) && plist.Count > 0)
                    {
                        var readyEffects = plist
                            .Where(p => p.IsReady && p.Remaining > 0 && p.TargetDrawEventNo.HasValue && p.TargetDrawEventNo.Value == nextDrawEventNo)
                            .OrderBy(p => p.ReadyMoveNumber ?? 0)
                            .ToList();

                        int effectIndex = 0;
                        for (int i = 0; i < drawnNames.Count && effectIndex < readyEffects.Count; i++)
                        {
                            var nm = drawnNames[i];
                            var eff = readyEffects[effectIndex];
                            if (eff.Remaining > 0)
                            {
                                var gc = getOrCreateForPlayer(playerId, nm);
                                if (gc.DrawType == null) gc.DrawType = "Effect";
                                if (gc.DrawReason == null) gc.DrawReason = eff.Reason;
                                eff.Remaining--;
                                if (eff.Remaining <= 0) effectIndex++;
                            }
                        }

                        plist.RemoveAll(p => p.Remaining <= 0);
                        classifiedAsEffect = readyEffects.Count > 0;
                    }

                    drawEventNoByPlayer[playerIdStr] = nextDrawEventNo;
                }

                if (!classifiedAsDraft && !classifiedAsEffect && drawnNames.Count > 0 && move?.MoveNumber.HasValue == true && data?.Moves != null)
                {
                    string inferredType = null;
                    string inferredReason = null;

                    var lookback = data.Moves
                        .Where(m => m != null
                                    && m.MoveNumber.HasValue
                                    && m.MoveNumber.Value < move.MoveNumber.Value
                                    && string.Equals(m.PlayerId, playerIdStr, StringComparison.Ordinal))
                        .OrderByDescending(m => m.MoveNumber.Value)
                        .Take(3)
                        .ToList();

                    foreach (var lb in lookback)
                    {
                        var ldesc = lb?.Description ?? string.Empty;

                        if (string.Equals(lb?.ActionType, "activate_card", StringComparison.OrdinalIgnoreCase))
                        {
                            var segs = ldesc.Split('|');
                            foreach (var seg2 in segs)
                            {
                                var s2 = seg2.Trim();
                                var idxAct = s2.IndexOf("activates ", StringComparison.OrdinalIgnoreCase);
                                if (idxAct >= 0)
                                {
                                    var name = s2.Substring(idxAct + "activates ".Length).Trim();
                                    if (!string.IsNullOrWhiteSpace(name))
                                    {
                                        inferredType = "Activation";
                                        inferredReason = name;
                                        break;
                                    }
                                }
                            }
                        }

                        if (inferredType == null && string.Equals(lb?.ActionType, "play_card", StringComparison.OrdinalIgnoreCase))
                        {
                            var name = lb?.CardPlayed;
                            if (string.IsNullOrWhiteSpace(name))
                            {
                                var segs = ldesc.Split('|');
                                foreach (var seg2 in segs)
                                {
                                    var s2 = seg2.Trim();
                                    const string playsCardPrefix = "plays card ";
                                    var idxPc2 = s2.IndexOf(playsCardPrefix, StringComparison.OrdinalIgnoreCase);
                                    if (idxPc2 >= 0)
                                    {
                                        name = s2.Substring(idxPc2 + playsCardPrefix.Length).Trim();
                                        break;
                                    }
                                }
                            }
                            if (!string.IsNullOrWhiteSpace(name))
                            {
                                inferredType = "PlayCard";
                                inferredReason = name;
                            }
                        }

                        if (inferredType == null)
                        {
                            var segs = ldesc.Split('|');
                            foreach (var seg2 in segs)
                            {
                                var s2 = seg2.Trim();
                                if (s2.IndexOf("places", StringComparison.OrdinalIgnoreCase) < 0)
                                    continue;
                                bool hasHex = s2.IndexOf("Hex", StringComparison.OrdinalIgnoreCase) >= 0;
                                bool hasCoords = s2.IndexOf("(") >= 0 && s2.IndexOf(")") > s2.IndexOf("(");
                                if (!(hasHex || hasCoords))
                                    continue;

                                int idxHex = s2.IndexOf("Hex", StringComparison.OrdinalIgnoreCase);
                                int idxOn = s2.LastIndexOf(" on ", StringComparison.OrdinalIgnoreCase);
                                int idxInto = s2.LastIndexOf(" into ", StringComparison.OrdinalIgnoreCase);
                                int idxAt = s2.LastIndexOf(" at ", StringComparison.OrdinalIgnoreCase);

                                int start = -1;
                                if (idxHex >= 0 && idxOn >= 0 && idxOn < idxHex)
                                    start = idxOn + " on ".Length;
                                else if (idxHex >= 0 && idxInto >= 0 && idxInto < idxHex)
                                    start = idxInto + " into ".Length;
                                else if (idxHex >= 0)
                                    start = idxHex;
                                else if (idxAt >= 0)
                                    start = idxAt + " at ".Length;

                                if (start < 0 || start >= s2.Length) continue;

                                var loc = s2.Substring(start).Trim().TrimEnd('.', ',');
                                if (string.IsNullOrWhiteSpace(loc)) continue;

                                if (loc.IndexOf("Hex", StringComparison.OrdinalIgnoreCase) >= 0
                                    || (loc.IndexOf("(") >= 0 && s2.IndexOf(")") > s2.IndexOf("(")))
                                {
                                    inferredType = "Tile";
                                    inferredReason = loc;
                                    break;
                                }
                            }
                        }

                        if (inferredType != null) break;
                    }

                    if (inferredType != null)
                    {
                        foreach (var nm in drawnNames)
                        {
                            var gc = getOrCreateForPlayer(playerId, nm);
                            if (gc.DrawType == null) gc.DrawType = inferredType;
                            if (gc.DrawReason == null) gc.DrawReason = inferredReason;
                        }
                    }
                }
            }
        }

        // Helper: process the new JSON card_drafted for the drafting player
        private static void ProcessCardDrafted(
            GameLogData data,
            GameLogMove move,
            int gen,
            Dictionary<string, List<(int MoveNumber, int Generation, string PlayerId)>> draftEvents,
            Func<int, string, GameCard> getOrCreateForPlayer)
        {
            if (string.IsNullOrWhiteSpace(move?.CardDrafted)) return;
            if (!int.TryParse(move.PlayerId, out int draftingPlayerId)) return;

            if (data.Players[draftingPlayerId.ToString()].StartingHand.Corporations.Contains(move.CardDrafted))
            {
                return; // Skip corporations
            }

            var gc = getOrCreateForPlayer(draftingPlayerId, move.CardDrafted);
            if (!gc.SeenGen.HasValue) gc.SeenGen = gen;
            if (!gc.DrawnGen.HasValue) gc.DrawnGen = gen;
            if (!gc.DraftedGen.HasValue) gc.DraftedGen = gen;
            if (gc.DrawType == null) gc.DrawType = "Draft";
            if (gc.DrawReason == null) gc.DrawReason = "Draft";

            if (move?.MoveNumber.HasValue == true)
            {
                if (!draftEvents.TryGetValue(move.CardDrafted, out var lst))
                {
                    lst = new List<(int MoveNumber, int Generation, string PlayerId)>();
                    draftEvents[move.CardDrafted] = lst;
                }
                lst.Add((move.MoveNumber.Value, gen, move.PlayerId));
            }
        }

        // Helper: process the new JSON cards_kept for all players
        private static void ProcessCardsKept(
            GameLogData data,
            GameLogMove move,
            int gen,
            Func<int, string, GameCard> getOrCreateForPlayer)
        {
            if (move?.CardsKept == null || move.CardsKept.Count == 0) return;

            foreach (var kvp in move.CardsKept)
            {
                if (!int.TryParse(kvp.Key, out int keepingPlayerId)) continue;
                var keptCardList = kvp.Value;
                if (keptCardList == null) continue;

                foreach (var cardName in keptCardList)
                {
                    if (data.Players[keepingPlayerId.ToString()].StartingHand.Corporations.Contains(cardName))
                    {
                        continue; // Skip corporations
                    }

                    if (string.IsNullOrWhiteSpace(cardName)) continue;
                    var gc = getOrCreateForPlayer(keepingPlayerId, cardName);
                    if (!gc.SeenGen.HasValue) gc.SeenGen = gen;
                    if (!gc.KeptGen.HasValue) gc.KeptGen = gen;
                    if (!gc.DrawnGen.HasValue) gc.DrawnGen = gen; // kept implies drawn

                    if (data.Players[keepingPlayerId.ToString()].StartingHand != null)
                    {
                        if (data.Players[keepingPlayerId.ToString()].StartingHand.Preludes.Contains(cardName))
                        {
                            gc.DrawType = "StartingHand";
                            gc.DrawReason = "Starting Hand";
                        }
                    }
                }
            }
        }

        // Helper: final normalization to enforce invariants across all results
        private static void NormalizeCardInvariants(Dictionary<string, GameCard> results)
        {
            foreach (var gc in results.Values)
            {
                if (gc.KeptGen.HasValue && !gc.DrawnGen.HasValue)
                {
                    gc.DrawnGen = gc.KeptGen.Value;
                }

                if (gc.PlayedGen.HasValue)
                {
                    if (!gc.KeptGen.HasValue)
                    {
                        gc.KeptGen = gc.PlayedGen.Value;
                    }
                    if (!gc.DrawnGen.HasValue)
                    {
                        gc.DrawnGen = gc.PlayedGen.Value;
                    }
                }
            }
        }

        // Helper: SeenGen from any "draws <list>" that explicitly lists names
        private static void ProcessSeenFromNamedDrawsText(
            GameLogData data,
            GameLogMove move,
            int gen,
            string desc,
            Func<string, GameCard> getOrCreatePov)
        {
            if (desc.IndexOf("draws", StringComparison.OrdinalIgnoreCase) < 0) return;

            var segments = desc.Split('|');
            foreach (var seg in segments)
            {
                var s = seg.Trim();
                int idx = s.IndexOf("draws ", StringComparison.OrdinalIgnoreCase);
                if (idx >= 0)
                {
                    var after = s.Substring(idx + "draws ".Length).Trim();
                    if (!string.IsNullOrWhiteSpace(after) && !char.IsDigit(after[0]))
                    {
                        foreach (var name in (after.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries).Select(x => x.Trim())))
                        {
                            if (string.IsNullOrWhiteSpace(name)) continue;
                            var gc = getOrCreatePov(name);
                            if (!gc.SeenGen.HasValue) gc.SeenGen = gen;
                        }
                    }
                }
            }
        }

        // Helper: SeenGen and Reveal handling from "reveals <Card>:" phrases (any player)
        private static void ProcessReveals(
            GameLogData data,
            GameLogMove move,
            int gen,
            string desc,
            Func<string, GameCard> getOrCreatePov)
        {
            if (desc.IndexOf("reveals ", StringComparison.OrdinalIgnoreCase) < 0) return;

            var segmentsReveal = desc.Split('|');
            foreach (var segR in segmentsReveal)
            {
                var sR = segR.Trim();
                int searchStart = 0;
                while (true)
                {
                    int idxRev = sR.IndexOf("reveals ", searchStart, StringComparison.OrdinalIgnoreCase);
                    if (idxRev < 0) break;
                    int nameStart = idxRev + "reveals ".Length;
                    int colonIdx = sR.IndexOf(':', nameStart);
                    if (colonIdx < 0) break;
                    var name = sR.Substring(nameStart, colonIdx - nameStart).Trim();
                    var after = sR.Substring(colonIdx + 1).Trim();
                    if (!string.IsNullOrWhiteSpace(name))
                    {
                        var gc = getOrCreatePov(name);
                        if (!gc.SeenGen.HasValue) gc.SeenGen = gen;

                        if (move?.PlayerId != null && data?.PlayerPerspective == move.PlayerId)
                        {
                            if (after.IndexOf("has a Space tag", StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                if (!gc.DrawnGen.HasValue) gc.DrawnGen = gen;
                                if (!gc.KeptGen.HasValue) gc.KeptGen = gen;
                                if (gc.DrawType == null) gc.DrawType = "Reveal";
                                if (gc.DrawReason == null) gc.DrawReason = "Space tag";
                            }
                            else if (after.IndexOf("has a Plant tag", StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                if (!gc.DrawnGen.HasValue) gc.DrawnGen = gen;
                                if (!gc.KeptGen.HasValue) gc.KeptGen = gen;
                                if (gc.DrawType == null) gc.DrawType = "Reveal";
                                if (gc.DrawReason == null) gc.DrawReason = "Plant tag";
                            }
                        }
                    }
                    searchStart = colonIdx + 1;
                }
            }
        }

        // Helper: SeenGen from any player's played card (including opponents)
        private static void ProcessSeenFromAnyPlay(
            GameLogMove move,
            int gen,
            string desc,
            Func<string, GameCard> getOrCreatePov)
        {
            if (!(string.Equals(move?.ActionType, "play_card", StringComparison.OrdinalIgnoreCase) || desc.IndexOf("plays card ", StringComparison.OrdinalIgnoreCase) >= 0))
                return;

            string playedAny = move?.CardPlayed;
            if (string.IsNullOrWhiteSpace(playedAny))
            {
                var segmentsPlay = desc.Split('|');
                foreach (var segP in segmentsPlay)
                {
                    var sP = segP.Trim();
                    const string playsCardPrefix = "plays card ";
                    int idxPc = sP.IndexOf(playsCardPrefix, StringComparison.OrdinalIgnoreCase);
                    if (idxPc >= 0)
                    {
                        playedAny = sP.Substring(idxPc + playsCardPrefix.Length).Trim();
                        break;
                    }
                }
            }
            if (!string.IsNullOrWhiteSpace(playedAny))
            {
                var gc = getOrCreatePov(playedAny);
                if (!gc.SeenGen.HasValue) gc.SeenGen = gen;
            }
        }

        // Helper: enqueue pending effect entries for play_card moves that mention trigger effects that draw cards
        private static void EnqueueTriggeredCardDrawEffects(
            GameLogMove move,
            string desc,
            Dictionary<string, List<PendingEffect>> pendingEffectsByPlayer,
            Dictionary<string, int> drawEventNoByPlayer)
        {
            if (!string.Equals(move?.ActionType, "play_card", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(desc))
                return;

            var segmentsTrig = desc.Split('|');
            var allowlist = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Olympus Conference", "Mars University", "Point Luna" };
            foreach (var segTrig in segmentsTrig)
            {
                var sTrig = segTrig.Trim();
                int idxTrig = sTrig.IndexOf("triggered effect of ", StringComparison.OrdinalIgnoreCase);
                if (idxTrig >= 0)
                {
                    int start = idxTrig + "triggered effect of ".Length;
                    int end = sTrig.IndexOf(':', start);
                    if (end < 0) end = sTrig.IndexOf('|', start);
                    var name = end >= 0 ? sTrig.Substring(start, end - start).Trim() : sTrig.Substring(start).Trim();
                    if (!string.IsNullOrWhiteSpace(name) && allowlist.Contains(name))
                    {
                        bool requiresSignal = !string.Equals(name, "Point Luna", StringComparison.OrdinalIgnoreCase);
                        bool isReady = string.Equals(name, "Point Luna", StringComparison.OrdinalIgnoreCase);
                        if (!pendingEffectsByPlayer.TryGetValue(move.PlayerId, out var pendingEffects))
                        {
                            pendingEffects = new List<PendingEffect>();
                            pendingEffectsByPlayer[move.PlayerId] = pendingEffects;
                        }
                        int nextDrawNo = drawEventNoByPlayer.TryGetValue(move.PlayerId, out var curDrawNo) ? (curDrawNo + 1) : 1;
                        int? readyMn = isReady ? (move.MoveNumber ?? 0) : (int?)null;
                        int? targetDraw = isReady ? nextDrawNo : (int?)null;
                        pendingEffects.Add(new PendingEffect(name, null, requiresSignal, isReady, 1, move.MoveNumber ?? 0, readyMn, targetDraw));
                    }
                }
            }
        }

        // Helper: detect immediate signals (resource removal or discards) to mark pending effects ready
        private static void DetectCardDrawEffects(
            GameLogMove move,
            string desc,
            Dictionary<string, List<PendingEffect>> pendingEffectsByPlayer,
            Dictionary<string, int> drawEventNoByPlayer)
        {
            if (string.IsNullOrWhiteSpace(desc)) return;

            // Pattern: "removes <Resource> from <CardName>"
            int idxRem = desc.IndexOf("removes ", StringComparison.OrdinalIgnoreCase);
            if (idxRem >= 0)
            {
                int idxFrom = desc.IndexOf(" from ", idxRem, StringComparison.OrdinalIgnoreCase);
                if (idxFrom > idxRem)
                {
                    int start = idxFrom + " from ".Length;
                    int end = desc.IndexOf('|', start);
                    var name = end >= 0 ? desc.Substring(start, end - start).Trim() : desc.Substring(start).Trim();
                    if (!string.IsNullOrWhiteSpace(name) && pendingEffectsByPlayer.TryGetValue(move.PlayerId, out var lst2))
                    {
                        foreach (var pe in lst2.Where(p => string.Equals(p.Reason, name, StringComparison.OrdinalIgnoreCase) && p.RequiresSignal && !p.IsReady))
                        {
                            pe.IsReady = true;
                            pe.ReadyMoveNumber = move.MoveNumber ?? 0;
                            int tgt = drawEventNoByPlayer.TryGetValue(move.PlayerId, out var cur) ? (cur + 1) : 1;
                            pe.TargetDrawEventNo = tgt;
                        }
                    }
                }
            }

            // Pattern: "discards 1 card/s" or "discards a card" (Mars University style)
            if ((desc.IndexOf("discards 1 card/s", StringComparison.OrdinalIgnoreCase) >= 0
                 || desc.IndexOf("discards a card", StringComparison.OrdinalIgnoreCase) >= 0)
                && pendingEffectsByPlayer.TryGetValue(move.PlayerId, out var lst3))
            {
                foreach (var pe in lst3.Where(p => string.Equals(p.Reason, "Mars University", StringComparison.OrdinalIgnoreCase) && p.RequiresSignal && !p.IsReady))
                {
                    pe.IsReady = true;
                    pe.ReadyMoveNumber = move.MoveNumber ?? 0;
                    int tgt = drawEventNoByPlayer.TryGetValue(move.PlayerId, out var cur2) ? (cur2 + 1) : 1;
                    pe.TargetDrawEventNo = tgt;
                }
            }
        }

        // Helper: legacy record of draft events with POV seen/drawn marking
        private static void RecordDraftEventsLegacy(
            GameLogData data,
            GameLogMove move,
            int gen,
            string desc,
            Dictionary<string, List<(int MoveNumber, int Generation, string PlayerId)>> draftEvents,
            Func<string, GameCard> getOrCreatePov)
        {
            if (!(string.Equals(move?.ActionType, "draft_card", StringComparison.OrdinalIgnoreCase) || string.Equals(move?.ActionType, "draft", StringComparison.OrdinalIgnoreCase)))
                return;

            string draftedNameAny = null;
            var segmentsAny = desc.Split('|');
            foreach (var segAny in segmentsAny)
            {
                var sAny = segAny.Trim();
                const string youPrefixAny = "You draft ";
                if (sAny.StartsWith(youPrefixAny, StringComparison.OrdinalIgnoreCase))
                {
                    draftedNameAny = sAny.Substring(youPrefixAny.Length).Trim();
                    break;
                }

                var idxDrafts = sAny.IndexOf(" drafts ", StringComparison.OrdinalIgnoreCase);
                if (idxDrafts > 0)
                {
                    draftedNameAny = sAny.Substring(idxDrafts + " drafts ".Length).Trim();
                    break;
                }

                const string draftWordAny = "draft ";
                var i2Any = sAny.IndexOf(draftWordAny, StringComparison.OrdinalIgnoreCase);
                if (i2Any >= 0)
                {
                    draftedNameAny = sAny.Substring(i2Any + draftWordAny.Length).Trim();
                    break;
                }
            }

            if(draftedNameAny != null && 
                (draftedNameAny.Contains("card ") || 
                draftedNameAny.Contains("2 cards") ||
                draftedNameAny.Contains("3 cards") ||
                draftedNameAny.Contains("4 cards") ||
                draftedNameAny.Contains("8 cards")))
            {
                return;
            }

            if (!string.IsNullOrWhiteSpace(draftedNameAny) && move?.MoveNumber.HasValue == true)
            {
                if (!draftEvents.TryGetValue(draftedNameAny, out var lst))
                {
                    lst = new List<(int MoveNumber, int Generation, string PlayerId)>();
                    draftEvents[draftedNameAny] = lst;
                }
                lst.Add((move.MoveNumber.Value, gen, move.PlayerId));

                // Treat drafted cards by any player as seen by POV (legacy behavior)
                var gcSeen = getOrCreatePov(draftedNameAny);
                if (!gcSeen.SeenGen.HasValue) gcSeen.SeenGen = gen;
                if (!gcSeen.DrawnGen.HasValue) gcSeen.DrawnGen = gen;
                if (gcSeen.DrawType == null) gcSeen.DrawType = "Draft";
                if (gcSeen.DrawReason == null) gcSeen.DrawReason = "Draft";
            }
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

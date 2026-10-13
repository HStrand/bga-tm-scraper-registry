using System;
using System.Collections.Generic;
using BgaTmScraperRegistry.Models;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry.Services
{
    /// <summary>
    /// The rows GameStatsService derives from one game log, as one JSON document per upload.
    ///
    /// Written to the "stats" blob container as {WrittenAt:yyyy-MM-dd}/{TableId}_{PlayerPerspective}.json.
    /// The nightly job on the VM (parquet_api/build_stats_parquet.py) folds new documents into the
    /// parquet files the Parquet API serves, replacing rows by the same keys the SQL path uses:
    /// gamestats, gamemilestones, gameplayerawards, parameterchanges, gamecitylocations and
    /// gamegreenerylocations by TableId; gameplayerstats, startinghand* and gamecards by
    /// (TableId, PlayerId). Keys of Tables are the parquet file names, row property names the
    /// SQL column names, so the document needs no mapping on the VM. Additive changes only.
    /// </summary>
    public class StatsDocument
    {
        public int TableId { get; set; }
        public string PlayerPerspective { get; set; }
        public DateTime WrittenAt { get; set; }
        public string ScraperVersion { get; set; }
        public string ResolvedMap { get; set; }
        public Dictionary<string, object> Tables { get; set; }

        public static StatsDocument Build(
            GameLogData gameLogData,
            GameStats gameStats,
            List<GamePlayerStats> playerStats,
            List<StartingHandCorporations> startingHandCorporations,
            List<StartingHandPreludes> startingHandPreludes,
            List<StartingHandCards> startingHandCards,
            List<GameMilestone> gameMilestones,
            List<GamePlayerAward> gamePlayerAwards,
            List<ParameterChange> parameterChanges,
            List<GameCard> gameCards,
            List<GameCityLocation> cityLocations,
            List<GameGreeneryLocation> greeneryLocations,
            string resolvedMap)
        {
            return new StatsDocument
            {
                TableId = gameStats.TableId,
                PlayerPerspective = gameLogData?.PlayerPerspective,
                WrittenAt = DateTime.UtcNow,
                ScraperVersion = gameLogData?.Metadata?.ScraperVersion,
                ResolvedMap = resolvedMap,
                Tables = new Dictionary<string, object>
                {
                    ["gamestats"] = new List<GameStats> { gameStats },
                    ["gameplayerstats"] = playerStats ?? new List<GamePlayerStats>(),
                    ["startinghandcorporations"] = startingHandCorporations ?? new List<StartingHandCorporations>(),
                    ["startinghandpreludes"] = startingHandPreludes ?? new List<StartingHandPreludes>(),
                    ["startinghandcards"] = startingHandCards ?? new List<StartingHandCards>(),
                    ["gamemilestones"] = gameMilestones ?? new List<GameMilestone>(),
                    ["gameplayerawards"] = gamePlayerAwards ?? new List<GamePlayerAward>(),
                    ["parameterchanges"] = parameterChanges ?? new List<ParameterChange>(),
                    ["gamecards"] = gameCards ?? new List<GameCard>(),
                    ["gamecitylocations"] = cityLocations ?? new List<GameCityLocation>(),
                    ["gamegreenerylocations"] = greeneryLocations ?? new List<GameGreeneryLocation>(),
                }
            };
        }

        public string BlobPath()
        {
            var perspective = string.IsNullOrWhiteSpace(PlayerPerspective) ? "0" : PlayerPerspective;
            return $"{WrittenAt:yyyy-MM-dd}/{TableId}_{perspective}.json";
        }

        public string ToJson()
        {
            return JsonConvert.SerializeObject(this, new JsonSerializerSettings
            {
                Formatting = Formatting.None,
                NullValueHandling = NullValueHandling.Include,
                DateFormatHandling = DateFormatHandling.IsoDateFormat,
                DateTimeZoneHandling = DateTimeZoneHandling.Utc,
            });
        }
    }
}

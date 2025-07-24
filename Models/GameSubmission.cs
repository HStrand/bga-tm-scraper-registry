using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry.Models
{
    public class GameSubmission
    {
        [JsonProperty("player_id")]
        [Required]
        public string PlayerId { get; set; }

        [JsonProperty("scraped_at")]
        [Required]
        public DateTime ScrapedAt { get; set; }

        [JsonProperty("games")]
        [Required]
        public List<GameData> Games { get; set; }
    }

    public class GameData
    {
        [JsonProperty("table_id")]
        [Required]
        public string TableId { get; set; }

        [JsonProperty("raw_datetime")]
        public string RawDateTime { get; set; }

        [JsonProperty("parsed_datetime")]
        public DateTime? ParsedDateTime { get; set; }

        [JsonProperty("game_mode")]
        public string GameMode { get; set; }

        [JsonProperty("version")]
        [Required]
        public string Version { get; set; }

        [JsonProperty("player_perspective")]
        [Required]
        public string PlayerPerspective { get; set; }

        [JsonProperty("scraped_at")]
        [Required]
        public DateTime ScrapedAt { get; set; }

        [JsonProperty("map")]
        public string Map { get; set; }

        [JsonProperty("prelude_on")]
        public bool PreludeOn { get; set; }

        [JsonProperty("colonies_on")]
        public bool ColoniesOn { get; set; }

        [JsonProperty("corporate_era_on")]
        public bool CorporateEraOn { get; set; }

        [JsonProperty("draft_on")]
        public bool DraftOn { get; set; }

        [JsonProperty("beginners_corporations_on")]
        public bool BeginnersCorporationsOn { get; set; }

        [JsonProperty("game_speed")]
        public string GameSpeed { get; set; }

        [JsonProperty("players")]
        [Required]
        public List<PlayerData> Players { get; set; }
    }

    public class PlayerData
    {
        [JsonProperty("player_name")]
        [Required]
        public string PlayerName { get; set; }

        [JsonProperty("player_id")]
        [Required]
        public string PlayerId { get; set; }

        [JsonProperty("position")]
        [Required]
        public int Position { get; set; }

        [JsonProperty("arena_points")]
        public int? ArenaPoints { get; set; }

        [JsonProperty("arena_points_change")]
        public int? ArenaPointsChange { get; set; }

        [JsonProperty("game_rank")]
        public int? GameRank { get; set; }

        [JsonProperty("game_rank_change")]
        public int? GameRankChange { get; set; }
    }
}

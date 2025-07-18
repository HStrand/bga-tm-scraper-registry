using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry.Models
{
    public class SingleGameData
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

        [JsonProperty("players")]
        [Required]
        public List<PlayerData> Players { get; set; }
    }
}

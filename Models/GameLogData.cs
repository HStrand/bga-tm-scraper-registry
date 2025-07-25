using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry.Models
{
    public class GameLogData
    {
        [JsonProperty("replay_id")]
        [Required]
        public string ReplayId { get; set; }

        [JsonProperty("player_perspective")]
        [Required]
        public string PlayerPerspective { get; set; }

        [JsonProperty("game_date")]
        public string GameDate { get; set; }

        [JsonProperty("game_duration")]
        public string GameDuration { get; set; }

        [JsonProperty("winner")]
        public string Winner { get; set; }

        [JsonProperty("generations")]
        public int? Generations { get; set; }

        [JsonProperty("map")]
        public string Map { get; set; }

        [JsonProperty("prelude_on")]
        public bool? PreludeOn { get; set; }

        [JsonProperty("colonies_on")]
        public bool? ColoniesOn { get; set; }

        [JsonProperty("corporate_era_on")]
        public bool? CorporateEraOn { get; set; }

        [JsonProperty("draft_on")]
        public bool? DraftOn { get; set; }

        [JsonProperty("beginners_corporations_on")]
        public bool? BeginnersCorporationsOn { get; set; }

        [JsonProperty("game_speed")]
        public string GameSpeed { get; set; }

        [JsonProperty("players")]
        [Required]
        public Dictionary<string, GameLogPlayer> Players { get; set; }

        [JsonProperty("moves")]
        [Required]
        public List<GameLogMove> Moves { get; set; }

        [JsonProperty("metadata")]
        public GameLogMetadata Metadata { get; set; }
    }

    public class GameLogPlayer
    {
        [JsonProperty("player_id")]
        public string PlayerId { get; set; }

        [JsonProperty("player_name")]
        public string PlayerName { get; set; }

        [JsonProperty("corporation")]
        public string Corporation { get; set; }

        [JsonProperty("final_vp")]
        public int? FinalVp { get; set; }

        [JsonProperty("final_tr")]
        public int? FinalTr { get; set; }

        [JsonProperty("vp_breakdown")]
        public Dictionary<string, object> VpBreakdown { get; set; }

        [JsonProperty("cards_played")]
        public List<string> CardsPlayed { get; set; }

        [JsonProperty("milestones_claimed")]
        public List<string> MilestonesClaimed { get; set; }

        [JsonProperty("awards_funded")]
        public List<string> AwardsFunded { get; set; }

        [JsonProperty("elo_data")]
        public GameLogEloData EloData { get; set; }
    }

    public class GameLogEloData
    {
        [JsonProperty("arena_points")]
        public int? ArenaPoints { get; set; }

        [JsonProperty("arena_points_change")]
        public int? ArenaPointsChange { get; set; }

        [JsonProperty("game_rank")]
        public int? GameRank { get; set; }

        [JsonProperty("game_rank_change")]
        public int? GameRankChange { get; set; }
    }

    public class GameLogMove
    {
        [JsonProperty("move_number")]
        public int? MoveNumber { get; set; }

        [JsonProperty("timestamp")]
        public string Timestamp { get; set; }

        [JsonProperty("player_id")]
        public string PlayerId { get; set; }

        [JsonProperty("player_name")]
        public string PlayerName { get; set; }

        [JsonProperty("action_type")]
        public string ActionType { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("card_played")]
        public string CardPlayed { get; set; }

        [JsonProperty("card_cost")]
        public int? CardCost { get; set; }

        [JsonProperty("tile_placed")]
        public string TilePlaced { get; set; }

        [JsonProperty("tile_location")]
        public string TileLocation { get; set; }

        [JsonProperty("game_state")]
        public object GameState { get; set; }
    }

    public class GameLogMetadata
    {
        [JsonProperty("parsed_at")]
        public string ParsedAt { get; set; }

        [JsonProperty("total_moves")]
        public int? TotalMoves { get; set; }

        [JsonProperty("elo_data_included")]
        public bool? EloDataIncluded { get; set; }

        [JsonProperty("elo_players_found")]
        public int? EloPlayersFound { get; set; }
    }
}

using System.ComponentModel.DataAnnotations;

namespace BgaTmScraperRegistry.Models
{
    public class GamePlayer
    {
        [Required]
        public int GameId { get; set; }

        [Required]
        public int TableId { get; set; }

        [Required]
        public int PlayerPerspective { get; set; }

        [Required]
        public int PlayerId { get; set; }

        [Required]
        public string PlayerName { get; set; }

        public int? Elo { get; set; }

        public int? EloChange { get; set; }

        public int? ArenaPoints { get; set; }

        public int? ArenaPointsChange { get; set; }

        [Required]
        public int Position { get; set; }
    }
}

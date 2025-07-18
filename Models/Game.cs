using System;
using System.ComponentModel.DataAnnotations;

namespace BgaTmScraperRegistry.Models
{
    public class Game
    {
        public int Id { get; set; }

        [Required]
        public int TableId { get; set; }

        [Required]
        public int PlayerPerspective { get; set; }

        [Required]
        [StringLength(255)]
        public string VersionId { get; set; }

        [StringLength(255)]
        public string RawDateTime { get; set; }

        public DateTime? ParsedDateTime { get; set; }

        [StringLength(255)]
        public string GameMode { get; set; }

        [Required]
        public DateTime IndexedAt { get; set; }

        [Required]
        public DateTime ScrapedAt { get; set; }

        [StringLength(255)]
        public string ScrapedBy { get; set; }
    }
}

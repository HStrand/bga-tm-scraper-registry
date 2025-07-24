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

        public DateTime? ScrapedAt { get; set; }

        [StringLength(255)]
        public string ScrapedBy { get; set; }

        [StringLength(255)]
        public string AssignedTo { get; set; }

        public DateTime? AssignedAt { get; set; }

        [StringLength(255)]
        public string Map { get; set; }

        public bool? PreludeOn { get; set; }

        public bool? ColoniesOn { get; set; }

        public bool? CorporateEraOn { get; set; }

        public bool? DraftOn { get; set; }

        public bool? BeginnersCorporationsOn { get; set; }
        public string GameSpeed { get; set; }
    }
}

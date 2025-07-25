using System;

namespace BgaTmScraperRegistry.Models
{
    public class GameMetadata
    {
        public int TableId { get; set; }
        public int PlayerPerspective { get; set; }
        public DateTime? ParsedDateTime { get; set; }
        public string Map { get; set; }
        public bool? PreludeOn { get; set; }
        public bool? ColoniesOn { get; set; }
        public bool? CorporateEraOn { get; set; }
        public bool? DraftOn { get; set; }
        public bool? BeginnersCorporationsOn { get; set; }
        public string GameSpeed { get; set; }
    }
}

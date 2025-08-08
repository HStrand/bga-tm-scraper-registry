using System;

namespace BgaTmScraperRegistry.Models
{
    public class GameGreeneryLocation
    {
        public int TableId { get; set; }
        public int PlayerId { get; set; }
        public string GreeneryLocation { get; set; }
        public int? PlacedGen { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

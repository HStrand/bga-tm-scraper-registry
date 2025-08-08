using System;

namespace BgaTmScraperRegistry.Models
{
    public class GameCityLocation
    {
        public int TableId { get; set; }
        public int PlayerId { get; set; }
        public string CityLocation { get; set; }
        public int Points { get; set; }
        public int? PlacedGen { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

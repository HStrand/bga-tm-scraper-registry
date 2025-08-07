using System;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry.Models
{
    public class GameStats
    {
        public int TableId { get; set; }
        public int? Generations { get; set; }
        public int? DurationMinutes { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

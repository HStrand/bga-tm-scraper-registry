using System;

namespace BgaTmScraperRegistry.Models
{
    public class GameMilestone
    {
        public int TableId { get; set; }
        public string Milestone { get; set; }
        public int ClaimedBy { get; set; }
        public int ClaimedGen { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

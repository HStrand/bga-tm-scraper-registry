using System;

namespace BgaTmScraperRegistry.Models
{
    public class GamePlayerStats
    {
        public int TableId { get; set; }
        public int PlayerId { get; set; }
        public string Corporation { get; set; }
        public int? FinalScore { get; set; }
        public int? FinalTr { get; set; }
        public int? AwardPoints { get; set; }
        public int? MilestonePoints { get; set; }
        public int? CityPoints { get; set; }
        public int? GreeneryPoints { get; set; }
        public int? CardPoints { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

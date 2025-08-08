using System;

namespace BgaTmScraperRegistry.Models
{
    public class GameCard
    {
        public int TableId { get; set; }
        public int PlayerId { get; set; }
        public string Card { get; set; }
        public int? SeenGen { get; set; }
        public int? DrawnGen { get; set; }
        public int? KeptGen { get; set; }
        public int? DraftedGen { get; set; }
        public int? BoughtGen { get; set; }
        public int? PlayedGen { get; set; }
        public int? VpScored { get; set; }
        public string DrawType { get; set; }
        public string DrawReason { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

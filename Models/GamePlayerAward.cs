using System;

namespace BgaTmScraperRegistry.Models
{
    public class GamePlayerAward
    {
        public int TableId { get; set; }
        public int PlayerId { get; set; }
        public string Award { get; set; }
        public int FundedBy { get; set; }
        public int FundedGen { get; set; }
        public int? PlayerPlace { get; set; }
        public int? PlayerCounter { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

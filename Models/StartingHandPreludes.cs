using System;

namespace BgaTmScraperRegistry.Models
{
    public class StartingHandPreludes
    {
        public int TableId { get; set; }
        public int PlayerId { get; set; }
        public string Prelude { get; set; }
        public bool Kept { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

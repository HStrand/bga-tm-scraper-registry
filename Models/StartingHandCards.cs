using System;

namespace BgaTmScraperRegistry.Models
{
    public class StartingHandCards
    {
        public int TableId { get; set; }
        public int PlayerId { get; set; }
        public string Card { get; set; }
        public bool Kept { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

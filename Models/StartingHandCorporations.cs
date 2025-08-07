using System;

namespace BgaTmScraperRegistry.Models
{
    public class StartingHandCorporations
    {
        public int GameId { get; set; }
        public int PlayerId { get; set; }
        public string Corporation { get; set; }
        public bool Kept { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

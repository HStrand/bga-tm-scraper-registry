using System;

namespace BgaTmScraperRegistry.Models
{
    public class Statistics
    {
        public int TotalIndexedGames { get; set; }
        public int ScrapedGamesTotal { get; set; }
        public int ScrapedGamesByUser { get; set; }
        public int TotalPlayers { get; set; }
        public int? AverageEloInScrapedGames { get; set; }
        public int? MedianEloInScrapedGames { get; set; }
    }
}

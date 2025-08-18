using System;

namespace BgaTmScraperRegistry.Models
{
    public class GlobalStatistics
    {
        public int TotalIndexedGames { get; set; }
        public int ScrapedGamesTotal { get; set; }
        public int TotalPlayers { get; set; }
        public int? AverageEloInScrapedGames { get; set; }
        public int TotalCardDraws { get; set; }
        public int TotalPlayerTrackerChanges { get; set; }
        public int TotalNumberOfGreeneries { get; set; }
        public int TotalNumberOfCities { get; set; }
        public int TotalNumberOfAwards { get; set; }
        public int TotalNumberOfMilestones { get; set; }
        public int TotalNumberOfGlobalParameterIncreases { get; set; }
    }
}

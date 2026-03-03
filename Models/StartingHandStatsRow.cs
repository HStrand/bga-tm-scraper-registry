namespace BgaTmScraperRegistry.Models
{
    public class StartingHandStatsRow
    {
        public string Card { get; set; }
        public long OfferedGames { get; set; }
        public long KeptGames { get; set; }
        public long NotKeptGames { get; set; }
        public double? KeepRate { get; set; }
        public double? AvgEloChangeOffered { get; set; }
        public double? AvgEloChangeKept { get; set; }
        public double? AvgEloChangeNotKept { get; set; }
    }
}

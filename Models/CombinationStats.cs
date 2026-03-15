namespace BgaTmScraperRegistry.Models
{
    public class CombinationBaselineRow
    {
        public string Name { get; set; }
        public int GameCount { get; set; }
        public double AvgEloChange { get; set; }
        public double WinRate { get; set; }
    }

    public class CombinationComboRow
    {
        public string Name1 { get; set; }
        public string Name2 { get; set; }
        public int GameCount { get; set; }
        public double AvgEloChange { get; set; }
        public double WinRate { get; set; }
    }
}

namespace BgaTmScraperRegistry.Models
{
    public class PlayerParameterStats
    {
        public string Name { get; set; }
        public int PlayerId { get; set; }
        public long ParameterIncreases { get; set; }
        public int GameCount { get; set; }
        public decimal ParameterIncreasesPerGame { get; set; }
    }
}

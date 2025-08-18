namespace BgaTmScraperRegistry.Models
{
    public class PlayerGreeneryStats
    {
        public string Name { get; set; }
        public int PlayerId { get; set; }
        public int Greeneries { get; set; }
        public int GameCount { get; set; }
        public decimal GreeneriesPerGame { get; set; }
    }
}

namespace BgaTmScraperRegistry.Models
{
    public class AwardRow
    {
        public int TableId { get; set; }
        public string Map { get; set; }
        public bool PreludeOn { get; set; }
        public bool ColoniesOn { get; set; }
        public bool DraftOn { get; set; }
        public string GameMode { get; set; }
        public string GameSpeed { get; set; }
        public int? PlayerCount { get; set; }
        public int? DurationMinutes { get; set; }
        public int? Generations { get; set; }
        public string Award { get; set; }
        public int FundedBy { get; set; }
        public int FundedGen { get; set; }
        public int PlayerId { get; set; }
        public string PlayerName { get; set; }
        public int? Elo { get; set; }
        public int? EloChange { get; set; }
        public int? Position { get; set; }
        public int? PlayerCounter { get; set; }
        public int? PlayerPlace { get; set; }
        public string Corporation { get; set; }
    }
}

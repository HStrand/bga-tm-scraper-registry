namespace BgaTmScraperRegistry.Models
{
    public class MilestoneClaimRow
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
        public string Milestone { get; set; }
        public int? ClaimedGen { get; set; }
        public int PlayerId { get; set; }
        public string PlayerName { get; set; }
        public int? Elo { get; set; }
        public int? EloChange { get; set; }
        public int? Position { get; set; }
        public string Corporation { get; set; }
    }
}

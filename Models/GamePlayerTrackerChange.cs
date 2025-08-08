using System;

namespace BgaTmScraperRegistry.Models
{
    public class GamePlayerTrackerChange
    {
        public int TableId { get; set; }
        public int PlayerId { get; set; }
        public string Tracker { get; set; }           // raw tracker name from logs
        public string TrackerType { get; set; }       // "Tag", "Production", or "Resource"
        public int Generation { get; set; }           // generation when change observed
        public int ChangedTo { get; set; }            // new value after change
        public DateTime UpdatedAt { get; set; }
    }
}

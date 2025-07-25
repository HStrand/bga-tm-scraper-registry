using System;

namespace BgaTmScraperRegistry.Models
{
    public class MigrationLogEntry
    {
        public DateTime Timestamp { get; set; }
        public int TableId { get; set; }
        public int PlayerPerspective { get; set; }
        public string Status { get; set; } // "success" or "error"
        public string ErrorMessage { get; set; }
        public long ProcessingTimeMs { get; set; }
    }
}

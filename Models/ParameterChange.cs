using System;

namespace BgaTmScraperRegistry.Models
{
    public class ParameterChange
    {
        public int TableId { get; set; }
        public string Parameter { get; set; }
        public int Generation { get; set; }
        public int IncreasedTo { get; set; }
        public int? IncreasedBy { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

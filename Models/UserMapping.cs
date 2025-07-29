using System;

namespace BgaTmScraperRegistry.Models
{
    public class UserMapping
    {
        public string Username { get; set; }
        public string DisplayName { get; set; }
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}

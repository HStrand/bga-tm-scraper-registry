using System;

namespace BgaTmScraperRegistry.Models
{
    public class Comment
    {
        public int Id { get; set; }
        public string TableId { get; set; }
        public string Username { get; set; }
        public string Body { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}

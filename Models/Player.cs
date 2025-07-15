using System;
using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry.Models
{
    public class Player
    {
        public int PlayerId { get; set; }

        public string Name { get; set; }

        public string Country { get; set; }

        public int Elo { get; set; }

        public DateTime UpdatedAt { get; set; }
    }
}

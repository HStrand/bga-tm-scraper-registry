using System;
using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry.Models
{
    public class PlayerScore
    {
        public int TableId { get; set; }
        
        public int PlayerId { get; set; }
        
        public string PlayerName { get; set; }
        
        public string Corporation { get; set; }
        
        public string Map { get; set; }
        
        public bool ColoniesOn { get; set; }
        
        public string GameMode { get; set; }
        
        public string GameSpeed { get; set; }
        
        public bool PreludeOn { get; set; }
        
        public bool DraftOn { get; set; }
        
        public int? Generations { get; set; }
        
        public int? PlayerCount { get; set; }
        
        public int FinalScore { get; set; }
    }
}

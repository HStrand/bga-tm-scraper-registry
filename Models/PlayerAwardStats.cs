using System;
using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry.Models
{
    public class PlayerAwardStats
    {
        public int PlayerId { get; set; }
        
        public string PlayerName { get; set; }
        
        public int TharsisGames { get; set; }
        
        public int Thermalist { get; set; }
        
        public int Banker { get; set; }
        
        public int Scientist { get; set; }
        
        public int Miner { get; set; }
        
        public int Landlord { get; set; }
        
        public int TotalFirsts { get; set; }
        
        public decimal ThermalistRate { get; set; }
        
        public decimal BankerRate { get; set; }
        
        public decimal ScientistRate { get; set; }
        
        public decimal MinerRate { get; set; }
        
        public decimal LandlordRate { get; set; }
        
        public decimal TotalAwardRate { get; set; }
    }
}

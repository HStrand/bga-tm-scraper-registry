using System;
using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry.Models
{
    public class PlayerMilestoneStats
    {
        public int PlayerId { get; set; }
        
        public string PlayerName { get; set; }
        
        public int TharsisGames { get; set; }
        
        public int Terraformer { get; set; }
        
        public int Gardener { get; set; }
        
        public int Builder { get; set; }
        
        public int Mayor { get; set; }
        
        public int Planner { get; set; }
        
        public decimal TerraformerRate { get; set; }
        
        public decimal GardenerRate { get; set; }
        
        public decimal BuilderRate { get; set; }
        
        public decimal MayorRate { get; set; }
        
        public decimal PlannerRate { get; set; }
    }
}

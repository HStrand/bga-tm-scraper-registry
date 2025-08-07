using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace BgaTmScraperRegistry.Models
{
    public class GameState
    {
        [JsonProperty("move_number")]
        public int? MoveNumber { get; set; }

        [JsonProperty("generation")]
        public int? Generation { get; set; }

        [JsonProperty("temperature")]
        public int? Temperature { get; set; }

        [JsonProperty("oxygen")]
        public int? Oxygen { get; set; }

        [JsonProperty("oceans")]
        public int? Oceans { get; set; }

        [JsonProperty("player_vp")]
        public Dictionary<string, PlayerVictoryPoints> PlayerVp { get; set; }

        [JsonProperty("milestones")]
        public Dictionary<string, MilestoneInfo> Milestones { get; set; }

        [JsonProperty("awards")]
        public Dictionary<string, AwardInfo> Awards { get; set; }

        [JsonProperty("player_trackers")]
        public Dictionary<string, PlayerTracker> PlayerTrackers { get; set; }
    }

    public class PlayerVictoryPoints
    {
        [JsonProperty("total")]
        public int? Total { get; set; }

        [JsonProperty("total_details")]
        public VictoryPointTotalDetails TotalDetails { get; set; }

        [JsonProperty("details")]
        public VictoryPointDetails Details { get; set; }
    }

    public class VictoryPointTotalDetails
    {
        [JsonProperty("tr")]
        public int? Tr { get; set; }

        [JsonProperty("awards")]
        public int? Awards { get; set; }

        [JsonProperty("milestones")]
        public int? Milestones { get; set; }

        [JsonProperty("cities")]
        public int? Cities { get; set; }

        [JsonProperty("greeneries")]
        public int? Greeneries { get; set; }

        [JsonProperty("cards")]
        public int? Cards { get; set; }
    }

    public class VictoryPointDetails
    {
        [JsonProperty("awards")]
        public Dictionary<string, AwardVictoryPoints> Awards { get; set; }

        [JsonProperty("milestones")]
        public Dictionary<string, MilestoneVictoryPoints> Milestones { get; set; }

        [JsonProperty("cities")]
        public Dictionary<string, LocationVictoryPoints> Cities { get; set; }

        [JsonProperty("greeneries")]
        public Dictionary<string, LocationVictoryPoints> Greeneries { get; set; }

        [JsonProperty("cards")]
        public Dictionary<string, CardVictoryPoints> Cards { get; set; }
    }

    public class AwardVictoryPoints
    {
        [JsonProperty("vp")]
        public int? Vp { get; set; }

        [JsonProperty("counter")]
        public int? Counter { get; set; }

        [JsonProperty("place")]
        public int? Place { get; set; }
    }

    public class MilestoneVictoryPoints
    {
        [JsonProperty("vp")]
        public int? Vp { get; set; }
    }

    public class LocationVictoryPoints
    {
        [JsonProperty("vp")]
        public int? Vp { get; set; }
    }

    public class CardVictoryPoints
    {
        [JsonProperty("vp")]
        public int? Vp { get; set; }
    }

    public class MilestoneInfo
    {
        [JsonProperty("claimed_by")]
        public string ClaimedBy { get; set; }

        [JsonProperty("player_id")]
        public string PlayerId { get; set; }

        [JsonProperty("move_number")]
        public int? MoveNumber { get; set; }

        [JsonProperty("timestamp")]
        public string Timestamp { get; set; }
    }

    public class AwardInfo
    {
        [JsonProperty("funded_by")]
        public string FundedBy { get; set; }

        [JsonProperty("player_id")]
        public string PlayerId { get; set; }

        [JsonProperty("move_number")]
        public int? MoveNumber { get; set; }

        [JsonProperty("timestamp")]
        public string Timestamp { get; set; }
    }

    public class PlayerTracker
    {
        [JsonProperty("Count of Space tags")]
        public int? CountOfSpaceTags { get; set; }

        [JsonProperty("M€ Production")]
        public int? MegaCreditProduction { get; set; }

        [JsonProperty("Count of Plant tags")]
        public int? CountOfPlantTags { get; set; }

        [JsonProperty("Count of Science tags")]
        public int? CountOfScienceTags { get; set; }

        [JsonProperty("Titanium")]
        public int? Titanium { get; set; }

        [JsonProperty("Count of City tags")]
        public int? CountOfCityTags { get; set; }

        [JsonProperty("Count of Building tags")]
        public int? CountOfBuildingTags { get; set; }

        [JsonProperty("Plant")]
        public int? Plant { get; set; }

        [JsonProperty("Count of Microbe tags")]
        public int? CountOfMicrobeTags { get; set; }

        [JsonProperty("Microbe")]
        public int? Microbe { get; set; }

        [JsonProperty("Player Area Counter")]
        public int? PlayerAreaCounter { get; set; }

        [JsonProperty("Count of Jovian tags")]
        public int? CountOfJovianTags { get; set; }

        [JsonProperty("Count of Power tags")]
        public int? CountOfPowerTags { get; set; }

        [JsonProperty("Energy Production")]
        public int? EnergyProduction { get; set; }

        [JsonProperty("Steel Production")]
        public int? SteelProduction { get; set; }

        [JsonProperty("Count of Earth tags")]
        public int? CountOfEarthTags { get; set; }

        [JsonProperty("Heat Production")]
        public int? HeatProduction { get; set; }

        [JsonProperty("Count of Wild tags")]
        public int? CountOfWildTags { get; set; }

        [JsonProperty("Plant Production")]
        public int? PlantProduction { get; set; }

        [JsonProperty("Steel")]
        public int? Steel { get; set; }

        [JsonProperty("Energy")]
        public int? Energy { get; set; }

        [JsonProperty("Count of Animal tags")]
        public int? CountOfAnimalTags { get; set; }

        [JsonProperty("Hand Counter")]
        public int? HandCounter { get; set; }

        [JsonProperty("Heat")]
        public int? Heat { get; set; }

        [JsonProperty("Titanium Production")]
        public int? TitaniumProduction { get; set; }

        [JsonProperty("Count of played Events cards")]
        public int? CountOfPlayedEventsCards { get; set; }

        [JsonProperty("M€")]
        public int? MegaCredits { get; set; }
    }
}

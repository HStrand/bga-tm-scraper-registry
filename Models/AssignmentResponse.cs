using System;
using System.Collections.Generic;

namespace BgaTmScraperRegistry.Models
{
    public abstract class AssignmentResponse
    {
        public string AssignmentType { get; set; }
    }

    public class IndexingAssignment : AssignmentResponse
    {
        public int PlayerId { get; set; }
        public string PlayerName { get; set; }

        public IndexingAssignment()
        {
            AssignmentType = "Indexing";
        }
    }

    public class ReplayScrapingAssignment : AssignmentResponse
    {
        public List<GameAssignmentDetails> Games { get; set; }

        public ReplayScrapingAssignment()
        {
            AssignmentType = "ReplayScraping";
            Games = new List<GameAssignmentDetails>();
        }
    }

    public class GameAssignmentDetails
    {
        public int TableId { get; set; }
        public int PlayerPerspective { get; set; }
        public string VersionId { get; set; }
        public string GameMode { get; set; }
        public string PlayerName { get; set; }  // Name of PlayerPerspective
        public DateTime PlayedAt { get; set; } // From ParsedDateTime in DB
        public string Map { get; set; }
        public bool? PreludeOn {  get; set; }
        public bool? ColoniesOn { get; set; }
        public bool? CorporateEraOn { get; set; }
        public bool? DraftOn { get; set; }
        public bool? BeginnersCorporationsOn { get; set; }
        public string GameSpeed { get; set; }

        public List<GamePlayerInfo> Players { get; set; }  // All players in the game

        public GameAssignmentDetails()
        {
            Players = new List<GamePlayerInfo>();
        }
    }

    public class GamePlayerInfo
    {
        public int PlayerId { get; set; }
        public string PlayerName { get; set; }
        public int Elo { get; set; }
        public int EloChange { get; set; }
        public int? ArenaPoints { get; set; }
        public int? ArenaPointsChange { get; set; }
        public int Position { get; set; }
    }
}

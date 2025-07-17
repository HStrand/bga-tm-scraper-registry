# BGA TM Scraper Registry

Azure Functions API for a central registry for Terraforming Mars games scraped from Boardgame Arena

## Functions

### UpdatePlayersFunction
- **Method**: POST
- **Purpose**: Bulk insert/update player data in Azure SQL Database
- **Endpoint**: `/api/UpdatePlayersFunction`

### UpdateGamesFunction
- **Method**: POST
- **Purpose**: Bulk insert/update game data and associated player data in Azure SQL Database
- **Endpoint**: `/api/UpdateGamesFunction`

## UpdatePlayersFunction Usage

### Request Format
Send a POST request with JSON array of player objects:

```json
[
    {
        "playerID": 91752888,
        "playerName": "Kulikk",
        "country": "Poland",
        "elo": 813,
        "updatedAt": "2025-07-15 15:19:17.813715"
    },
    {
        "playerID": 95583069,
        "playerName": "SzyBek",
        "country": "Poland",
        "elo": 774,
        "updatedAt": "2025-07-15 15:19:17.813715"
    }
]
```

### Response Format
Success response:
```json
{
    "message": "Successfully processed 2 players",
    "success": true
}
```

Error response:
```json
{
    "message": "Error description",
    "success": false
}
```

### Database Operations
- **Insert**: New players are added to the database
- **Update**: Existing players have their Name, Country, Elo, and UpdatedAt fields updated
- **Ignore**: Existing players not in the JSON request are left unchanged

## UpdateGamesFunction Usage

### Request Format
Send a POST request with JSON object containing game data:

```json
{
  "player_id": "86296239",
  "scraped_at": "2025-07-17T20:41:10.430449",
  "total_games": 17,
  "arena_games": 17,
  "games": [
    {
      "table_id": "701730443",
      "raw_datetime": "2025-07-15 at 23:41",
      "parsed_datetime": "2025-07-15T23:41:00",
      "game_mode": "Arena mode",
      "version": "250710-0850",
      "player_perspective": "86296239",
      "scraped_at": "2025-07-17T20:39:01.998013",
      "players": [
        {
          "player_name": "StrandedKnight",
          "player_id": "86296239",
          "position": 1,
          "arena_points": null,
          "arena_points_change": 3,
          "game_rank": 531,
          "game_rank_change": 2
        },
        {
          "player_name": "confoot",
          "player_id": "95347736",
          "position": 2,
          "arena_points": null,
          "arena_points_change": -1,
          "game_rank": 115,
          "game_rank_change": -1
        }
      ]
    }
  ]
}
```

### Response Format
Success response:
```json
{
    "message": "Successfully processed 1 games with 2 players",
    "success": true
}
```

Error response:
```json
{
    "message": "Error description",
    "success": false
}
```

### Database Operations
- **Games Table**: Games are inserted only if they don't already exist (based on TableId + PlayerPerspective composite key)
- **GamePlayers Table**: Player records are inserted only if they don't already exist (based on GameId + PlayerId composite key)
- **No Updates**: Once a game is indexed, it will not be updated or re-indexed
- **Deduplication**: Duplicate games (same TableId + PlayerPerspective) keep the most recent ScrapedAt timestamp
- **Validation**: Invalid games and players are skipped with detailed logging
- **Batch Processing**: Large datasets are processed in batches of 1000 records for efficiency
- **Indexing vs Scraping**: This function indexes already-scraped data. ScrapedAt comes from JSON, IndexedAt is set to current time, ScrapedBy is left NULL (to be set later by scraper)

### Database Setup
Before using UpdateGamesFunction, run the SQL script `database_setup.sql` to create the required table-valued parameter types:
- `dbo.GameTableType`
- `dbo.GamePlayerTableType`

## Configuration

### Environment Variables
- `SqlConnectionString`: Connection string to Azure SQL Database

## Development

### Prerequisites
- .NET 8.0
- Azure Functions Core Tools

### Dependencies
- Microsoft.NET.Sdk.Functions
- Dapper (ORM)
- Microsoft.Data.SqlClient (SQL Server connectivity)

### Local Development
1. Configure `local.settings.json` with your SQL connection string
2. Run `dotnet restore` to install dependencies
3. Run `dotnet build` to build the project
4. Use Azure Functions Core Tools to run locally: `func start`

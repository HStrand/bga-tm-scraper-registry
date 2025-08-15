# BGA TM Scraper Registry

Azure Functions API for a central registry for Terraforming Mars games scraped from Boardgame Arena

## Functions

### UpdatePlayers
- **Method**: POST
- **Purpose**: Bulk insert/update player data in Azure SQL Database
- **Endpoint**: `/api/UpdatePlayers`

### UpdateGames
- **Method**: POST
- **Purpose**: Bulk insert/update game data and associated player data in Azure SQL Database
- **Endpoint**: `/api/UpdateGames`

### GetIndexedGamesByPlayer
- **Method**: GET
- **Purpose**: Retrieve list of indexed game tableIds for a specific player
- **Endpoint**: `/api/GetIndexedGamesByPlayer?playerId={playerId}`

### GetNextPlayerToIndex
- **Method**: GET
- **Purpose**: Get the next player ID that should be indexed by external indexing service
- **Endpoint**: `/api/GetNextPlayerToIndex`

### ZipGameLogsScheduled
- **Method**: Timer Trigger
- **Purpose**: Automatically creates ZIP archives of all JSON game logs daily at 2 AM UTC
- **Schedule**: `0 0 2 * * *` (Daily at 2:00 AM UTC)

### ZipGameLogsOnDemand
- **Method**: POST
- **Purpose**: Manually trigger creation of ZIP archive containing all JSON game logs
- **Endpoint**: `/api/zip-game-logs`

### DownloadLatestZip
- **Method**: GET
- **Purpose**: Download the most recently created ZIP archive of game logs
- **Endpoint**: `/api/download-latest-zip`

## UpdatePlayers Usage

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

## UpdateGames Usage

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
Before using UpdateGames, run the SQL script `database_setup.sql` to create the required table-valued parameter types:
- `dbo.GameTableType`
- `dbo.GamePlayerTableType`

## GetIndexedGamesByPlayer Usage

### Request Format
Send a GET request with playerId as query parameter:

```
GET /api/GetIndexedGamesByPlayer?playerId=86296239
```

### Response Format
Success response (array of tableIds):
```json
[701730443, 701682467, 701309240, 701299671, 700805200]
```

Empty response (no games found):
```json
[]
```

Error response:
```json
{
    "message": "playerId parameter is required",
    "success": false
}
```

### Parameters
- **playerId** (required): Integer representing the player ID to get games for

### Database Operations
- Queries the Games table for all records where PlayerPerspective matches the provided playerId
- Returns only the TableId values as a simple integer array
- No filtering applied - returns all indexed games for the player

## GetNextPlayerToIndex Usage

### Request Format
Send a GET request with no parameters:

```
GET /api/GetNextPlayerToIndex
```

### Response Format
Success response (player found):
```json
{
    "playerId": 86296239
}
```

Not found response (no suitable player):
```json
{
    "message": "No player found to index"
}
```

Error response:
```json
{
    "message": "Internal server error"
}
```

### Selection Logic
The function implements a prioritized selection algorithm:

1. **First Priority**: Among the top 1000 highest Elo players, select the highest Elo player who has never been indexed (LastIndexedAt = NULL)
2. **Second Priority**: If all top 1000 players have been indexed at least once, select the player with the oldest LastIndexedAt timestamp
3. **No Match**: Returns HTTP 404 if no players exist in the database

### Database Operations
- Queries top 1000 players by Elo with their last indexed game timestamp
- Uses LEFT JOIN between Players and Games tables on PlayerId = PlayerPerspective
- Groups by player to get the most recent IndexedAt timestamp per player
- Applies prioritization logic in C# code for optimal performance

### Use Case
This function is designed for external indexing services that need to determine which player's games should be scraped next, ensuring:
- High Elo players are prioritized for indexing
- All players eventually get indexed
- Players with stale data (old LastIndexedAt) get re-indexed periodically

## ZipGameLogsOnDemand Usage

### Request Format
Send a POST request with no body:

```
POST /api/zip-game-logs
```

### Response Format
Success response:
```json
{
    "success": true,
    "archiveFileName": "game-logs-archive-2025-01-22-020000.zip",
    "filesIncluded": 1250,
    "archiveSize": "45.2 MB",
    "createdAt": "2025-01-22T02:00:00Z"
}
```

Error response:
```json
{
    "success": false,
    "error": "No JSON blobs found to archive"
}
```

### Archive Operations
- **Source Container**: `games` - Contains all JSON game log files
- **Destination Container**: `archives` - Stores the created ZIP files
- **File Structure**: ZIP maintains original folder structure (`{player_perspective}/game_{table_id}_{player_perspective}.json`)
- **Archive Naming**: `game-logs-archive-{yyyy-MM-dd-HHmmss}.zip`
- **Compression**: Uses optimal compression level for best space efficiency
- **Memory Efficient**: Streams files directly into ZIP without loading all content into memory

### ZipGameLogsScheduled Behavior
- **Automatic Execution**: Runs daily at 2:00 AM UTC
- **Same Process**: Uses identical logic as the on-demand endpoint
- **Logging**: Comprehensive logging for monitoring and troubleshooting
- **Error Handling**: Continues operation even if individual files fail to process
- **No Response**: Timer functions don't return HTTP responses, only log results

### Error Handling
- **Missing Connection String**: Returns error if `BlobStorageConnectionString` environment variable is not set
- **No Files Found**: Returns error if no JSON files exist in the source container
- **Individual File Failures**: Logs warnings but continues processing remaining files
- **Upload Failures**: Returns error if ZIP upload to blob storage fails

## DownloadLatestZip Usage

### Request Format
Send a GET request with no parameters:

```
GET /api/download-latest-zip
```

### Response Format
**Success**: Direct file download with proper headers
- **Content-Type**: `application/zip`
- **Content-Disposition**: `attachment; filename="game-logs-archive-{timestamp}.zip"`
- **Body**: Binary ZIP file stream

**Not Found** (404):
```json
{
    "success": false,
    "error": "No ZIP archives found"
}
```

**Error** (400):
```json
{
    "success": false,
    "error": "BlobStorageConnectionString environment variable is not set"
}
```

### Download Behavior
- **Latest Selection**: Automatically finds the most recent ZIP archive based on filename timestamp
- **Direct Streaming**: Streams the ZIP file directly from blob storage to the client
- **Memory Efficient**: Does not load the entire file into memory
- **Browser Compatible**: Sets proper headers for browser download dialogs
- **File Naming**: Downloaded file retains original archive name with timestamp

### Archive Selection Logic
1. Lists all files in the "archives" container
2. Filters for files matching pattern: `game-logs-archive-*.zip`
3. Sorts filenames alphabetically (which corresponds to chronological order due to timestamp format)
4. Selects the last file in the sorted list (most recent)

### Error Scenarios
- **No Archives**: Returns 404 if no ZIP files exist in the archives container
- **Missing Connection**: Returns 400 if blob storage connection string is not configured
- **Access Errors**: Returns 500 for blob storage access failures
- **Download Failures**: Returns 500 if the selected archive cannot be downloaded

## Configuration

### Environment Variables
- `SqlConnectionString`: Connection string to Azure SQL Database
- `BlobStorageConnectionString`: Connection string to Azure Blob Storage (required for ZIP functions)

## Development

### Development Setup Options

For **frontend development** with cloud backend integration, see: 📋 **[Cloud Development Setup Guide](CLOUD_DEVELOPMENT_SETUP.md)**

This approach allows you to develop the web interface locally while using the live Azure Functions backend, perfect for UI development without complex local backend setup.

### Backend Development

#### Prerequisites
- .NET 8.0
- Azure Functions Core Tools

#### Dependencies
- Microsoft.NET.Sdk.Functions
- Dapper (ORM)
- Microsoft.Data.SqlClient (SQL Server connectivity)

#### Local Azure Functions Development
1. Configure `local.settings.json` with your SQL connection string
2. Run `dotnet restore` to install dependencies
3. Run `dotnet build` to build the project
4. Use Azure Functions Core Tools to run locally: `func start`

# BGA TM Scraper Registry

Azure Functions API for a central registry for Terraforming Mars games scraped from Boardgame Arena

## Functions

### UpdatePlayersFunction
- **Method**: POST
- **Purpose**: Bulk insert/update player data in Azure SQL Database
- **Endpoint**: `/api/UpdatePlayersFunction`

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

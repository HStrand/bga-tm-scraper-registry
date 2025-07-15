# BGA TM Scraper Registry

Azure Functions project for managing Board Game Arena Terraforming Mars player data.

## Functions

### HelloWorldFunction
- **Method**: GET/POST
- **Purpose**: Basic hello world function for testing

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

### Features
- **Batch Processing**: Processes players in batches of 1000 for optimal performance
- **Upsert Operations**: Inserts new players and updates existing ones
- **Data Validation**: Validates player data and logs warnings for invalid entries
- **Error Handling**: Comprehensive error handling with Application Insights logging
- **Transaction Safety**: Each batch is processed in a database transaction

### Database Operations
- **Insert**: New players are added to the database
- **Update**: Existing players have their Name, Country, Elo, and UpdatedAt fields updated
- **Ignore**: Existing players not in the JSON request are left unchanged

## Configuration

### Environment Variables
- `SqlConnectionString`: Connection string to Azure SQL Database

### Database Requirements
- SQL Server table named `Players` with the following schema:
```sql
CREATE TABLE Players
(
    PlayerId INT PRIMARY KEY NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Country NVARCHAR(255),
    Elo INT,
    UpdatedAt DATETIME
)
```

- The function will automatically create a table type `PlayerTableType` if it doesn't exist

## Development

### Prerequisites
- .NET 8.0
- Azure Functions Core Tools
- Azure SQL Database

### Dependencies
- Microsoft.NET.Sdk.Functions
- Dapper (ORM)
- Microsoft.Data.SqlClient (SQL Server connectivity)

### Local Development
1. Configure `local.settings.json` with your SQL connection string
2. Run `dotnet restore` to install dependencies
3. Run `dotnet build` to build the project
4. Use Azure Functions Core Tools to run locally: `func start`

### Testing
Use the provided `players_sample.json` file to test the UpdatePlayersFunction endpoint.

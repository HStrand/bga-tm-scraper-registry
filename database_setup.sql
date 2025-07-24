-- SQL script to create table-valued parameter types for the UpdateGamesFunction
-- Run this script in your SQL Server database before using the UpdateGamesFunction

-- Create table-valued parameter type for Games
IF NOT EXISTS (SELECT * FROM sys.types WHERE name = 'GameTableType' AND is_table_type = 1)
BEGIN
    CREATE TYPE dbo.GameTableType AS TABLE
    (
        TableId INT NOT NULL,
        PlayerPerspective INT NOT NULL,
        VersionId NVARCHAR(255) NOT NULL,
        RawDateTime NVARCHAR(255),
        ParsedDateTime DATETIME,
        GameMode NVARCHAR(255),
        IndexedAt DATETIME NOT NULL,
        ScrapedAt DATETIME NOT NULL,
        ScrapedBy NVARCHAR(255),
        Map NVARCHAR(255),
        PreludeOn BIT,
        ColoniesOn BIT,
        CorporateEraOn BIT,
        DraftOn BIT,
        BeginnersCorporationsOn BIT
    )
END

-- Create table-valued parameter type for GamePlayers
IF NOT EXISTS (SELECT * FROM sys.types WHERE name = 'GamePlayerTableType' AND is_table_type = 1)
BEGIN
    CREATE TYPE dbo.GamePlayerTableType AS TABLE
    (
        GameId INT NOT NULL,
        TableId INT NOT NULL,
        PlayerPerspective INT NOT NULL,
        PlayerId INT NOT NULL,
        PlayerName NVARCHAR(MAX) NOT NULL,
        Elo INT,
        EloChange INT,
        ArenaPoints INT,
        ArenaPointsChange INT,
        Position INT NOT NULL
    )
END

-- Verify the types were created successfully
SELECT 
    name,
    type_table_object_id,
    is_table_type
FROM sys.types 
WHERE name IN ('GameTableType', 'GamePlayerTableType', 'PlayerTableType')
ORDER BY name;

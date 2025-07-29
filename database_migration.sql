-- Database migration script to add new fields to Games table
-- Run this script in your SQL Server database to add the new expansion-related fields

-- Add new columns to Games table
ALTER TABLE Games ADD 
    Map NVARCHAR(255) NULL,
    PreludeOn BIT NULL,
    ColoniesOn BIT NULL,
    CorporateEraOn BIT NULL,
    DraftOn BIT NULL,
    BeginnersCorporationsOn BIT NULL;

-- Update the GameTableType to include new fields
-- First drop the existing type
IF EXISTS (SELECT * FROM sys.types WHERE name = 'GameTableType' AND is_table_type = 1)
BEGIN
    DROP TYPE dbo.GameTableType;
END

-- Recreate the type with new fields
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
    BeginnersCorporationsOn BIT,
    GameSpeed NVARCHAR(255)
);

-- Verify the changes
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Games' 
AND COLUMN_NAME IN ('Map', 'PreludeOn', 'ColoniesOn', 'CorporateEraOn', 'DraftOn', 'BeginnersCorporationsOn', 'GameSpeed')
ORDER BY COLUMN_NAME;

-- Verify the type was recreated
SELECT 
    name,
    type_table_object_id,
    is_table_type
FROM sys.types 
WHERE name = 'GameTableType'
ORDER BY name;

-- Create UserMappings table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UserMappings' AND xtype='U')
BEGIN
    CREATE TABLE UserMappings (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Username NVARCHAR(255) NOT NULL,
        DisplayName NVARCHAR(255) NOT NULL,
        UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
        INDEX IX_UserMappings_Username (Username),
        INDEX IX_UserMappings_DisplayName (DisplayName)
    );
END
ELSE
BEGIN
    -- Alter existing table to rename CreatedAt to UpdatedAt
    EXEC sp_rename 'UserMappings.CreatedAt', 'UpdatedAt', 'COLUMN';
END

-- Verify the UserMappings table was created
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    CHARACTER_MAXIMUM_LENGTH,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'UserMappings'
ORDER BY ORDINAL_POSITION;

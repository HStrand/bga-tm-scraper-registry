-- SQL Migration Script for GetNextAssignment Feature
-- This script adds the required fields and updates the table-valued parameter types

-- Step 1: Make ScrapedAt nullable in Games table
ALTER TABLE Games ALTER COLUMN ScrapedAt DATETIME NULL;

-- Step 2: Add new assignment tracking columns to Games table
ALTER TABLE Games ADD AssignedTo NVARCHAR(255) NULL;
ALTER TABLE Games ADD AssignedAt DATETIME NULL;

-- Step 3: Update the GameTableType table-valued parameter
-- First drop the existing type
DROP TYPE IF EXISTS dbo.GameTableType;

-- Recreate with updated schema
CREATE TYPE dbo.GameTableType AS TABLE
(
    TableId INT NOT NULL,
    PlayerPerspective INT NOT NULL,
    VersionId NVARCHAR(255) NOT NULL,
    RawDateTime NVARCHAR(255),
    ParsedDateTime DATETIME,
    GameMode NVARCHAR(255),
    IndexedAt DATETIME NOT NULL,
    ScrapedAt DATETIME NULL,        -- Now nullable
    ScrapedBy NVARCHAR(255),
    AssignedTo NVARCHAR(255) NULL,  -- New field
    AssignedAt DATETIME NULL        -- New field
);

-- Step 4: Add indexes for performance on assignment queries
CREATE INDEX IX_Games_Assignment_Status 
ON Games (ScrapedAt, AssignedTo, AssignedAt)
WHERE ScrapedAt IS NULL;

CREATE INDEX IX_Games_AssignedAt 
ON Games (AssignedAt)
WHERE AssignedAt IS NOT NULL;

-- Step 5: Verify the changes
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Games' 
AND COLUMN_NAME IN ('ScrapedAt', 'AssignedTo', 'AssignedAt')
ORDER BY COLUMN_NAME;

-- Verify the table-valued parameter type was updated
SELECT 
    name,
    type_table_object_id,
    is_table_type
FROM sys.types 
WHERE name = 'GameTableType'
AND is_table_type = 1;

PRINT 'Migration completed successfully!';
PRINT 'The following changes have been made:';
PRINT '1. ScrapedAt column is now nullable';
PRINT '2. AssignedTo column added (NVARCHAR(255) NULL)';
PRINT '3. AssignedAt column added (DATETIME NULL)';
PRINT '4. GameTableType table-valued parameter updated';
PRINT '5. Performance indexes added for assignment queries';

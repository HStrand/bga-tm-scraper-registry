using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;

namespace BgaTmScraperRegistry.Services
{
    public static class MapNameNormalizer
    {
        private static readonly Dictionary<string, string> MapNameDictionary = new Dictionary<string, string>
        {
            // English names (map to themselves for consistency)
            { "Tharsis", "Tharsis" },
            { "Hellas", "Hellas" },
            { "Elysium", "Elysium" },
            { "Vastitas Borealis", "Vastitas Borealis" },
            { "Amazonis Planitia", "Amazonis Planitia" },
            
            // Russian
            { "Ваститас Бореалис", "Vastitas Borealis" },
            { "Элизий", "Elysium" },
            { "Тарсис", "Tharsis" },
            { "Эллада", "Hellas" },
            
            // Chinese
            { "埃律西昂", "Elysium" },
            { "希臘", "Hellas" },
            { "北方荒原", "Vastitas Borealis" },
            { "塔爾西斯", "Tharsis" },

            // Chinese - simplified
            { "希腊", "Hellas" },
			{ "北地废土", "Vastitas Borealis" },
            { "极乐世界", "Elysium" },
            { "塔尔西斯", "Tharsis" },
            
            // Japanese
            { "エリジウム", "Elysium" },
            { "タルシス", "Tharsis" },
            { "ボレアリス荒野", "Vastitas Borealis" },
            { "ヘラス", "Hellas" },

            // Korean
            { "보레알리스 대평야", "Vastitas Borealis" },
            { "엘리시움", "Elysium" },
            { "타르시스", "Tharsis" },
            { "헬라스", "Hellas" }
        };

        /// <summary>
        /// Normalizes a map name to its standard English equivalent.
        /// </summary>
        /// <param name="mapName">The map name to normalize (may be in any language)</param>
        /// <param name="logger">Logger for warnings about unknown map names</param>
        /// <returns>The normalized English map name, or the original if not found in dictionary</returns>
        public static string NormalizeMapName(string mapName, ILogger logger)
        {
            // Handle null or empty
            if (string.IsNullOrWhiteSpace(mapName))
            {
                return mapName;
            }

            // Preserve "Random" as-is (case-insensitive check)
            if (string.Equals(mapName, "Random", StringComparison.OrdinalIgnoreCase))
            {
                return "Random";
            }

            // Try to find in dictionary (case-sensitive)
            if (MapNameDictionary.TryGetValue(mapName, out var normalizedName))
            {
                if (!string.Equals(mapName, normalizedName, StringComparison.Ordinal))
                {
                    logger?.LogInformation($"Normalized map name '{mapName}' to '{normalizedName}'");
                }
                return normalizedName;
            }

            // Not found - log warning and return original
            logger?.LogWarning($"Unknown map name encountered: '{mapName}'. Please add to MapNameNormalizer dictionary.");
            return mapName;
        }
    }
}

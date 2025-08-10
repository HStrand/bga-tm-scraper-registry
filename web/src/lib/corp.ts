// Corporation utility functions

/**
 * Convert a slug to a display title
 * Example: "mining_guild" -> "Mining Guild"
 */
export function slugToTitle(slug: string): string {
  return slug
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Convert a display name to a slug
 * Example: "Mining Guild" -> "mining_guild"
 */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except spaces and hyphens
    .replace(/[\s-]+/g, '_')      // Replace spaces and hyphens with underscores
    .replace(/^_+|_+$/g, '');     // Trim leading/trailing underscores
}

/**
 * Get corporation image from assets folder
 * Looks for pattern: corp{number}-{slug}.png
 */
export function getCorpImage(slug: string): string | undefined {
  try {
    // Import all corporation images (any extension) to be robust across filename quirks
    const corpImages = import.meta.glob('../../assets/corp*-*.*', { eager: true }) as Record<string, { default: string }>;
    
    // Find matching image by basename (robust against path separators and case)
    const entries = Object.entries(corpImages);
    const match = entries.find(([key]) => {
      const base = key.replace(/^.*[\\/]/, '').toLowerCase();
      return base.endsWith(`-${slug}.png`) || base.endsWith(`-${slug}.pngx`);
    });
    return match ? match[1].default : undefined;
  } catch (error) {
    console.warn('Error loading corporation image:', error);
    return undefined;
  }
}

/**
 * Get a placeholder image URL for corporations without images
 */
export function getPlaceholderImage(): string {
  return 'data:image/svg+xml;base64,' + btoa(`
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#f59e0b;stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:#d97706;stop-opacity:0.6" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#grad)" rx="12"/>
      <text x="100" y="100" text-anchor="middle" dominant-baseline="middle" 
            fill="#92400e" font-family="Arial, sans-serif" font-size="16" font-weight="bold">
        CORPORATION
      </text>
    </svg>
  `);
}

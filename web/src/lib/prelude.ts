// Prelude utility functions

/**
 * Convert a prelude name to a URL-friendly slug
 * Example: "Supply Drop" -> "supply_drop"
 */
export function preludeNameToSlug(preludeName: string): string {
  return preludeName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens (includes apostrophes)
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
}

/**
 * Convert a slug back to a display title
 * Example: "supply_drop" -> "Supply Drop"
 */
export function slugToPreludeName(slug: string): string {
  return slug
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get prelude image from assets folder
 * Looks for pattern: p{number}-{slug}.png
 */
export function getPreludeImage(preludeName: string): string | undefined {
  try {
    const slug = preludeNameToSlug(preludeName);
    
    // Import all prelude images to find the matching one
    const preludeImages = import.meta.glob('../../assets/p*-*.png', { eager: true }) as Record<string, { default: string }>;
    
    // Find matching image by slug
    const entries = Object.entries(preludeImages);
    const match = entries.find(([key]) => {
      const base = key.replace(/^.*[\\/]/, '').toLowerCase();
      return base.endsWith(`-${slug}.png`);
    });
    
    return match ? match[1].default : undefined;
  } catch (error) {
    console.warn('Error loading prelude image:', error);
    return undefined;
  }
}

/**
 * Get a placeholder image URL for preludes without images
 */
export function getPreludePlaceholderImage(): string {
  return 'data:image/svg+xml;base64,' + btoa(`
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#8b5cf6;stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:#7c3aed;stop-opacity:0.6" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#grad)" rx="12"/>
      <text x="100" y="90" text-anchor="middle" dominant-baseline="middle" 
            fill="#6d28d9" font-family="Arial, sans-serif" font-size="14" font-weight="bold">
        PRELUDE
      </text>
      <text x="100" y="110" text-anchor="middle" dominant-baseline="middle" 
            fill="#6d28d9" font-family="Arial, sans-serif" font-size="14" font-weight="bold">
        CARD
      </text>
    </svg>
  `);
}

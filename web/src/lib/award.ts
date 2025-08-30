// Award utility functions

/**
 * Convert an award name to a slug for image lookup
 * Example: "Thermalist" -> "thermalist"
 */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except spaces and hyphens
    .replace(/[\s-]+/g, '_')      // Replace spaces and hyphens with underscores
    .replace(/^_+|_+$/g, '');     // Trim leading/trailing underscores
}

/**
 * Convert a slug to a display title
 * Example: "landlord" -> "Landlord"
 */
export function slugToTitle(slug: string): string {
  return slug
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get award image from assets folder
 * Looks for pattern: {slug}.png (lowercase with underscores)
 */
export function getAwardImage(name: string): string | undefined {
  try {
    const slug = nameToSlug(name);
    // Import all images in assets (vite will bundle only matched ones)
    const images = import.meta.glob('../../assets/*.png', { eager: true }) as Record<string, { default: string }>;

    // Match by basename
    const entries = Object.entries(images);
    const match = entries.find(([key]) => {
      const base = key.replace(/^.*[\\/]/, '').toLowerCase();
      return base === `${slug}.png`;
    });
    return match ? match[1].default : undefined;
  } catch (error) {
    console.warn('Error loading award image:', error);
    return undefined;
  }
}

/**
 * Get a placeholder image URL for awards without images
 */
export function getPlaceholderImage(): string {
  return 'data:image/svg+xml;base64,' + btoa(`
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#10b981;stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:#047857;stop-opacity:0.6" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#grad)" rx="12"/>
      <text x="100" y="100" text-anchor="middle" dominant-baseline="middle" 
            fill="#065f46" font-family="Arial, sans-serif" font-size="16" font-weight="bold">
        AWARD
      </text>
    </svg>
  `);
}

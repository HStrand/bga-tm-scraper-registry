// Project card utility functions

/**
 * Convert a card name to a URL-friendly slug
 * Example: "Martian Rails" -> "martian_rails"
 */
export function cardNameToSlug(cardName: string): string {
  return cardName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens (includes apostrophes)
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
}

/**
 * Convert a slug back to a display title
 * Example: "nitrogen-rich_asteroid" -> "Nitrogen-Rich Asteroid"
 */
export function slugToCardName(slug: string): string {
  return slug
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get project card image from assets folder
 * Looks for pattern: {number}-{slug}.png
 */
export function getCardImage(cardName: string): string | undefined {
  try {
    const slug = cardNameToSlug(cardName);
    
    // Import all card images to find the matching one
    const cardImages = import.meta.glob('../../assets/*-*.png', { eager: true }) as Record<string, { default: string }>;
    
    // Find matching image by slug
    const entries = Object.entries(cardImages);
    const match = entries.find(([key]) => {
      const base = key.replace(/^.*[\\/]/, '').toLowerCase();
      return base.endsWith(`-${slug}.png`);
    });
    
    return match ? match[1].default : undefined;
  } catch (error) {
    console.warn('Error loading card image:', error);
    return undefined;
  }
}

/**
 * Get a placeholder image URL for cards without images
 */
export function getCardPlaceholderImage(): string {
  return 'data:image/svg+xml;base64,' + btoa(`
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:0.6" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#grad)" rx="12"/>
      <text x="100" y="90" text-anchor="middle" dominant-baseline="middle" 
            fill="#1e40af" font-family="Arial, sans-serif" font-size="14" font-weight="bold">
        PROJECT
      </text>
      <text x="100" y="110" text-anchor="middle" dominant-baseline="middle" 
            fill="#1e40af" font-family="Arial, sans-serif" font-size="14" font-weight="bold">
        CARD
      </text>
    </svg>
  `);
}

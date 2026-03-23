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
    const cardImages = import.meta.glob('../../assets/cards/**/*-*.png', { eager: true }) as Record<string, { default: string }>;
    
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

import cardBackImage from '../../assets/card back.png';

/**
 * Get the card back image for cards without specific images
 */
export function getCardPlaceholderImage(): string {
  return cardBackImage;
}

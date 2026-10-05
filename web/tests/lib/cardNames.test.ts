import { describe, it, expect } from 'vitest';
import { getCardImage } from '@/lib/card';
import { getCardMeta } from '@/lib/cardMetadata';

// BGA game logs and the game engine spell a few cards differently from each other and from the
// image files and card metadata. Both spellings have to resolve.
describe('card name spellings', () => {
  it.each([
    ['Biolabs', 'Biolab'],
    ["CEO's Favourite Project", "CEO's Favorite Project"],
    ['Excentric Sponsor', 'Eccentric Sponsor'],
  ])('finds the image and metadata for %s and %s', (bgaName, engineName) => {
    expect(getCardImage(bgaName)).toBeDefined();
    expect(getCardImage(engineName)).toBe(getCardImage(bgaName));
    expect(getCardMeta(bgaName)).toBeDefined();
    expect(getCardMeta(engineName)).toBe(getCardMeta(bgaName));
  });

  it('finds the image and metadata for Allied Bank', () => {
    expect(getCardImage('Allied Bank')).toBeDefined();
    expect(getCardMeta('Allied Bank')).toBeDefined();
  });
});

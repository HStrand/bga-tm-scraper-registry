import { api } from '@/lib/api';

/**
 * Returns server-backed player name suggestions for an input query.
 * The server enforces a minimum length; this helper mirrors that by short-circuiting on <2 chars.
 */
export async function getPlayerNameSuggestions(q: string, limit = 10): Promise<string[]> {
  const query = (q ?? '').trim();
  if (query.length < 2) return [];
  const res = await api.get<string[]>('/api/players/search', { params: { q: query, limit } });
  return res.data;
}

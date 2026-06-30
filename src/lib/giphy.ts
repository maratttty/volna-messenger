import { GIPHY_API_KEY } from '../config';

export interface GifResult {
  id: string;
  previewUrl: string; // small, for the picker grid
  fullUrl: string; // sent as the message attachment
  title: string;
}

const API_BASE = 'https://api.giphy.com/v1/gifs';

interface GiphyApiGif {
  id: string;
  title: string;
  images: {
    original: { url: string };
    fixed_width: { url: string };
    fixed_width_small?: { url: string };
  };
}

function mapResults(data: GiphyApiGif[]): GifResult[] {
  return data.map((g) => ({
    id: g.id,
    previewUrl: g.images.fixed_width_small?.url ?? g.images.fixed_width.url,
    fullUrl: g.images.original.url,
    title: g.title || 'GIF',
  }));
}

export async function fetchTrendingGifs(): Promise<GifResult[]> {
  if (!GIPHY_API_KEY) return [];
  const res = await fetch(`${API_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=pg-13`);
  if (!res.ok) throw new Error('Не удалось загрузить GIF');
  const json = await res.json();
  return mapResults(json.data);
}

export async function searchGifs(query: string): Promise<GifResult[]> {
  if (!GIPHY_API_KEY) return [];
  const trimmed = query.trim();
  if (!trimmed) return fetchTrendingGifs();
  const res = await fetch(
    `${API_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(trimmed)}&limit=24&rating=pg-13`,
  );
  if (!res.ok) throw new Error('Не удалось загрузить GIF');
  const json = await res.json();
  return mapResults(json.data);
}

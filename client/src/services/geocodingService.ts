const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface GeocodingResult {
  lat: number;
  lng: number;
}

/**
 * テキストの場所名を座標に変換する。
 * バックエンドの /api/geocode を経由してGoogle Maps Geocoding APIを呼び出す。
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult> {
  const url = new URL('/api/geocode', API_URL);
  url.searchParams.set('address', address);

  const response = await fetch(url.toString());
  const data = (await response.json()) as { lat?: number; lng?: number; error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? '場所の検索に失敗しました');
  }

  if (data.lat === undefined || data.lng === undefined) {
    throw new Error('座標の取得に失敗しました');
  }

  return { lat: data.lat, lng: data.lng };
}

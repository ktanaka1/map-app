const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface GeocodingResult {
  lat: number;
  lng: number;
}

/**
 * テキストの場所名を座標に変換する。
 * バックエンドの /api/geocode を経由してGoogle Maps Geocoding APIを呼び出す。
 */
export async function geocodeAddress(
  address: string,
): Promise<GeocodingResult> {
  const url = new URL("/api/geocode", API_URL);
  url.searchParams.set("address", address);

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch {
    throw new Error("場所の検索に失敗しました。通信環境をご確認ください");
  }

  // サーバーダウン・プロキシの502等ではHTMLが返り json() が SyntaxError になるため、
  // 生の例外をUIに出さないよう正規化する
  let data: { lat?: number; lng?: number; error?: string };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    throw new Error("場所の検索に失敗しました。通信環境をご確認ください");
  }

  if (!response.ok) {
    throw new Error(data.error ?? "場所の検索に失敗しました");
  }

  if (data.lat === undefined || data.lng === undefined) {
    throw new Error("座標の取得に失敗しました");
  }

  return { lat: data.lat, lng: data.lng };
}

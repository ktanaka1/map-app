import { Router } from "express";

export const geocodingRouter = Router();

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? "";

/**
 * GET /api/geocode?address=渋谷
 * テキストの場所名を座標に変換する（APIキーをクライアントに露出しないためのプロキシ）
 */
geocodingRouter.get("/", async (req, res) => {
  const address = (req.query.address as string | undefined)?.trim();

  if (!address) {
    res.status(400).json({ error: "address パラメータが必要です" });
    return;
  }

  if (!PLACES_API_KEY) {
    res.status(500).json({ error: "Geocoding APIキーが設定されていません" });
    return;
  }

  try {
    // Geocoding APIの代わりにPlaces Text Searchで座標を取得
    const url = new URL(
      "https://maps.googleapis.com/maps/api/place/textsearch/json",
    );
    url.searchParams.set("query", address);
    url.searchParams.set("language", "ja");
    url.searchParams.set("key", PLACES_API_KEY);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Places API エラー: ${response.status}`);
    }

    const data = (await response.json()) as {
      status: string;
      results: Array<{
        geometry: { location: { lat: number; lng: number } };
      }>;
      error_message?: string;
    };

    if (data.status !== "OK" || data.results.length === 0) {
      const detail = data.error_message ? `: ${data.error_message}` : "";
      res.status(404).json({
        error: `場所が見つかりませんでした (${data.status})${detail}`,
      });
      return;
    }

    const { lat, lng } = data.results[0].geometry.location;
    res.json({ lat, lng });
  } catch (err) {
    console.error("[Geocoding] エラー:", err);
    res.status(500).json({ error: "場所の検索に失敗しました" });
  }
});

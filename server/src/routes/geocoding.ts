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

  if (address.length > 100) {
    res.status(400).json({ error: "address が長すぎます" });
    return;
  }

  if (!PLACES_API_KEY) {
    res.status(500).json({ error: "Geocoding APIキーが設定されていません" });
    return;
  }

  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "X-Goog-Api-Key": PLACES_API_KEY,
          "X-Goog-FieldMask": "places.location",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          textQuery: address,
          languageCode: "ja",
          pageSize: 1,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Places API (New) エラー: ${response.status}`);
    }

    const data = (await response.json()) as {
      places?: Array<{ location: { latitude: number; longitude: number } }>;
    };

    if (!data.places || data.places.length === 0) {
      res.status(404).json({ error: "場所が見つかりませんでした" });
      return;
    }

    const { latitude: lat, longitude: lng } = data.places[0].location;
    res.json({ lat, lng });
  } catch (err) {
    console.error("[Geocoding] エラー:", err);
    res.status(500).json({ error: "場所の検索に失敗しました" });
  }
});

import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import type { Restaurant } from "shared/types";

const PLACES_NEW_BASE = "https://places.googleapis.com/v1";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.photos",
  "places.location",
  "places.websiteUri",
  "places.googleMapsUri",
].join(",");

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

interface NewPhoto {
  name: string;
}

interface NewPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  photos?: NewPhoto[];
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  googleMapsUri?: string;
}

interface NewSearchResponse {
  places?: NewPlace[];
}

function buildPhotoUrl(photoName: string, apiKey: string): string {
  return `${PLACES_NEW_BASE}/${photoName}/media?key=${apiKey}&maxWidthPx=400`;
}

function mapNewPlaceToRestaurant(place: NewPlace, apiKey: string): Restaurant {
  const photos = (place.photos ?? [])
    .slice(0, 5)
    .map((p) => buildPhotoUrl(p.name, apiKey));

  const priceLevelNum =
    place.priceLevel != null
      ? (PRICE_LEVEL_MAP[place.priceLevel] ?? null)
      : null;

  return {
    id: uuidv4(),
    placeId: place.id,
    name: place.displayName?.text ?? "",
    address: place.formattedAddress ?? "",
    rating: place.rating ?? 0,
    reviewCount: place.userRatingCount ?? 0,
    priceLevel: priceLevelNum,
    photos,
    lat: place.location?.latitude ?? 0,
    lng: place.location?.longitude ?? 0,
    websiteUrl: place.websiteUri ?? null,
    googleMapsUrl:
      place.googleMapsUri ??
      `https://www.google.com/maps/search/?api=1&query_place_id=${place.id}`,
  };
}

function applyPriceLevelFilter(
  restaurants: Restaurant[],
  maxPriceLevel: number | null,
): Restaurant[] {
  if (maxPriceLevel === null) return restaurants;
  return restaurants.filter(
    (r) => r.priceLevel === null || r.priceLevel <= maxPriceLevel,
  );
}

async function searchNearby(
  lat: number,
  lng: number,
  radiusMeters: number = 500,
  maxResults: number = 10,
  maxPriceLevel: number | null = null,
): Promise<Restaurant[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY が設定されていません");

  const response = await axios.post<NewSearchResponse>(
    `${PLACES_NEW_BASE}/places:searchNearby`,
    {
      includedTypes: ["restaurant"],
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
      languageCode: "ja",
      maxResultCount: maxResults,
    },
    {
      timeout: 8000,
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
        "Content-Type": "application/json",
      },
    },
  );

  const restaurants = (response.data.places ?? []).map((p) =>
    mapNewPlaceToRestaurant(p, apiKey),
  );
  return applyPriceLevelFilter(restaurants, maxPriceLevel).slice(0, maxResults);
}

async function searchByText(
  textQuery: string,
  lat: number,
  lng: number,
  radiusMeters: number = 500,
  maxResults: number = 10,
  maxPriceLevel: number | null = null,
): Promise<Restaurant[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY が設定されていません");

  const response = await axios.post<NewSearchResponse>(
    `${PLACES_NEW_BASE}/places:searchText`,
    {
      textQuery,
      includedType: "restaurant",
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
      languageCode: "ja",
      pageSize: maxResults,
    },
    {
      timeout: 8000,
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
        "Content-Type": "application/json",
      },
    },
  );

  const restaurants = (response.data.places ?? []).map((p) =>
    mapNewPlaceToRestaurant(p, apiKey),
  );
  return applyPriceLevelFilter(restaurants, maxPriceLevel).slice(0, maxResults);
}

export async function searchRestaurants(
  keywords: string[],
  lat: number,
  lng: number,
  radiusMeters: number = 500,
  maxPriceLevel: number | null = null,
): Promise<Restaurant[]> {
  if (keywords.length > 0) {
    const textQuery = keywords.join(" ");
    console.log(
      `[PlacesService] Text Search (New): query="${textQuery}", lat=${lat}, lng=${lng}, radius=${radiusMeters}m, maxPrice=${maxPriceLevel}`,
    );
    return searchByText(textQuery, lat, lng, radiusMeters, 10, maxPriceLevel);
  } else {
    console.log(
      `[PlacesService] Nearby Search (New): lat=${lat}, lng=${lng}, radius=${radiusMeters}m, maxPrice=${maxPriceLevel}`,
    );
    return searchNearby(lat, lng, radiusMeters, 10, maxPriceLevel);
  }
}

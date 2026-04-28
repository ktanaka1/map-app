import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type { Restaurant } from 'shared/types';

// TODO: Places API (New) に切り替える
// 現在は旧 Places API を使用（APIキーの制限設定でNew APIが弾かれるため暫定対応）
// New API エンドポイント: https://places.googleapis.com/v1/places:searchText
// New API エンドポイント: https://places.googleapis.com/v1/places:searchNearby

const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place';

interface LegacyPhoto {
  photo_reference: string;
  width: number;
  height: number;
}

interface LegacyPlace {
  place_id: string;
  name: string;
  vicinity?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  photos?: LegacyPhoto[];
  geometry?: {
    location: { lat: number; lng: number };
  };
}

interface LegacySearchResponse {
  status: string;
  results: LegacyPlace[];
}

function buildPhotoUrl(photoReference: string, apiKey: string): string {
  return `${PLACES_API_BASE}/photo?maxwidth=400&photo_reference=${photoReference}&key=${apiKey}`;
}

function mapPlaceToRestaurant(place: LegacyPlace, apiKey: string): Restaurant {
  const photos = (place.photos ?? [])
    .slice(0, 5)
    .map((p) => buildPhotoUrl(p.photo_reference, apiKey));

  return {
    id: uuidv4(),
    placeId: place.place_id,
    name: place.name,
    address: place.vicinity ?? place.formatted_address ?? '',
    rating: place.rating ?? 0,
    reviewCount: place.user_ratings_total ?? 0,
    priceLevel: place.price_level ?? null,
    photos,
    lat: place.geometry?.location.lat ?? 0,
    lng: place.geometry?.location.lng ?? 0,
    websiteUrl: null,
    googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
  };
}

async function searchNearby(
  lat: number,
  lng: number,
  radiusMeters: number = 500,
  maxResults: number = 10
): Promise<Restaurant[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY が設定されていません');

  const response = await axios.get<LegacySearchResponse>(
    `${PLACES_API_BASE}/nearbysearch/json`,
    {
      timeout: 8000,
      params: {
        location: `${lat},${lng}`,
        radius: radiusMeters,
        type: 'restaurant',
        maxresults: maxResults,
        language: 'ja',
        key: apiKey,
      },
    }
  );

  if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API error: ${response.data.status}`);
  }

  return response.data.results.slice(0, maxResults).map((p) => mapPlaceToRestaurant(p, apiKey));
}

async function searchByText(
  textQuery: string,
  lat: number,
  lng: number,
  radiusMeters: number = 500,
  maxResults: number = 10
): Promise<Restaurant[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY が設定されていません');

  const response = await axios.get<LegacySearchResponse>(
    `${PLACES_API_BASE}/textsearch/json`,
    {
      timeout: 8000,
      params: {
        query: textQuery,
        type: 'restaurant',
        location: `${lat},${lng}`,
        radius: radiusMeters,
        language: 'ja',
        key: apiKey,
      },
    }
  );

  if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API error: ${response.data.status}`);
  }

  return response.data.results.slice(0, maxResults).map((p) => mapPlaceToRestaurant(p, apiKey));
}

export async function searchRestaurants(
  keywords: string[],
  lat: number,
  lng: number,
  radiusMeters: number = 500
): Promise<Restaurant[]> {
  if (keywords.length > 0) {
    const textQuery = keywords.join(' ');
    console.log(`[PlacesService] Text Search: query="${textQuery}", lat=${lat}, lng=${lng}, radius=${radiusMeters}m`);
    return searchByText(textQuery, lat, lng, radiusMeters);
  } else {
    console.log(`[PlacesService] Nearby Search: lat=${lat}, lng=${lng}, radius=${radiusMeters}m`);
    return searchNearby(lat, lng, radiusMeters);
  }
}

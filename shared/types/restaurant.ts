// 飲食店
export interface Restaurant {
  id: string;         // アプリ内部ID（UUIDなど）
  placeId: string;    // Google Places API の place_id
  name: string;
  address: string;
  rating: number;     // 0.0 〜 5.0
  reviewCount: number;
  priceLevel: number | null; // 0 〜 4（Google Places の price_level）
  photos: string[];   // 画像URLの配列
  lat: number;
  lng: number;
  websiteUrl: string | null;
  googleMapsUrl: string;
}

// クチコミ
export interface Review {
  authorName: string;
  rating: number;         // 1 〜 5
  text: string;
  relativeTimeDescription: string; // 例: "3 か月前"
}

// 検索パラメータ
export interface SearchParams {
  location: {
    lat: number;
    lng: number;
  };
  keyword: string;
  radius: number; // メートル単位（例: 500, 1000, 1500）
}

// 検索結果（候補一覧）
export interface SearchResult {
  restaurants: Restaurant[];
  searchParams: SearchParams;
  searchedAt: string; // ISO 8601
}

// 飲食店候補（セッション内での投票状況付き）
export interface RestaurantCandidate {
  restaurant: Restaurant;
  sessionId: string;
  keepCount: number;   // キープ票数
  rejectCount: number; // 除外票数
  totalVoters: number; // 全投票者数
}

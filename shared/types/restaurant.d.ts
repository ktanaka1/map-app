export interface Restaurant {
    id: string;
    placeId: string;
    name: string;
    address: string;
    rating: number;
    reviewCount: number;
    priceLevel: number | null;
    photos: string[];
    lat: number;
    lng: number;
    websiteUrl: string | null;
    googleMapsUrl: string;
}
export interface Review {
    authorName: string;
    rating: number;
    text: string;
    relativeTimeDescription: string;
}
export interface SearchParams {
    location: {
        lat: number;
        lng: number;
    };
    keyword: string;
    radius: number;
}
export interface SearchResult {
    restaurants: Restaurant[];
    searchParams: SearchParams;
    searchedAt: string;
}
export interface RestaurantCandidate {
    restaurant: Restaurant;
    sessionId: string;
    keepCount: number;
    rejectCount: number;
    totalVoters: number;
}
//# sourceMappingURL=restaurant.d.ts.map
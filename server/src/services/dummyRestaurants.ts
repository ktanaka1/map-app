import { v4 as uuidv4 } from 'uuid';
import type { Restaurant } from 'shared/types';

/**
 * Google Places API の代替ダミーデータ（開発用）
 */
export function generateDummyRestaurants(keywords: string[]): Restaurant[] {
  const keyword = keywords.join('・') || '飲食店';

  const dummies: Restaurant[] = [
    {
      id: uuidv4(),
      placeId: 'ChIJ_dummy_001',
      name: `${keyword}の名店 山田屋`,
      address: '東京都渋谷区道玄坂1-2-3',
      rating: 4.3,
      reviewCount: 128,
      priceLevel: 2,
      photos: [],
      lat: 35.6595,
      lng: 139.7005,
      websiteUrl: null,
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=35.6595,139.7005',
    },
    {
      id: uuidv4(),
      placeId: 'ChIJ_dummy_002',
      name: `${keyword}処 鈴木食堂`,
      address: '東京都渋谷区宇田川町4-5-6',
      rating: 3.8,
      reviewCount: 54,
      priceLevel: 1,
      photos: [],
      lat: 35.6612,
      lng: 139.6983,
      websiteUrl: null,
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=35.6612,139.6983',
    },
    {
      id: uuidv4(),
      placeId: 'ChIJ_dummy_003',
      name: `厳選${keyword} 銀座亭`,
      address: '東京都渋谷区桜丘町7-8-9',
      rating: 4.7,
      reviewCount: 312,
      priceLevel: 3,
      photos: [],
      lat: 35.6578,
      lng: 139.7021,
      websiteUrl: 'https://example.com/ginzatei',
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=35.6578,139.7021',
    },
    {
      id: uuidv4(),
      placeId: 'ChIJ_dummy_004',
      name: `こだわり${keyword} 佐藤商店`,
      address: '東京都渋谷区神南2-3-4',
      rating: 4.1,
      reviewCount: 89,
      priceLevel: 2,
      photos: [],
      lat: 35.6631,
      lng: 139.6972,
      websiteUrl: null,
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=35.6631,139.6972',
    },
    {
      id: uuidv4(),
      placeId: 'ChIJ_dummy_005',
      name: `老舗${keyword} 田中本店`,
      address: '東京都渋谷区猿楽町1-1-1',
      rating: 4.5,
      reviewCount: 201,
      priceLevel: 3,
      photos: [],
      lat: 35.6521,
      lng: 139.7043,
      websiteUrl: 'https://example.com/tanaka',
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=35.6521,139.7043',
    },
  ];

  return dummies;
}

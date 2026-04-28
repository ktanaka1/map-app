import type { VoteChoice, VotingResult } from 'shared/types';

/**
 * 1つの飲食店の投票集計
 */
export interface RestaurantVoteSummary {
  restaurantId: string;
  votes: { participantId: string; choice: VoteChoice }[];
}

/**
 * 投票判定ロジック（純粋関数）
 *
 * ルール:
 *   1. 全員一致で "keep" の飲食店のみキープとして通過する
 *   2. キープが1件も無かった場合（全滅）はフォールバック:
 *      "keep" 票数が最多の飲食店を fallbackRestaurantId として返す
 *      （同数の場合は先頭のものを採用）
 *
 * @param summaries  各飲食店の投票集計リスト（全員分の投票が揃っていること）
 * @param totalParticipants  投票に参加した人数
 * @returns VotingResult
 */
export function judgeVotes(
  summaries: RestaurantVoteSummary[],
  totalParticipants: number
): VotingResult {
  if (summaries.length === 0) {
    return {
      keptRestaurantIds: [],
      fallbackRestaurantId: null,
      isFallback: false,
    };
  }

  // 各飲食店の "keep" 票数を集計
  const keepCounts = summaries.map((s) => ({
    restaurantId: s.restaurantId,
    keepCount: s.votes.filter((v) => v.choice === 'keep').length,
  }));

  // 全員一致でキープされた飲食店を抽出
  const keptRestaurantIds = keepCounts
    .filter((r) => r.keepCount === totalParticipants)
    .map((r) => r.restaurantId);

  if (keptRestaurantIds.length > 0) {
    return {
      keptRestaurantIds,
      fallbackRestaurantId: null,
      isFallback: false,
    };
  }

  // 全滅フォールバック: keep 票数が最多の飲食店を選ぶ
  const sorted = [...keepCounts].sort((a, b) => b.keepCount - a.keepCount);
  const fallbackRestaurantId = sorted[0]?.restaurantId ?? null;

  return {
    keptRestaurantIds: [],
    fallbackRestaurantId,
    isFallback: true,
  };
}

/**
 * 全員が全候補に投票完了しているかチェックする（純粋関数）
 *
 * @param summaries  各飲食店の投票集計リスト
 * @param totalParticipants  投票に参加した人数
 * @param totalRestaurants   候補飲食店の総数
 * @returns すべての投票が揃っていれば true
 */
export function isVotingComplete(
  summaries: RestaurantVoteSummary[],
  totalParticipants: number,
  totalRestaurants: number
): boolean {
  if (summaries.length !== totalRestaurants) return false;
  return summaries.every((s) => s.votes.length === totalParticipants);
}

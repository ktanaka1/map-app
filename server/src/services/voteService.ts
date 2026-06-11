import type { VoteChoice, VotingResult } from "shared/types";
import type { Restaurant } from "shared/types";

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
 *   3. 全候補の "keep" 票数が0（全員が全店除外）の場合はフォールバックせず、
 *      allRejected=true を返して再検索を促す
 *
 * @param summaries  各飲食店の投票集計リスト（全員分の投票が揃っていること）
 * @param totalParticipants  投票に参加した人数
 * @returns VotingResult
 */
export function judgeVotes(
  summaries: RestaurantVoteSummary[],
  totalParticipants: number,
): VotingResult {
  if (summaries.length === 0) {
    return {
      keptRestaurantIds: [],
      fallbackRestaurantId: null,
      isFallback: false,
      allRejected: false,
    };
  }

  // 各飲食店の "keep" 票数を集計
  const keepCounts = summaries.map((s) => ({
    restaurantId: s.restaurantId,
    keepCount: s.votes.filter((v) => v.choice === "keep").length,
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
      allRejected: false,
    };
  }

  // 全員が全候補を除外: 0票の店を「最も支持された」と偽らず、再検索を促す
  if (keepCounts.every((r) => r.keepCount === 0)) {
    return {
      keptRestaurantIds: [],
      fallbackRestaurantId: null,
      isFallback: false,
      allRejected: true,
    };
  }

  // 全滅フォールバック: keep 票数が最多の飲食店を選ぶ
  const sorted = [...keepCounts].sort((a, b) => b.keepCount - a.keepCount);
  const fallbackRestaurantId = sorted[0]?.restaurantId ?? null;

  return {
    keptRestaurantIds: [],
    fallbackRestaurantId,
    isFallback: true,
    allRejected: false,
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
  totalRestaurants: number,
): boolean {
  if (summaries.length !== totalRestaurants) return false;
  return summaries.every((s) => s.votes.length === totalParticipants);
}

/**
 * 評価順（rating 降順、同点は reviewCount 降順）に並べ替える（純粋関数）
 * 複数キープ時の「評価順で決定」と決選投票の同数タイブレークに使う。
 */
export function sortByRating(restaurants: Restaurant[]): Restaurant[] {
  return [...restaurants].sort(
    (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
  );
}

/** 決選投票の判定結果 */
export interface RunoffOutcome {
  winnerRestaurantId: string;
  /** 最多得票が同数で、評価順タイブレークを使ったか */
  tieBroken: boolean;
}

/**
 * 決選投票の判定ロジック（純粋関数）
 *
 * ルール:
 *   1. 1人1票。最多得票の飲食店が決定
 *   2. 最多得票が同数の場合は、同数の店の中から評価順
 *      （rating 降順、同点は reviewCount 降順）で1位を採用する
 *
 * @param votes  participantId -> restaurantId の投票（全員分揃っていること）
 * @param candidates  決選投票の候補（キープされた飲食店）
 */
export function judgeRunoff(
  votes: ReadonlyMap<string, string>,
  candidates: Restaurant[],
): RunoffOutcome {
  const counts = new Map<string, number>();
  for (const restaurantId of votes.values()) {
    counts.set(restaurantId, (counts.get(restaurantId) ?? 0) + 1);
  }

  const maxCount = Math.max(...candidates.map((c) => counts.get(c.id) ?? 0));
  const topCandidates = candidates.filter(
    (c) => (counts.get(c.id) ?? 0) === maxCount,
  );

  if (topCandidates.length === 1) {
    return { winnerRestaurantId: topCandidates[0].id, tieBroken: false };
  }

  const winner = sortByRating(topCandidates)[0];
  return { winnerRestaurantId: winner.id, tieBroken: true };
}

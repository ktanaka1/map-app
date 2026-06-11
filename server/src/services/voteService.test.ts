import type { Restaurant } from "shared/types";
import {
  judgeVotes,
  isVotingComplete,
  judgeRunoff,
  sortByRating,
  RestaurantVoteSummary,
} from "./voteService";

// テスト用ヘルパー
function makeSummary(
  restaurantId: string,
  votes: { participantId: string; choice: "keep" | "reject" }[],
): RestaurantVoteSummary {
  return { restaurantId, votes };
}

describe("judgeVotes", () => {
  describe("全員一致でキープされた飲食店がある場合", () => {
    it('全員が "keep" した飲食店のみ keptRestaurantIds に含まれる', () => {
      const summaries: RestaurantVoteSummary[] = [
        makeSummary("r1", [
          { participantId: "p1", choice: "keep" },
          { participantId: "p2", choice: "keep" },
        ]),
        makeSummary("r2", [
          { participantId: "p1", choice: "keep" },
          { participantId: "p2", choice: "reject" },
        ]),
      ];

      const result = judgeVotes(summaries, 2);

      expect(result.keptRestaurantIds).toEqual(["r1"]);
      expect(result.fallbackRestaurantId).toBeNull();
      expect(result.isFallback).toBe(false);
    });

    it("複数の飲食店が全員一致でキープされた場合、全て含まれる", () => {
      const summaries: RestaurantVoteSummary[] = [
        makeSummary("r1", [
          { participantId: "p1", choice: "keep" },
          { participantId: "p2", choice: "keep" },
          { participantId: "p3", choice: "keep" },
        ]),
        makeSummary("r2", [
          { participantId: "p1", choice: "keep" },
          { participantId: "p2", choice: "keep" },
          { participantId: "p3", choice: "keep" },
        ]),
        makeSummary("r3", [
          { participantId: "p1", choice: "reject" },
          { participantId: "p2", choice: "keep" },
          { participantId: "p3", choice: "keep" },
        ]),
      ];

      const result = judgeVotes(summaries, 3);

      expect(result.keptRestaurantIds).toEqual(["r1", "r2"]);
      expect(result.isFallback).toBe(false);
    });

    it("ソロモード（参加者1人）で keep すれば通過する", () => {
      const summaries: RestaurantVoteSummary[] = [
        makeSummary("r1", [{ participantId: "p1", choice: "keep" }]),
        makeSummary("r2", [{ participantId: "p1", choice: "reject" }]),
      ];

      const result = judgeVotes(summaries, 1);

      expect(result.keptRestaurantIds).toEqual(["r1"]);
      expect(result.isFallback).toBe(false);
    });
  });

  describe("全員が reject した場合（全滅フォールバック）", () => {
    it("全員 reject の場合は isFallback=true で keep 票数最多の店を返す", () => {
      const summaries: RestaurantVoteSummary[] = [
        makeSummary("r1", [
          { participantId: "p1", choice: "reject" },
          { participantId: "p2", choice: "reject" },
        ]),
        makeSummary("r2", [
          { participantId: "p1", choice: "keep" },
          { participantId: "p2", choice: "reject" },
        ]),
        makeSummary("r3", [
          { participantId: "p1", choice: "reject" },
          { participantId: "p2", choice: "reject" },
        ]),
      ];

      const result = judgeVotes(summaries, 2);

      expect(result.keptRestaurantIds).toEqual([]);
      expect(result.fallbackRestaurantId).toBe("r2"); // keep 票数 1 で最多
      expect(result.isFallback).toBe(true);
    });

    it("keep 票数が同数の場合は先頭の飲食店をフォールバックに選ぶ", () => {
      const summaries: RestaurantVoteSummary[] = [
        makeSummary("r1", [
          { participantId: "p1", choice: "keep" },
          { participantId: "p2", choice: "reject" },
        ]),
        makeSummary("r2", [
          { participantId: "p1", choice: "reject" },
          { participantId: "p2", choice: "keep" },
        ]),
      ];

      const result = judgeVotes(summaries, 2);

      // r1, r2 ともに keep=1 で同数 → 先頭 r1 を採用
      expect(result.fallbackRestaurantId).toBe("r1");
      expect(result.isFallback).toBe(true);
    });

    it("全員が全候補を reject した場合（keep 票数が全て0）はフォールバックせず allRejected=true を返す", () => {
      const summaries: RestaurantVoteSummary[] = [
        makeSummary("r1", [
          { participantId: "p1", choice: "reject" },
          { participantId: "p2", choice: "reject" },
        ]),
        makeSummary("r2", [
          { participantId: "p1", choice: "reject" },
          { participantId: "p2", choice: "reject" },
        ]),
      ];

      const result = judgeVotes(summaries, 2);

      expect(result.keptRestaurantIds).toEqual([]);
      expect(result.fallbackRestaurantId).toBeNull();
      expect(result.isFallback).toBe(false);
      expect(result.allRejected).toBe(true);
    });

    it("キープ票が1票でもあれば allRejected にはならずフォールバックする", () => {
      const summaries: RestaurantVoteSummary[] = [
        makeSummary("r1", [
          { participantId: "p1", choice: "reject" },
          { participantId: "p2", choice: "reject" },
        ]),
        makeSummary("r2", [
          { participantId: "p1", choice: "keep" },
          { participantId: "p2", choice: "reject" },
        ]),
      ];

      const result = judgeVotes(summaries, 2);

      expect(result.fallbackRestaurantId).toBe("r2");
      expect(result.isFallback).toBe(true);
      expect(result.allRejected).toBe(false);
    });
  });

  describe("エッジケース", () => {
    it("summaries が空の場合は全て空を返す", () => {
      const result = judgeVotes([], 2);

      expect(result.keptRestaurantIds).toEqual([]);
      expect(result.fallbackRestaurantId).toBeNull();
      expect(result.isFallback).toBe(false);
    });
  });
});

// 決選投票テスト用ヘルパー
function makeRestaurant(
  id: string,
  rating: number,
  reviewCount: number,
): Restaurant {
  return { id, rating, reviewCount } as unknown as Restaurant;
}

describe("sortByRating", () => {
  it("rating 降順、同点なら reviewCount 降順に並べる", () => {
    const sorted = sortByRating([
      makeRestaurant("r1", 4.0, 100),
      makeRestaurant("r2", 4.5, 10),
      makeRestaurant("r3", 4.5, 200),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["r3", "r2", "r1"]);
  });

  it("元の配列を破壊しない", () => {
    const original = [
      makeRestaurant("r1", 3.0, 1),
      makeRestaurant("r2", 5.0, 1),
    ];
    sortByRating(original);
    expect(original.map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});

describe("judgeRunoff", () => {
  const candidates = [
    makeRestaurant("r1", 3.5, 50),
    makeRestaurant("r2", 4.2, 80),
    makeRestaurant("r3", 4.2, 30),
  ];

  it("最多得票の店が勝者になる", () => {
    const votes = new Map([
      ["p1", "r1"],
      ["p2", "r1"],
      ["p3", "r2"],
    ]);
    const outcome = judgeRunoff(votes, candidates);
    expect(outcome.winnerRestaurantId).toBe("r1");
    expect(outcome.tieBroken).toBe(false);
  });

  it("同数の場合は評価順（rating→reviewCount）でタイブレークする", () => {
    const votes = new Map([
      ["p1", "r1"],
      ["p2", "r2"],
    ]);
    const outcome = judgeRunoff(votes, candidates);
    // r1(3.5) vs r2(4.2) → r2 が勝者
    expect(outcome.winnerRestaurantId).toBe("r2");
    expect(outcome.tieBroken).toBe(true);
  });

  it("rating まで同点なら reviewCount で決まる", () => {
    const votes = new Map([
      ["p1", "r2"],
      ["p2", "r3"],
    ]);
    const outcome = judgeRunoff(votes, candidates);
    // r2(4.2, 80) vs r3(4.2, 30) → r2
    expect(outcome.winnerRestaurantId).toBe("r2");
    expect(outcome.tieBroken).toBe(true);
  });

  it("1人だけの投票（離脱で残り1人になった場合）でも判定できる", () => {
    const votes = new Map([["p1", "r3"]]);
    const outcome = judgeRunoff(votes, candidates);
    expect(outcome.winnerRestaurantId).toBe("r3");
    expect(outcome.tieBroken).toBe(false);
  });
});

describe("isVotingComplete", () => {
  it("全員が全候補に投票していれば true を返す", () => {
    const summaries: RestaurantVoteSummary[] = [
      makeSummary("r1", [
        { participantId: "p1", choice: "keep" },
        { participantId: "p2", choice: "reject" },
      ]),
      makeSummary("r2", [
        { participantId: "p1", choice: "reject" },
        { participantId: "p2", choice: "keep" },
      ]),
    ];

    expect(isVotingComplete(summaries, 2, 2)).toBe(true);
  });

  it("一部の投票が未完了の場合は false を返す", () => {
    const summaries: RestaurantVoteSummary[] = [
      makeSummary("r1", [
        { participantId: "p1", choice: "keep" },
        // p2 の投票なし
      ]),
      makeSummary("r2", [
        { participantId: "p1", choice: "keep" },
        { participantId: "p2", choice: "keep" },
      ]),
    ];

    expect(isVotingComplete(summaries, 2, 2)).toBe(false);
  });

  it("候補店舗数が一致しない場合は false を返す", () => {
    const summaries: RestaurantVoteSummary[] = [
      makeSummary("r1", [
        { participantId: "p1", choice: "keep" },
        { participantId: "p2", choice: "keep" },
      ]),
      // r2, r3 の summaries がない
    ];

    expect(isVotingComplete(summaries, 2, 3)).toBe(false);
  });
});

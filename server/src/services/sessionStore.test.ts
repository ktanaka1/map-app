import type { Restaurant } from "shared/types";
import {
  createSession,
  addParticipant,
  setRestaurants,
  setPhase,
  recordVote,
  buildVoteSummaries,
  purgeVotesByParticipant,
  countVotesByParticipant,
  getVotedRestaurantIds,
  removeParticipantById,
  deleteSession,
} from "./sessionStore";
import { isVotingComplete, judgeVotes } from "./voteService";

const makeRestaurant = (id: string): Restaurant =>
  ({ id }) as unknown as Restaurant;

describe("sessionStore: 投票中の参加者離脱", () => {
  let sessionId: string;

  afterEach(() => {
    deleteSession(sessionId);
  });

  /**
   * 3人セッションで1人が投票途中に離脱しても、
   * 票のパージ後に残り2人で完了判定が成立すること（デッドロック防止）
   */
  it("離脱者の票をパージすれば残りの参加者だけで投票完了が成立する", () => {
    const entry = createSession("multi", "ホスト", "socket-host");
    sessionId = entry.session.id;
    const hostId = entry.session.hostId;

    const b = addParticipant(sessionId, "B", "socket-b");
    const c = addParticipant(sessionId, "C", "socket-c");
    if ("error" in b || "error" in c) throw new Error("参加に失敗");

    setRestaurants(sessionId, [makeRestaurant("r1"), makeRestaurant("r2")]);
    setPhase(sessionId, "voting");

    // ホストとBは全候補に投票済み、Cは r1 にだけ投票して離脱
    recordVote(sessionId, hostId, "r1", "keep");
    recordVote(sessionId, hostId, "r2", "reject");
    recordVote(sessionId, b.participant.id, "r1", "keep");
    recordVote(sessionId, b.participant.id, "r2", "reject");
    recordVote(sessionId, c.participant.id, "r1", "reject");

    // パージ前: Cの票が残っているため永遠に完了しない（旧バグの再現条件）
    removeParticipantById(sessionId, c.participant.id);
    expect(isVotingComplete(buildVoteSummaries(entry), 2, 2)).toBe(false);

    // パージ後: 残り2人分で完了判定が成立する
    purgeVotesByParticipant(sessionId, c.participant.id);
    const summaries = buildVoteSummaries(entry);
    expect(isVotingComplete(summaries, 2, 2)).toBe(true);

    // 判定も残った2人の票だけで行われる（Cのrejectは影響しない）
    const result = judgeVotes(summaries, 2);
    expect(result.keptRestaurantIds).toEqual(["r1"]);
    expect(result.isFallback).toBe(false);
  });

  it("countVotesByParticipant は参加者ごとの累計投票数を返す", () => {
    const entry = createSession("multi", "ホスト", "socket-host");
    sessionId = entry.session.id;
    const hostId = entry.session.hostId;

    const b = addParticipant(sessionId, "B", "socket-b");
    if ("error" in b) throw new Error("参加に失敗");

    setRestaurants(sessionId, [makeRestaurant("r1"), makeRestaurant("r2")]);

    recordVote(sessionId, hostId, "r1", "keep");
    recordVote(sessionId, hostId, "r2", "keep");
    recordVote(sessionId, b.participant.id, "r1", "reject");
    // 同じ店への再投票は上書きであり、カウントは増えない
    recordVote(sessionId, b.participant.id, "r1", "keep");

    expect(countVotesByParticipant(entry)).toEqual({
      [hostId]: 2,
      [b.participant.id]: 1,
    });
  });

  it("getVotedRestaurantIds は指定参加者の投票済み店舗IDを返す", () => {
    const entry = createSession("multi", "ホスト", "socket-host");
    sessionId = entry.session.id;
    const hostId = entry.session.hostId;

    setRestaurants(sessionId, [makeRestaurant("r1"), makeRestaurant("r2")]);
    recordVote(sessionId, hostId, "r2", "keep");

    expect(getVotedRestaurantIds(entry, hostId)).toEqual(["r2"]);
    expect(getVotedRestaurantIds(entry, "unknown")).toEqual([]);
  });
});

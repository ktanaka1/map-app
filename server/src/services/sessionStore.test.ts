import type { Restaurant } from "shared/types";
import {
  createSession,
  addParticipant,
  setRestaurants,
  setPhase,
  setResult,
  recordVote,
  recordRunoffVote,
  buildVoteSummaries,
  purgeVotesByParticipant,
  countVotesByParticipant,
  getVotedRestaurantIds,
  removeParticipantById,
  deleteSession,
  detachSocketFromParticipant,
  scheduleDisconnect,
  MAX_PARTICIPANTS,
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

describe("sessionStore: 参加処理の堅牢性", () => {
  let sessionId: string;

  afterEach(() => {
    deleteSession(sessionId);
  });

  /**
   * ack 未達によるクライアントの join 再送で同一人物が二重登録されると、
   * 幽霊参加者のせいで全員投票の完了判定が永遠に成立しなくなる（旧バグ）
   */
  it("同一ソケットからの join 再送は既存の参加者を返す（冪等）", () => {
    const entry = createSession("multi", "ホスト", "socket-host");
    sessionId = entry.session.id;

    const first = addParticipant(sessionId, "B", "socket-b");
    const retry = addParticipant(sessionId, "B", "socket-b");
    if ("error" in first || "error" in retry) throw new Error("参加に失敗");

    expect(retry.participant.id).toBe(first.participant.id);
    expect(retry.token).toBe(first.token);
    expect(entry.session.participants).toHaveLength(2);
  });

  it("参加人数の上限を超える join は拒否される", () => {
    const entry = createSession("multi", "ホスト", "socket-host");
    sessionId = entry.session.id;

    for (let i = 1; i < MAX_PARTICIPANTS; i++) {
      const res = addParticipant(sessionId, `P${i}`, `socket-${i}`);
      expect("error" in res).toBe(false);
    }
    const overflow = addParticipant(sessionId, "あふれ", "socket-overflow");
    expect("error" in overflow).toBe(true);
    expect(entry.session.participants).toHaveLength(MAX_PARTICIPANTS);
  });

  it("detachSocketFromParticipant は複数セッションのマッピングをすべて外す", () => {
    const entryA = createSession("multi", "ホストA", "socket-shared");
    sessionId = entryA.session.id;
    const entryB = createSession("multi", "ホストB", "socket-shared");

    const detached = detachSocketFromParticipant("socket-shared");
    expect(detached).toHaveLength(2);
    expect(entryA.socketToParticipant.size).toBe(0);
    expect(entryB.socketToParticipant.size).toBe(0);

    deleteSession(entryB.session.id);
  });
});

describe("sessionStore: 候補差し替え時のリセット", () => {
  let sessionId: string;

  afterEach(() => {
    deleteSession(sessionId);
  });

  it("setRestaurants は旧検索の票・結果・決選投票・最終決定をクリアする", () => {
    const entry = createSession("multi", "ホスト", "socket-host");
    sessionId = entry.session.id;
    const hostId = entry.session.hostId;

    setRestaurants(sessionId, [makeRestaurant("r1")]);
    recordVote(sessionId, hostId, "r1", "keep");
    recordRunoffVote(sessionId, hostId, "r1");
    setResult(sessionId, {
      keptRestaurantIds: ["r1"],
      isFallback: false,
      allRejected: false,
      fallbackRestaurantId: null,
    });

    // 再検索: 旧状態が残ると rejoin 復元や完了判定が壊れる
    setRestaurants(sessionId, [makeRestaurant("r2")]);

    expect(entry.votes.size).toBe(0);
    expect(entry.runoffVotes.size).toBe(0);
    expect(entry.result).toBeNull();
    expect(entry.finalDecision).toBeNull();
  });
});

describe("sessionStore: 切断猶予タイマー", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("deleteSession 後は切断タイマーのコールバックが発火しない", () => {
    const entry = createSession("multi", "ホスト", "socket-host");
    const callback = jest.fn();

    scheduleDisconnect(entry.session.hostId, callback);
    deleteSession(entry.session.id);

    jest.runAllTimers();
    expect(callback).not.toHaveBeenCalled();
  });

  it("タイマーコールバックが throw してもプロセスを巻き込まない", () => {
    const entry = createSession("multi", "ホスト", "socket-host");
    scheduleDisconnect(entry.session.hostId, () => {
      throw new Error("boom");
    });

    expect(() => jest.runAllTimers()).not.toThrow();
    deleteSession(entry.session.id);
  });
});

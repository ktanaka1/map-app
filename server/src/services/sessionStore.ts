import { v4 as uuidv4 } from "uuid";
import type {
  Session,
  Participant,
  SessionMode,
  SessionPhase,
  VoteChoice,
  VotingResult,
} from "shared/types";
import type { Restaurant } from "shared/types";
import type { RestaurantVoteSummary } from "./voteService";

/**
 * インメモリセッションストア
 * sessionId -> InMemorySession
 */

export interface VoteEntry {
  participantId: string;
  choice: VoteChoice;
}

export interface InMemorySession {
  session: Session;
  restaurants: Restaurant[];
  /** restaurantId -> VoteEntry[] */
  votes: Map<string, VoteEntry[]>;
  /** socketId -> participantId */
  socketToParticipant: Map<string, string>;
  /** 判定済みの投票結果（リジョイン時の復元用） */
  result: VotingResult | null;
}

const sessions = new Map<string, InMemorySession>();

/** participantId -> NodeJS.Timeout: 切断後のセッション削除タイマー */
const disconnectTimers = new Map<string, NodeJS.Timeout>();

const GRACE_PERIOD_MS = 15_000;

/**
 * 切断時に遅延削除をスケジュールする。
 * callback は GRACE_PERIOD_MS 後に呼ばれる（rejoin されなかった場合のクリーンアップ用）。
 */
export function scheduleDisconnect(
  participantId: string,
  callback: () => void,
): void {
  cancelDisconnect(participantId);
  const timer = setTimeout(() => {
    disconnectTimers.delete(participantId);
    callback();
  }, GRACE_PERIOD_MS);
  disconnectTimers.set(participantId, timer);
}

/** リジョイン成功時などにタイマーをキャンセルする */
export function cancelDisconnect(participantId: string): void {
  const timer = disconnectTimers.get(participantId);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(participantId);
  }
}

/** セッションIDに使う6文字英数字を生成（既存セッションと衝突しないものを返す） */
function generateSessionId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id: string;
  do {
    id = "";
    for (let i = 0; i < 6; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (sessions.has(id));
  return id;
}

export function createSession(
  mode: SessionMode,
  hostName: string,
  socketId: string,
): InMemorySession {
  const sessionId = generateSessionId();
  const hostId = uuidv4();
  const host: Participant = { id: hostId, name: hostName, isHost: true };

  const initialPhase: SessionPhase = mode === "solo" ? "keyword" : "waiting";

  const session: Session = {
    id: sessionId,
    mode,
    phase: initialPhase,
    hostId,
    participants: [host],
    keywords: [],
    createdAt: new Date().toISOString(),
  };

  const socketToParticipant = new Map<string, string>();
  socketToParticipant.set(socketId, hostId);

  const entry: InMemorySession = {
    session,
    restaurants: [],
    votes: new Map(),
    socketToParticipant,
    result: null,
  };

  sessions.set(sessionId, entry);
  return entry;
}

export function getSession(sessionId: string): InMemorySession | undefined {
  return sessions.get(sessionId);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function addParticipant(
  sessionId: string,
  name: string,
  socketId: string,
): { entry: InMemorySession; participant: Participant } | { error: string } {
  const entry = sessions.get(sessionId);
  if (!entry) return { error: "セッションが見つかりません" };
  if (entry.session.phase !== "waiting")
    return { error: "参加受付は終了しました" };

  const participant: Participant = { id: uuidv4(), name, isHost: false };
  entry.session.participants.push(participant);
  entry.socketToParticipant.set(socketId, participant.id);
  return { entry, participant };
}

export function setPhase(
  sessionId: string,
  phase: SessionPhase,
): InMemorySession | undefined {
  const entry = sessions.get(sessionId);
  if (!entry) return undefined;
  entry.session.phase = phase;
  return entry;
}

export function addKeyword(
  sessionId: string,
  keyword: string,
): InMemorySession | undefined {
  const entry = sessions.get(sessionId);
  if (!entry) return undefined;
  if (!entry.session.keywords.includes(keyword)) {
    entry.session.keywords.push(keyword);
  }
  return entry;
}

export function removeKeyword(
  sessionId: string,
  keyword: string,
): InMemorySession | undefined {
  const entry = sessions.get(sessionId);
  if (!entry) return undefined;
  entry.session.keywords = entry.session.keywords.filter((k) => k !== keyword);
  return entry;
}

export function setRestaurants(
  sessionId: string,
  restaurants: Restaurant[],
): void {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  entry.restaurants = restaurants;
}

export function recordVote(
  sessionId: string,
  participantId: string,
  restaurantId: string,
  choice: VoteChoice,
): InMemorySession | undefined {
  const entry = sessions.get(sessionId);
  if (!entry) return undefined;

  if (!entry.votes.has(restaurantId)) {
    entry.votes.set(restaurantId, []);
  }
  const existing = entry.votes.get(restaurantId)!;
  const idx = existing.findIndex((v) => v.participantId === participantId);
  if (idx >= 0) {
    existing[idx] = { participantId, choice };
  } else {
    existing.push({ participantId, choice });
  }
  return entry;
}

export function buildVoteSummaries(
  entry: InMemorySession,
): RestaurantVoteSummary[] {
  return entry.restaurants.map((r) => ({
    restaurantId: r.id,
    votes: entry.votes.get(r.id) ?? [],
  }));
}

export function setResult(sessionId: string, result: VotingResult): void {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  entry.result = result;
}

/**
 * 離脱した参加者の投票をすべて削除する。
 * 残しておくと isVotingComplete の「票数 === 参加者数」判定が永遠に成立しなくなる。
 */
export function purgeVotesByParticipant(
  sessionId: string,
  participantId: string,
): void {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  for (const [restaurantId, votes] of entry.votes.entries()) {
    entry.votes.set(
      restaurantId,
      votes.filter((v) => v.participantId !== participantId),
    );
  }
}

/** 参加者ごとの累計投票数を集計する（リジョイン時の進捗復元用） */
export function countVotesByParticipant(
  entry: InMemorySession,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const votes of entry.votes.values()) {
    for (const v of votes) {
      counts[v.participantId] = (counts[v.participantId] ?? 0) + 1;
    }
  }
  return counts;
}

/** 指定参加者が投票済みのレストランID一覧を返す（リジョイン時の復元用） */
export function getVotedRestaurantIds(
  entry: InMemorySession,
  participantId: string,
): string[] {
  const ids: string[] = [];
  for (const [restaurantId, votes] of entry.votes.entries()) {
    if (votes.some((v) => v.participantId === participantId)) {
      ids.push(restaurantId);
    }
  }
  return ids;
}

/** 全セッションのイテレータを返す（TTLスイーパー用） */
export function getAllSessions(): IterableIterator<[string, InMemorySession]> {
  return sessions.entries();
}

/** socketIdでの参加者情報を探し、セッションIDも返す */
export function findParticipantBySocket(socketId: string):
  | {
      sessionId: string;
      participantId: string;
      entry: InMemorySession;
    }
  | undefined {
  for (const [sessionId, entry] of sessions.entries()) {
    const participantId = entry.socketToParticipant.get(socketId);
    if (participantId) {
      return { sessionId, participantId, entry };
    }
  }
  return undefined;
}

/**
 * リジョイン時に既存のparticipantIdに対して新しいsocketIdでマッピングを更新する。
 * 古いsocketIdのマッピングがあれば削除してから新しいものを登録する。
 * 参加者がセッションに存在しない場合はundefinedを返す。
 */
export function updateSocketMapping(
  sessionId: string,
  participantId: string,
  newSocketId: string,
): InMemorySession | undefined {
  const entry = sessions.get(sessionId);
  if (!entry) return undefined;

  const participant = entry.session.participants.find(
    (p) => p.id === participantId,
  );
  if (!participant) return undefined;

  // 古いsocketIdのエントリを削除
  for (const [oldSocketId, pid] of entry.socketToParticipant.entries()) {
    if (pid === participantId) {
      entry.socketToParticipant.delete(oldSocketId);
      break;
    }
  }

  entry.socketToParticipant.set(newSocketId, participantId);
  return entry;
}

/**
 * socketIdのマッピングのみ削除し、participants配列はそのままにする。
 * リロード猶予期間中は参加者をセッションに残すために使用する。
 */
export function detachSocketFromParticipant(socketId: string):
  | {
      sessionId: string;
      participantId: string;
      entry: InMemorySession;
    }
  | undefined {
  for (const [sessionId, entry] of sessions.entries()) {
    const participantId = entry.socketToParticipant.get(socketId);
    if (participantId) {
      entry.socketToParticipant.delete(socketId);
      return { sessionId, participantId, entry };
    }
  }
  return undefined;
}

/** participantIdで参加者をセッションから削除する */
export function removeParticipantById(
  sessionId: string,
  participantId: string,
): void {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  entry.session.participants = entry.session.participants.filter(
    (p) => p.id !== participantId,
  );
}

export function removeParticipantBySocket(socketId: string):
  | {
      sessionId: string;
      removedParticipantId: string;
      entry: InMemorySession;
    }
  | undefined {
  for (const [sessionId, entry] of sessions.entries()) {
    const participantId = entry.socketToParticipant.get(socketId);
    if (participantId) {
      entry.socketToParticipant.delete(socketId);
      entry.session.participants = entry.session.participants.filter(
        (p) => p.id !== participantId,
      );
      return { sessionId, removedParticipantId: participantId, entry };
    }
  }
  return undefined;
}

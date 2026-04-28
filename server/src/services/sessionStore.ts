import { v4 as uuidv4 } from 'uuid';
import type { Session, Participant, SessionMode, SessionPhase, VoteChoice } from 'shared/types';
import type { Restaurant } from 'shared/types';
import type { RestaurantVoteSummary } from './voteService';

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
}

const sessions = new Map<string, InMemorySession>();

/** セッションIDに使う6文字英数字を生成 */
function generateSessionId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function createSession(mode: SessionMode, hostName: string, socketId: string): InMemorySession {
  const sessionId = generateSessionId();
  const hostId = uuidv4();
  const host: Participant = { id: hostId, name: hostName, isHost: true };

  const initialPhase: SessionPhase = mode === 'solo' ? 'keyword' : 'waiting';

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
  socketId: string
): { entry: InMemorySession; participant: Participant } | { error: string } {
  const entry = sessions.get(sessionId);
  if (!entry) return { error: 'セッションが見つかりません' };
  if (entry.session.phase !== 'waiting') return { error: '参加受付は終了しました' };

  const participant: Participant = { id: uuidv4(), name, isHost: false };
  entry.session.participants.push(participant);
  entry.socketToParticipant.set(socketId, participant.id);
  return { entry, participant };
}

export function setPhase(sessionId: string, phase: SessionPhase): InMemorySession | undefined {
  const entry = sessions.get(sessionId);
  if (!entry) return undefined;
  entry.session.phase = phase;
  return entry;
}

export function addKeyword(sessionId: string, keyword: string): InMemorySession | undefined {
  const entry = sessions.get(sessionId);
  if (!entry) return undefined;
  if (!entry.session.keywords.includes(keyword)) {
    entry.session.keywords.push(keyword);
  }
  return entry;
}

export function removeKeyword(sessionId: string, keyword: string): InMemorySession | undefined {
  const entry = sessions.get(sessionId);
  if (!entry) return undefined;
  entry.session.keywords = entry.session.keywords.filter((k) => k !== keyword);
  return entry;
}

export function setRestaurants(sessionId: string, restaurants: Restaurant[]): void {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  entry.restaurants = restaurants;
}

export function recordVote(
  sessionId: string,
  participantId: string,
  restaurantId: string,
  choice: VoteChoice
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

export function buildVoteSummaries(entry: InMemorySession): RestaurantVoteSummary[] {
  return entry.restaurants.map((r) => ({
    restaurantId: r.id,
    votes: entry.votes.get(r.id) ?? [],
  }));
}

/** socketIdでの参加者情報を探し、セッションIDも返す */
export function findParticipantBySocket(socketId: string): {
  sessionId: string;
  participantId: string;
  entry: InMemorySession;
} | undefined {
  for (const [sessionId, entry] of sessions.entries()) {
    const participantId = entry.socketToParticipant.get(socketId);
    if (participantId) {
      return { sessionId, participantId, entry };
    }
  }
  return undefined;
}

export function removeParticipantBySocket(socketId: string): {
  sessionId: string;
  removedParticipantId: string;
  entry: InMemorySession;
} | undefined {
  for (const [sessionId, entry] of sessions.entries()) {
    const participantId = entry.socketToParticipant.get(socketId);
    if (participantId) {
      entry.socketToParticipant.delete(socketId);
      entry.session.participants = entry.session.participants.filter(
        (p) => p.id !== participantId
      );
      return { sessionId, removedParticipantId: participantId, entry };
    }
  }
  return undefined;
}

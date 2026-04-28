import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Session,
  Participant,
  VotingResult,
} from 'shared/types';
import type { Restaurant } from 'shared/types';

// ========================================
// localStorage セッション保存ユーティリティ
// ========================================

const SESSION_STORAGE_KEY = 'map_app_session';

export interface StoredSession {
  sessionId: string;
  participantId: string;
  participantName: string;
  isHost: boolean;
}

export function saveSessionToStorage(data: StoredSession): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ストレージへの書き込みに失敗しても動作を継続する
  }
}

export function loadSessionFromStorage(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function clearSessionFromStorage(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // 無視
  }
}

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000';

export interface SessionState {
  session: Session | null;
  /** 自分の参加者情報 */
  me: Participant | null;
  participants: Participant[];
  restaurants: Restaurant[];
  votingResult: VotingResult | null;
  /** 投票済みレストランIDのSet */
  votedRestaurantIds: Set<string>;
  /** 各レストランへの投票完了数 restaurantId -> completedCount */
  voteProgress: Map<string, number>;
  error: string | null;
}

export interface UseSocketReturn {
  socket: AppSocket;
  state: SessionState;
  /** ページリロード後のリジョイン処理中フラグ */
  isRejoining: boolean;
  createSession: (
    mode: 'solo' | 'multi',
    hostName: string,
    callback: (res: { success: boolean; sessionId?: string; participant?: Participant; session?: Session; error?: string }) => void
  ) => void;
  joinSession: (
    sessionId: string,
    participantName: string,
    callback: (res: { success: boolean; error?: string; session?: Session; participant?: Participant }) => void
  ) => void;
  confirmParticipants: (sessionId: string, callback: (res: { success: boolean; error?: string }) => void) => void;
  addKeyword: (sessionId: string, keyword: string, callback: (res: { success: boolean; error?: string }) => void) => void;
  removeKeyword: (sessionId: string, keyword: string, callback: (res: { success: boolean; error?: string }) => void) => void;
  startSearch: (
    sessionId: string,
    location: { lat: number; lng: number },
    radius: number,
    callback: (res: { success: boolean; error?: string }) => void
  ) => void;
  submitVote: (
    sessionId: string,
    restaurantId: string,
    choice: 'keep' | 'reject',
    callback: (res: { success: boolean; error?: string }) => void
  ) => void;
  rejoinSession: (
    sessionId: string,
    participantId: string,
    callback: (res: { success: boolean; error?: string; session?: Session; participant?: Participant; restaurants?: Restaurant[] }) => void
  ) => void;
}

const initialState: SessionState = {
  session: null,
  me: null,
  participants: [],
  restaurants: [],
  votingResult: null,
  votedRestaurantIds: new Set(),
  voteProgress: new Map(),
  error: null,
};

// シングルトンソケットインスタンス（ページをまたいで状態を保持）
let socketSingleton: AppSocket | null = null;

function getSocket(): AppSocket {
  if (!socketSingleton) {
    socketSingleton = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    }) as AppSocket;
  }
  return socketSingleton;
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<AppSocket>(getSocket());
  const [state, setState] = useState<SessionState>(initialState);
  const [isRejoining, setIsRejoining] = useState<boolean>(false);

  const updateState = useCallback((partial: Partial<SessionState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  useEffect(() => {
    const socket = socketRef.current;

    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => {
      console.log('[Socket] connected:', socket.id);

      // 接続確立後にリジョイン試行
      const stored = loadSessionFromStorage();
      if (!stored) return;

      // 現在のURLが /session/:sessionId/ パターンにマッチするか確認
      const match = window.location.pathname.match(/^\/session\/([^/]+)\//);
      if (!match) return;

      const urlSessionId = match[1];
      if (urlSessionId !== stored.sessionId) return;

      setIsRejoining(true);
      console.log('[Socket] rejoin_session 試行:', stored.sessionId);

      socket.emit('rejoin_session', { sessionId: stored.sessionId, participantId: stored.participantId }, (res) => {
        setIsRejoining(false);
        if (res.success && res.session && res.participant) {
          console.log('[Socket] rejoin_session 成功:', stored.sessionId);
          setState({
            ...initialState,
            session: res.session,
            me: res.participant,
            participants: res.session.participants,
            restaurants: res.restaurants ?? [],
          });
        } else {
          console.warn('[Socket] rejoin_session 失敗:', res.error);
          clearSessionFromStorage();
          window.location.href = '/';
        }
      });
    };

    const onDisconnect = (reason: string) => {
      console.log('[Socket] disconnected:', reason);
    };

    const onError = (payload: { code: string; message: string }) => {
      console.error('[Socket] error:', payload);
      updateState({ error: payload.message });
    };

    const onParticipantJoined = (payload: {
      participant: Participant;
      participants: Participant[];
    }) => {
      setState((prev) => ({
        ...prev,
        participants: payload.participants,
        session: prev.session
          ? { ...prev.session, participants: payload.participants }
          : prev.session,
      }));
    };

    const onParticipantLeft = (payload: {
      participantId: string;
      participants: Participant[];
    }) => {
      setState((prev) => ({
        ...prev,
        participants: payload.participants,
        session: prev.session
          ? { ...prev.session, participants: payload.participants }
          : prev.session,
      }));
    };

    const onSessionPhaseChanged = (payload: { phase: Session['phase']; session: Session }) => {
      setState((prev) => ({
        ...prev,
        session: payload.session,
        participants: payload.session.participants,
      }));
    };

    const onKeywordAdded = (payload: { keyword: string; keywords: string[]; addedBy: string }) => {
      setState((prev) => ({
        ...prev,
        session: prev.session
          ? { ...prev.session, keywords: payload.keywords }
          : prev.session,
      }));
    };

    const onKeywordRemoved = (payload: { keyword: string; keywords: string[]; removedBy: string }) => {
      setState((prev) => ({
        ...prev,
        session: prev.session
          ? { ...prev.session, keywords: payload.keywords }
          : prev.session,
      }));
    };

    const onVoteSubmitted = (payload: {
      participantId: string;
      restaurantId: string;
      completedCount: number;
      totalCount: number;
    }) => {
      setState((prev) => {
        const newProgress = new Map(prev.voteProgress);
        newProgress.set(payload.restaurantId, payload.completedCount);
        return { ...prev, voteProgress: newProgress };
      });
    };

    const onVotingCompleted = (payload: { result: VotingResult }) => {
      updateState({ votingResult: payload.result });
    };

    const onSessionEnded = (payload: { reason: string }) => {
      console.log('[Socket] session_ended:', payload.reason);
      clearSessionFromStorage();
      updateState({
        error: `セッションが終了しました（理由: ${payload.reason}）`,
        session: null,
      });
    };

    // restaurants_found は shared/types 外の独自イベント
    const onRestaurantsFound = (payload: { restaurants: Restaurant[] }) => {
      updateState({ restaurants: payload.restaurants });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('error', onError);
    socket.on('participant_joined', onParticipantJoined);
    socket.on('participant_left', onParticipantLeft);
    socket.on('session_phase_changed', onSessionPhaseChanged);
    socket.on('keyword_added', onKeywordAdded);
    socket.on('keyword_removed', onKeywordRemoved);
    socket.on('vote_submitted', onVoteSubmitted);
    socket.on('voting_completed', onVotingCompleted);
    socket.on('session_ended', onSessionEnded);
    (socket as unknown as { on(event: string, handler: (payload: { restaurants: Restaurant[] }) => void): void }).on(
      'restaurants_found',
      onRestaurantsFound
    );

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('error', onError);
      socket.off('participant_joined', onParticipantJoined);
      socket.off('participant_left', onParticipantLeft);
      socket.off('session_phase_changed', onSessionPhaseChanged);
      socket.off('keyword_added', onKeywordAdded);
      socket.off('keyword_removed', onKeywordRemoved);
      socket.off('vote_submitted', onVoteSubmitted);
      socket.off('voting_completed', onVotingCompleted);
      socket.off('session_ended', onSessionEnded);
      (socket as unknown as { off(event: string, handler: (payload: { restaurants: Restaurant[] }) => void): void }).off(
        'restaurants_found',
        onRestaurantsFound
      );
    };
  }, [updateState]);

  const createSession = useCallback(
    (
      mode: 'solo' | 'multi',
      hostName: string,
      callback: (res: { success: boolean; sessionId?: string; participant?: Participant; session?: Session; error?: string }) => void
    ) => {
      (socketRef.current as unknown as {
        emit(event: string, payload: unknown, cb: (res: { success: boolean; sessionId?: string; participant?: Participant; session?: Session; error?: string }) => void): void;
      }).emit('create_session', { mode, hostName }, (res) => {
        if (res.success && res.participant && res.session) {
          setState({
            ...initialState,
            session: res.session!,
            me: res.participant!,
            participants: res.session!.participants,
          });
          saveSessionToStorage({
            sessionId: res.session!.id,
            participantId: res.participant!.id,
            participantName: res.participant!.name,
            isHost: res.participant!.isHost,
          });
        }
        callback(res);
      });
    },
    []
  );

  const joinSession = useCallback(
    (
      sessionId: string,
      participantName: string,
      callback: (res: { success: boolean; error?: string; session?: Session; participant?: Participant }) => void
    ) => {
      socketRef.current.emit(
        'join_session',
        { sessionId, participantName },
        (res) => {
          if (res.success && res.session && res.participant) {
            setState((prev) => ({
              ...prev,
              session: res.session!,
              me: res.participant!,
              participants: res.session!.participants,
            }));
            saveSessionToStorage({
              sessionId: res.session!.id,
              participantId: res.participant!.id,
              participantName: res.participant!.name,
              isHost: res.participant!.isHost,
            });
          }
          callback(res);
        }
      );
    },
    []
  );

  const confirmParticipants = useCallback(
    (sessionId: string, callback: (res: { success: boolean; error?: string }) => void) => {
      socketRef.current.emit('confirm_participants', { sessionId }, callback);
    },
    []
  );

  const addKeyword = useCallback(
    (sessionId: string, keyword: string, callback: (res: { success: boolean; error?: string }) => void) => {
      socketRef.current.emit('add_keyword', { sessionId, keyword }, callback);
    },
    []
  );

  const removeKeyword = useCallback(
    (sessionId: string, keyword: string, callback: (res: { success: boolean; error?: string }) => void) => {
      socketRef.current.emit('remove_keyword', { sessionId, keyword }, callback);
    },
    []
  );

  const startSearch = useCallback(
    (
      sessionId: string,
      location: { lat: number; lng: number },
      radius: number,
      callback: (res: { success: boolean; error?: string }) => void
    ) => {
      socketRef.current.emit('start_search', { sessionId, location, radius }, callback);
    },
    []
  );

  const submitVote = useCallback(
    (
      sessionId: string,
      restaurantId: string,
      choice: 'keep' | 'reject',
      callback: (res: { success: boolean; error?: string }) => void
    ) => {
      socketRef.current.emit('submit_vote', { sessionId, restaurantId, choice }, (res) => {
        if (res.success) {
          setState((prev) => {
            const newVoted = new Set(prev.votedRestaurantIds);
            newVoted.add(restaurantId);
            return { ...prev, votedRestaurantIds: newVoted };
          });
        }
        callback(res);
      });
    },
    []
  );

  const rejoinSession = useCallback(
    (
      sessionId: string,
      participantId: string,
      callback: (res: { success: boolean; error?: string; session?: Session; participant?: Participant; restaurants?: Restaurant[] }) => void
    ) => {
      socketRef.current.emit('rejoin_session', { sessionId, participantId }, (res) => {
        if (res.success && res.session && res.participant) {
          setState({
            ...initialState,
            session: res.session,
            me: res.participant,
            participants: res.session.participants,
            restaurants: res.restaurants ?? [],
          });
        }
        callback(res);
      });
    },
    []
  );

  return {
    socket: socketRef.current,
    state,
    isRejoining,
    createSession,
    joinSession,
    confirmParticipants,
    addKeyword,
    removeKeyword,
    startSearch,
    submitVote,
    rejoinSession,
  };
}

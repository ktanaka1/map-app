import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Session,
  Participant,
  VotingResult,
  FinalDecision,
} from "shared/types";
import type { Restaurant } from "shared/types";

// ========================================
// localStorage セッション保存ユーティリティ
// ========================================

const SESSION_STORAGE_KEY = "map_app_session";

export interface StoredSession {
  sessionId: string;
  participantId: string;
  participantName: string;
  isHost: boolean;
  /** rejoin 認証用トークン（join/create 時にサーバーが発行） */
  token: string;
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

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3000";

/** ack 付き emit の応答待ちタイムアウト（ms）。サーバー無応答時に UI が固まるのを防ぐ */
const ACK_TIMEOUT_MS = 10000;
const TIMEOUT_ERROR = "通信がタイムアウトしました。もう一度お試しください";

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
  /** 参加者ごとの累計投票数 participantId -> voteCount */
  participantVoteCounts: Map<string, number>;
  /** 決選投票で自分が入れた票（未投票なら null） */
  myRunoffVote: string | null;
  /** 決選投票の投票済み人数 */
  runoffVotedCount: number;
  /** 複数キープから1店に絞った最終決定 */
  finalDecision: FinalDecision | null;
}

export interface UseSocketReturn {
  socket: AppSocket;
  state: SessionState;
  /** ページリロード後のリジョイン処理中フラグ */
  isRejoining: boolean;
  /** サーバーとの接続状態（切断中バナー表示用） */
  isConnected: boolean;
  createSession: (
    mode: "solo" | "multi",
    hostName: string,
    callback: (res: {
      success: boolean;
      sessionId?: string;
      participant?: Participant;
      session?: Session;
      error?: string;
    }) => void,
  ) => void;
  joinSession: (
    sessionId: string,
    participantName: string,
    callback: (res: {
      success: boolean;
      error?: string;
      session?: Session;
      participant?: Participant;
    }) => void,
  ) => void;
  confirmParticipants: (
    sessionId: string,
    callback: (res: { success: boolean; error?: string }) => void,
  ) => void;
  addKeyword: (
    sessionId: string,
    keyword: string,
    callback: (res: { success: boolean; error?: string }) => void,
  ) => void;
  removeKeyword: (
    sessionId: string,
    keyword: string,
    callback: (res: { success: boolean; error?: string }) => void,
  ) => void;
  startSearch: (
    sessionId: string,
    location: { lat: number; lng: number },
    radius: number,
    callback: (res: { success: boolean; error?: string }) => void,
    maxPriceLevel?: number | null,
  ) => void;
  submitVote: (
    sessionId: string,
    restaurantId: string,
    choice: "keep" | "reject",
    callback: (res: { success: boolean; error?: string }) => void,
  ) => void;
  rejoinSession: (
    sessionId: string,
    participantId: string,
    token: string,
    callback: (res: {
      success: boolean;
      error?: string;
      session?: Session;
      participant?: Participant;
      restaurants?: Restaurant[];
    }) => void,
  ) => void;
  leaveSession: (
    sessionId: string,
    callback?: (res: { success: boolean; error?: string }) => void,
  ) => void;
  decideByRating: (
    sessionId: string,
    callback: (res: { success: boolean; error?: string }) => void,
  ) => void;
  startRunoff: (
    sessionId: string,
    callback: (res: { success: boolean; error?: string }) => void,
  ) => void;
  submitRunoffVote: (
    sessionId: string,
    restaurantId: string,
    callback: (res: { success: boolean; error?: string }) => void,
  ) => void;
  decidePick: (
    sessionId: string,
    restaurantId: string,
    callback: (res: { success: boolean; error?: string }) => void,
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
  participantVoteCounts: new Map(),
  myRunoffVote: null,
  runoffVotedCount: 0,
  finalDecision: null,
};

// シングルトンソケットインスタンス（ページをまたいで状態を保持）
let socketSingleton: AppSocket | null = null;

function getSocket(): AppSocket {
  if (!socketSingleton) {
    socketSingleton = io(SOCKET_URL, {
      autoConnect: false,
      // 回数制限を設けると電波の悪い環境で静かに再接続を諦めてしまうため無制限にする
      // （セッション自体の生存はサーバー側の切断猶予期間で管理される）
      reconnection: true,
      reconnectionDelay: 1000,
    }) as AppSocket;
  }
  return socketSingleton;
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<AppSocket>(getSocket());
  const [state, setState] = useState<SessionState>(initialState);
  // vote_submitted の重複配信で投票数が水増しされるのを防ぐ
  // （participantId:restaurantId の組で受信済みを記録する）
  const seenVotesRef = useRef<Set<string>>(new Set());
  const [isRejoining, setIsRejoining] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(
    socketRef.current.connected,
  );

  const updateState = useCallback((partial: Partial<SessionState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  useEffect(() => {
    const socket = socketRef.current;

    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => {
      console.log("[Socket] connected:", socket.id);
      setIsConnected(true);

      // 接続確立後にリジョイン試行
      const stored = loadSessionFromStorage();
      if (!stored) return;

      // 現在のURLが /session/:sessionId/ パターンにマッチするか確認
      const match = window.location.pathname.match(/^\/session\/([^/]+)\//);
      if (!match) return;

      const urlSessionId = match[1];
      if (urlSessionId !== stored.sessionId) return;

      setIsRejoining(true);
      console.log("[Socket] rejoin_session 試行:", stored.sessionId);

      socket.timeout(ACK_TIMEOUT_MS).emit(
        "rejoin_session",
        {
          sessionId: stored.sessionId,
          participantId: stored.participantId,
          token: stored.token ?? "",
        },
        (err, res) => {
          setIsRejoining(false);
          if (err) {
            // タイムアウト: 接続は維持し、次回の connect イベントで再試行される
            console.warn("[Socket] rejoin_session タイムアウト");
            return;
          }
          if (res.success && res.session && res.participant) {
            console.log("[Socket] rejoin_session 成功:", stored.sessionId);
            seenVotesRef.current.clear();
            setState({
              ...initialState,
              session: res.session,
              me: res.participant,
              participants: res.session.participants,
              restaurants: res.restaurants ?? [],
              // 投票済み・進捗・結果を復元（リロードで投票がやり直しにならないように）
              votedRestaurantIds: new Set(res.votedRestaurantIds ?? []),
              participantVoteCounts: new Map(
                Object.entries(res.participantVoteCounts ?? {}),
              ),
              votingResult: res.votingResult ?? null,
              myRunoffVote: res.myRunoffVote ?? null,
              runoffVotedCount: res.runoffVotedCount ?? 0,
              finalDecision: res.finalDecision ?? null,
            });
          } else {
            console.warn("[Socket] rejoin_session 失敗:", res.error);
            clearSessionFromStorage();
            // TopPage の ended 表示機構を再利用して理由を伝える
            // （URLSearchParams.get が1回デコードするため、ここで1回だけエンコードする）
            window.location.replace(
              `/?ended=${encodeURIComponent("セッションが見つかりませんでした")}`,
            );
          }
        },
      );
    };

    const onDisconnect = (reason: string) => {
      console.log("[Socket] disconnected:", reason);
      setIsConnected(false);
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

    const onSessionPhaseChanged = (payload: {
      phase: Session["phase"];
      session: Session;
    }) => {
      setState((prev) => ({
        ...prev,
        session: payload.session,
        participants: payload.session.participants,
      }));
    };

    const onKeywordAdded = (payload: {
      keyword: string;
      keywords: string[];
      addedBy: string;
    }) => {
      setState((prev) => ({
        ...prev,
        session: prev.session
          ? { ...prev.session, keywords: payload.keywords }
          : prev.session,
      }));
    };

    const onKeywordRemoved = (payload: {
      keyword: string;
      keywords: string[];
      removedBy: string;
    }) => {
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
      // 同じ参加者×店舗の重複イベントでは累計投票数を加算しない
      const voteKey = `${payload.participantId}:${payload.restaurantId}`;
      const isDuplicate = seenVotesRef.current.has(voteKey);
      seenVotesRef.current.add(voteKey);
      setState((prev) => {
        // completedCount は絶対値なので重複時もそのまま反映してよい（冪等）
        const newProgress = new Map(prev.voteProgress);
        newProgress.set(payload.restaurantId, payload.completedCount);
        if (isDuplicate) {
          return { ...prev, voteProgress: newProgress };
        }
        const newParticipantCounts = new Map(prev.participantVoteCounts);
        newParticipantCounts.set(
          payload.participantId,
          (newParticipantCounts.get(payload.participantId) ?? 0) + 1,
        );
        return {
          ...prev,
          voteProgress: newProgress,
          participantVoteCounts: newParticipantCounts,
        };
      });
    };

    const onVotingCompleted = (payload: { result: VotingResult }) => {
      updateState({ votingResult: payload.result });
    };

    const onRunoffStarted = (payload: {
      restaurantIds: string[];
      session: Session;
    }) => {
      setState((prev) => ({
        ...prev,
        session: payload.session,
        participants: payload.session.participants,
        myRunoffVote: null,
        runoffVotedCount: 0,
      }));
    };

    const onRunoffVoteSubmitted = (payload: {
      participantId: string;
      votedCount: number;
      totalCount: number;
    }) => {
      updateState({ runoffVotedCount: payload.votedCount });
    };

    const onFinalDecision = (payload: {
      decision: FinalDecision;
      session: Session;
    }) => {
      setState((prev) => ({
        ...prev,
        finalDecision: payload.decision,
        session: payload.session,
        participants: payload.session.participants,
      }));
    };

    const onSessionEnded = (payload: { reason: string }) => {
      console.log("[Socket] session_ended:", payload.reason);
      clearSessionFromStorage();
      const reason =
        payload.reason === "host_left"
          ? "ホストが退室したため"
          : payload.reason === "participant_left"
            ? "参加者が退室したため"
            : payload.reason === "timeout"
              ? "一定時間が経過したため"
              : "";
      const msg = reason
        ? `セッションが終了しました（${reason}）`
        : "セッションが終了しました";
      window.location.replace(`/?ended=${encodeURIComponent(msg)}`);
    };

    const onRestaurantsFound = (payload: { restaurants: Restaurant[] }) => {
      // 新しい投票ラウンドが始まるため、受信済み投票の記録をリセットする
      seenVotesRef.current.clear();
      updateState({ restaurants: payload.restaurants });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("participant_joined", onParticipantJoined);
    socket.on("participant_left", onParticipantLeft);
    socket.on("session_phase_changed", onSessionPhaseChanged);
    socket.on("keyword_added", onKeywordAdded);
    socket.on("keyword_removed", onKeywordRemoved);
    socket.on("vote_submitted", onVoteSubmitted);
    socket.on("voting_completed", onVotingCompleted);
    socket.on("runoff_started", onRunoffStarted);
    socket.on("runoff_vote_submitted", onRunoffVoteSubmitted);
    socket.on("final_decision", onFinalDecision);
    socket.on("session_ended", onSessionEnded);
    socket.on("restaurants_found", onRestaurantsFound);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("participant_joined", onParticipantJoined);
      socket.off("participant_left", onParticipantLeft);
      socket.off("session_phase_changed", onSessionPhaseChanged);
      socket.off("keyword_added", onKeywordAdded);
      socket.off("keyword_removed", onKeywordRemoved);
      socket.off("vote_submitted", onVoteSubmitted);
      socket.off("voting_completed", onVotingCompleted);
      socket.off("runoff_started", onRunoffStarted);
      socket.off("runoff_vote_submitted", onRunoffVoteSubmitted);
      socket.off("final_decision", onFinalDecision);
      socket.off("session_ended", onSessionEnded);
      socket.off("restaurants_found", onRestaurantsFound);
    };
  }, [updateState]);

  const createSession = useCallback(
    (
      mode: "solo" | "multi",
      hostName: string,
      callback: (res: {
        success: boolean;
        sessionId?: string;
        participant?: Participant;
        session?: Session;
        error?: string;
      }) => void,
    ) => {
      socketRef.current
        .timeout(ACK_TIMEOUT_MS)
        .emit("create_session", { mode, hostName }, (err, res) => {
          if (err) {
            callback({ success: false, error: TIMEOUT_ERROR });
            return;
          }
          if (res.success && res.participant && res.session) {
            seenVotesRef.current.clear();
            setState({
              ...initialState,
              session: res.session,
              me: res.participant,
              participants: res.session.participants,
            });
            saveSessionToStorage({
              sessionId: res.session.id,
              participantId: res.participant.id,
              participantName: res.participant.name,
              isHost: res.participant.isHost,
              token: res.token ?? "",
            });
          }
          callback(res);
        });
    },
    [],
  );

  const joinSession = useCallback(
    (
      sessionId: string,
      participantName: string,
      callback: (res: {
        success: boolean;
        error?: string;
        session?: Session;
        participant?: Participant;
      }) => void,
    ) => {
      socketRef.current
        .timeout(ACK_TIMEOUT_MS)
        .emit("join_session", { sessionId, participantName }, (err, res) => {
          if (err) {
            callback({ success: false, error: TIMEOUT_ERROR });
            return;
          }
          if (res.success && res.session && res.participant) {
            seenVotesRef.current.clear();
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
              token: res.token ?? "",
            });
          }
          callback(res);
        });
    },
    [],
  );

  const confirmParticipants = useCallback(
    (
      sessionId: string,
      callback: (res: { success: boolean; error?: string }) => void,
    ) => {
      socketRef.current
        .timeout(ACK_TIMEOUT_MS)
        .emit("confirm_participants", { sessionId }, (err, res) => {
          if (err) {
            callback({ success: false, error: TIMEOUT_ERROR });
            return;
          }
          callback(res);
        });
    },
    [],
  );

  const addKeyword = useCallback(
    (
      sessionId: string,
      keyword: string,
      callback: (res: { success: boolean; error?: string }) => void,
    ) => {
      socketRef.current
        .timeout(ACK_TIMEOUT_MS)
        .emit("add_keyword", { sessionId, keyword }, (err, res) => {
          if (err) {
            callback({ success: false, error: TIMEOUT_ERROR });
            return;
          }
          callback(res);
        });
    },
    [],
  );

  const removeKeyword = useCallback(
    (
      sessionId: string,
      keyword: string,
      callback: (res: { success: boolean; error?: string }) => void,
    ) => {
      socketRef.current
        .timeout(ACK_TIMEOUT_MS)
        .emit("remove_keyword", { sessionId, keyword }, (err, res) => {
          if (err) {
            callback({ success: false, error: TIMEOUT_ERROR });
            return;
          }
          callback(res);
        });
    },
    [],
  );

  const startSearch = useCallback(
    (
      sessionId: string,
      location: { lat: number; lng: number },
      radius: number,
      callback: (res: { success: boolean; error?: string }) => void,
      maxPriceLevel: number | null = null,
    ) => {
      socketRef.current
        .timeout(ACK_TIMEOUT_MS)
        .emit(
          "start_search",
          { sessionId, location, radius, maxPriceLevel },
          (err, res) => {
            if (err) {
              callback({ success: false, error: TIMEOUT_ERROR });
              return;
            }
            callback(res);
          },
        );
    },
    [],
  );

  const submitVote = useCallback(
    (
      sessionId: string,
      restaurantId: string,
      choice: "keep" | "reject",
      callback: (res: { success: boolean; error?: string }) => void,
    ) => {
      socketRef.current
        .timeout(ACK_TIMEOUT_MS)
        .emit(
          "submit_vote",
          { sessionId, restaurantId, choice },
          (err, res) => {
            if (err) {
              callback({ success: false, error: TIMEOUT_ERROR });
              return;
            }
            if (res.success) {
              setState((prev) => {
                const newVoted = new Set(prev.votedRestaurantIds);
                newVoted.add(restaurantId);
                return { ...prev, votedRestaurantIds: newVoted };
              });
            }
            callback(res);
          },
        );
    },
    [],
  );

  const rejoinSession = useCallback(
    (
      sessionId: string,
      participantId: string,
      token: string,
      callback: (res: {
        success: boolean;
        error?: string;
        session?: Session;
        participant?: Participant;
        restaurants?: Restaurant[];
      }) => void,
    ) => {
      socketRef.current
        .timeout(ACK_TIMEOUT_MS)
        .emit(
          "rejoin_session",
          { sessionId, participantId, token },
          (err, res) => {
            if (err) {
              callback({ success: false, error: TIMEOUT_ERROR });
              return;
            }
            if (res.success && res.session && res.participant) {
              seenVotesRef.current.clear();
              setState({
                ...initialState,
                session: res.session,
                me: res.participant,
                participants: res.session.participants,
                restaurants: res.restaurants ?? [],
                votedRestaurantIds: new Set(res.votedRestaurantIds ?? []),
                participantVoteCounts: new Map(
                  Object.entries(res.participantVoteCounts ?? {}),
                ),
                votingResult: res.votingResult ?? null,
                myRunoffVote: res.myRunoffVote ?? null,
                runoffVotedCount: res.runoffVotedCount ?? 0,
                finalDecision: res.finalDecision ?? null,
              });
            }
            callback(res);
          },
        );
    },
    [],
  );

  const leaveSession = useCallback(
    (
      sessionId: string,
      callback?: (res: { success: boolean; error?: string }) => void,
    ) => {
      socketRef.current
        .timeout(ACK_TIMEOUT_MS)
        .emit("leave_session", { sessionId }, (err, res) => {
          // 退出はサーバー無応答でもローカル状態を破棄して先へ進める
          setState(initialState);
          seenVotesRef.current.clear();
          callback?.(err ? { success: false, error: TIMEOUT_ERROR } : res);
        });
    },
    [],
  );

  const decideByRating = useCallback(
    (
      sessionId: string,
      callback: (res: { success: boolean; error?: string }) => void,
    ) => {
      socketRef.current
        .timeout(ACK_TIMEOUT_MS)
        .emit("decide_by_rating", { sessionId }, (err, res) => {
          callback(err ? { success: false, error: TIMEOUT_ERROR } : res);
        });
    },
    [],
  );

  const startRunoff = useCallback(
    (
      sessionId: string,
      callback: (res: { success: boolean; error?: string }) => void,
    ) => {
      socketRef.current
        .timeout(ACK_TIMEOUT_MS)
        .emit("start_runoff", { sessionId }, (err, res) => {
          callback(err ? { success: false, error: TIMEOUT_ERROR } : res);
        });
    },
    [],
  );

  const submitRunoffVote = useCallback(
    (
      sessionId: string,
      restaurantId: string,
      callback: (res: { success: boolean; error?: string }) => void,
    ) => {
      socketRef.current
        .timeout(ACK_TIMEOUT_MS)
        .emit("submit_runoff_vote", { sessionId, restaurantId }, (err, res) => {
          if (err) {
            callback({ success: false, error: TIMEOUT_ERROR });
            return;
          }
          if (res.success) {
            setState((prev) => ({ ...prev, myRunoffVote: restaurantId }));
          }
          callback(res);
        });
    },
    [],
  );

  const decidePick = useCallback(
    (
      sessionId: string,
      restaurantId: string,
      callback: (res: { success: boolean; error?: string }) => void,
    ) => {
      socketRef.current
        .timeout(ACK_TIMEOUT_MS)
        .emit("decide_pick", { sessionId, restaurantId }, (err, res) => {
          callback(err ? { success: false, error: TIMEOUT_ERROR } : res);
        });
    },
    [],
  );

  return {
    socket: socketRef.current,
    state,
    isRejoining,
    isConnected,
    createSession,
    joinSession,
    confirmParticipants,
    addKeyword,
    removeKeyword,
    startSearch,
    submitVote,
    rejoinSession,
    leaveSession,
    decideByRating,
    startRunoff,
    submitRunoffVote,
    decidePick,
  };
}

import type { Restaurant } from "./restaurant";
export type SessionMode = "solo" | "multi";
export type SessionPhase =
  | "waiting"
  | "keyword"
  | "voting"
  | "result"
  | "runoff";
export interface Participant {
  id: string;
  name: string;
  isHost: boolean;
}
export interface Session {
  id: string;
  mode: SessionMode;
  phase: SessionPhase;
  hostId: string;
  participants: Participant[];
  keywords: string[];
  createdAt: string;
}
export type VoteChoice = "keep" | "reject";
export interface Vote {
  sessionId: string;
  participantId: string;
  restaurantId: string;
  choice: VoteChoice;
}
export interface ServerToClientEvents {
  /** 参加者が入室した */
  participant_joined: (payload: {
    participant: Participant;
    participants: Participant[];
  }) => void;
  /** 参加者が退室した */
  participant_left: (payload: {
    participantId: string;
    participants: Participant[];
  }) => void;
  /** セッションフェーズが変わった */
  session_phase_changed: (payload: {
    phase: SessionPhase;
    session: Session;
  }) => void;
  /** キーワードが追加された */
  keyword_added: (payload: {
    keyword: string;
    keywords: string[];
    addedBy: string;
  }) => void;
  /** キーワードが削除された */
  keyword_removed: (payload: {
    keyword: string;
    keywords: string[];
    removedBy: string;
  }) => void;
  /** 投票が送信された（他の参加者への通知用：内容は秘匿可） */
  vote_submitted: (payload: {
    participantId: string;
    restaurantId: string;
    completedCount: number;
    totalCount: number;
  }) => void;
  /** 全員の投票が完了し、結果判定が行われた */
  voting_completed: (payload: { result: VotingResult }) => void;
  /** 決選投票が開始された（複数キープ時、ホスト操作） */
  runoff_started: (payload: {
    restaurantIds: string[];
    session: Session;
  }) => void;
  /** 決選投票の1票が送信された（選択内容は秘匿） */
  runoff_vote_submitted: (payload: {
    participantId: string;
    votedCount: number;
    totalCount: number;
  }) => void;
  /** 最終決定が確定した */
  final_decision: (payload: {
    decision: FinalDecision;
    session: Session;
  }) => void;
  /** セッションが終了した */
  session_ended: (payload: { reason: SessionEndReason }) => void;
  /** エラー通知 */
  error: (payload: { code: string; message: string }) => void;
  /** 検索結果の飲食店一覧 */
  restaurants_found: (payload: {
    restaurants: import("./restaurant").Restaurant[];
  }) => void;
}
export interface ClientToServerEvents {
  /** セッションに参加する */
  join_session: (
    payload: {
      sessionId: string;
      participantName: string;
    },
    callback: (response: JoinSessionResponse) => void,
  ) => void;
  /** 参加者確定（ホストのみ） */
  confirm_participants: (
    payload: {
      sessionId: string;
    },
    callback: (response: BaseResponse) => void,
  ) => void;
  /** キーワードを追加する */
  add_keyword: (
    payload: {
      sessionId: string;
      keyword: string;
    },
    callback: (response: BaseResponse) => void,
  ) => void;
  /** キーワードを削除する */
  remove_keyword: (
    payload: {
      sessionId: string;
      keyword: string;
    },
    callback: (response: BaseResponse) => void,
  ) => void;
  /** 検索を開始する（ホストのみ） */
  start_search: (
    payload: {
      sessionId: string;
      location: {
        lat: number;
        lng: number;
      };
      radius: number;
      maxPriceLevel: number | null;
    },
    callback: (response: BaseResponse) => void,
  ) => void;
  /** 投票を送信する */
  submit_vote: (
    payload: {
      sessionId: string;
      restaurantId: string;
      choice: VoteChoice;
    },
    callback: (response: BaseResponse) => void,
  ) => void;
  /** ページリロード後にセッションへ再参加する */
  rejoin_session: (
    payload: {
      sessionId: string;
      participantId: string;
    },
    callback: (response: RejoinSessionResponse) => void,
  ) => void;
  /** セッションから明示的に退出する（戻る・もう一度さがす等） */
  leave_session: (
    payload: {
      sessionId: string;
    },
    callback: (response: BaseResponse) => void,
  ) => void;
  /** 複数キープ時、評価順1位で決定する（ホストのみ） */
  decide_by_rating: (
    payload: {
      sessionId: string;
    },
    callback: (response: BaseResponse) => void,
  ) => void;
  /** 複数キープ時、決選投票を開始する（マルチのホストのみ） */
  start_runoff: (
    payload: {
      sessionId: string;
    },
    callback: (response: BaseResponse) => void,
  ) => void;
  /** 決選投票の1票を送信する（全員投票で自動確定） */
  submit_runoff_vote: (
    payload: {
      sessionId: string;
      restaurantId: string;
    },
    callback: (response: BaseResponse) => void,
  ) => void;
  /** ソロモードで複数キープから1店を選んで決定する */
  decide_pick: (
    payload: {
      sessionId: string;
      restaurantId: string;
    },
    callback: (response: BaseResponse) => void,
  ) => void;
  /** セッションを作成する（ホストのみ） */
  create_session: (
    payload: {
      mode: SessionMode;
      hostName: string;
    },
    callback: (response: CreateSessionResponse) => void,
  ) => void;
}
export type SessionEndReason =
  | "host_left"
  | "participant_left"
  | "timeout"
  | "completed";
export interface VotingResult {
  /** キープとして決定した飲食店ID（通常フロー） */
  keptRestaurantIds: string[];
  /** フォールバック：全滅時にキープ数最多の飲食店ID */
  fallbackRestaurantId: string | null;
  /** フォールバックが使われたか */
  isFallback: boolean;
  /** 全員が全候補を除外した（キープ票が1つもない）。再検索を促す */
  allRejected: boolean;
}
/** 複数キープ時に1店へ絞り込んだ最終決定 */
export interface FinalDecision {
  /** 決定した飲食店ID */
  restaurantId: string;
  /**
   * 決定方法
   * - rating: ホストが評価順1位で決定
   * - runoff: 決選投票（同数時は評価順タイブレーク）
   * - pick: ソロモードで自分で選択
   */
  method: "rating" | "runoff" | "pick";
  /** 決選投票の同数を評価順で解決したか */
  tieBroken: boolean;
  /** 次点（決定店以外のキープ店） */
  runnersUpIds: string[];
}
export interface BaseResponse {
  success: boolean;
  error?: string;
}
export interface JoinSessionResponse extends BaseResponse {
  session?: Session;
  participant?: Participant;
}
export interface RejoinSessionResponse extends BaseResponse {
  session?: Session;
  participant?: Participant;
  restaurants?: Restaurant[];
  /** 自分が投票済みのレストランID一覧（投票フェーズの復元用） */
  votedRestaurantIds?: string[];
  /** 参加者ごとの累計投票数 participantId -> count（進捗表示の復元用） */
  participantVoteCounts?: Record<string, number>;
  /** 判定済みの場合の投票結果（結果フェーズの復元用） */
  votingResult?: VotingResult | null;
  /** 決選投票で自分が入れた票（未投票なら null） */
  myRunoffVote?: string | null;
  /** 決選投票の投票済み人数 */
  runoffVotedCount?: number;
  /** 確定済みの最終決定 */
  finalDecision?: FinalDecision | null;
}
export interface CreateSessionResponse extends BaseResponse {
  sessionId?: string;
  session?: Session;
  participant?: Participant;
}
//# sourceMappingURL=session.d.ts.map

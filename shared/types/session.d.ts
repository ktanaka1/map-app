import type { Restaurant } from './restaurant';
export type SessionMode = 'solo' | 'multi';
export type SessionPhase = 'waiting' | 'keyword' | 'voting' | 'result';
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
export type VoteChoice = 'keep' | 'reject';
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
    voting_completed: (payload: {
        result: VotingResult;
    }) => void;
    /** セッションが終了した */
    session_ended: (payload: {
        reason: SessionEndReason;
    }) => void;
    /** エラー通知 */
    error: (payload: {
        code: string;
        message: string;
    }) => void;
    /** 検索結果の飲食店一覧 */
    restaurants_found: (payload: {
        restaurants: import('./restaurant').Restaurant[];
    }) => void;
}
export interface ClientToServerEvents {
    /** セッションに参加する */
    join_session: (payload: {
        sessionId: string;
        participantName: string;
    }, callback: (response: JoinSessionResponse) => void) => void;
    /** 参加者確定（ホストのみ） */
    confirm_participants: (payload: {
        sessionId: string;
    }, callback: (response: BaseResponse) => void) => void;
    /** キーワードを追加する */
    add_keyword: (payload: {
        sessionId: string;
        keyword: string;
    }, callback: (response: BaseResponse) => void) => void;
    /** キーワードを削除する */
    remove_keyword: (payload: {
        sessionId: string;
        keyword: string;
    }, callback: (response: BaseResponse) => void) => void;
    /** 検索を開始する（ホストのみ） */
    start_search: (payload: {
        sessionId: string;
        location: {
            lat: number;
            lng: number;
        };
        radius: number;
        maxPriceLevel: number | null;
    }, callback: (response: BaseResponse) => void) => void;
    /** 投票を送信する */
    submit_vote: (payload: {
        sessionId: string;
        restaurantId: string;
        choice: VoteChoice;
    }, callback: (response: BaseResponse) => void) => void;
    /** ページリロード後にセッションへ再参加する */
    rejoin_session: (payload: {
        sessionId: string;
        participantId: string;
    }, callback: (response: RejoinSessionResponse) => void) => void;
    /** セッションを作成する（ホストのみ） */
    create_session: (payload: {
        mode: SessionMode;
        hostName: string;
    }, callback: (response: CreateSessionResponse) => void) => void;
}
export type SessionEndReason = 'host_left' | 'participant_left' | 'timeout' | 'completed';
export interface VotingResult {
    /** キープとして決定した飲食店ID（通常フロー） */
    keptRestaurantIds: string[];
    /** フォールバック：全滅時にキープ数最多の飲食店ID */
    fallbackRestaurantId: string | null;
    /** フォールバックが使われたか */
    isFallback: boolean;
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
}
export interface CreateSessionResponse extends BaseResponse {
    sessionId?: string;
    session?: Session;
    participant?: Participant;
}
//# sourceMappingURL=session.d.ts.map
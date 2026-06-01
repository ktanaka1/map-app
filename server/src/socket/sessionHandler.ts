import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from 'shared/types';
import {
  createSession,
  getSession,
  deleteSession,
  addParticipant,
  setPhase,
  addKeyword,
  removeKeyword,
  setRestaurants,
  recordVote,
  buildVoteSummaries,
  detachSocketFromParticipant,
  removeParticipantById,
  updateSocketMapping,
  scheduleDisconnect,
  cancelDisconnect,
} from '../services/sessionStore';
import { judgeVotes, isVotingComplete } from '../services/voteService';
import { generateDummyRestaurants } from '../services/dummyRestaurants';
import { searchRestaurants } from '../services/placesService';

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Socket.IO セッション関連イベントハンドラを登録する。
 * 1セッション = 1ルーム（ルームIDはsessionId）の設計を守る。
 */
export function registerSessionHandlers(io: AppServer, socket: AppSocket): void {
  /**
   * セッション作成
   */
  socket.on('create_session', (payload, callback) => {
      try {
        const { mode, hostName } = payload;
        if (!hostName?.trim()) {
          callback({ success: false, error: '名前を入力してください' });
          return;
        }

        const entry = createSession(mode, hostName.trim(), socket.id);
        const { session } = entry;
        const host = session.participants[0];

        socket.join(session.id);
        console.log(`[Socket] create_session: id=${session.id}, mode=${mode}, host=${hostName}`);

        callback({ success: true, sessionId: session.id, participant: host, session });

        // 作成者自身に session_phase_changed を送信してフェーズを伝える
        socket.emit('session_phase_changed', { phase: session.phase, session });
      } catch (err) {
        console.error('[Socket] create_session error:', err);
        callback({ success: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * セッションへの参加
   */
  socket.on('join_session', async (payload, callback) => {
    const { sessionId, participantName } = payload;
    try {
      const result = addParticipant(sessionId, participantName.trim(), socket.id);

      if ('error' in result) {
        callback({ success: false, error: result.error });
        return;
      }

      const { entry, participant } = result;

      socket.join(sessionId);
      console.log(`[Socket] join_session: session=${sessionId}, name=${participantName}`);

      // 全員に参加通知
      io.to(sessionId).emit('participant_joined', {
        participant,
        participants: entry.session.participants,
      });

      callback({ success: true, session: entry.session, participant });
    } catch (err) {
      console.error('[Socket] join_session error:', err);
      callback({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * 参加者確定（ホストのみ）
   */
  socket.on('confirm_participants', async (payload, callback) => {
    const { sessionId } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: 'セッションが見つかりません' });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (participantId !== entry.session.hostId) {
        callback({ success: false, error: 'ホストのみが操作できます' });
        return;
      }

      if (entry.session.mode === 'multi' && entry.session.participants.length < 2) {
        callback({ success: false, error: '自分以外に1人以上必要です' });
        return;
      }

      const updated = setPhase(sessionId, 'keyword');
      if (!updated) {
        callback({ success: false, error: 'セッション更新に失敗しました' });
        return;
      }

      console.log(`[Socket] confirm_participants: session=${sessionId}`);

      io.to(sessionId).emit('session_phase_changed', {
        phase: 'keyword',
        session: updated.session,
      });

      callback({ success: true });
    } catch (err) {
      console.error('[Socket] confirm_participants error:', err);
      callback({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * キーワード追加
   */
  socket.on('add_keyword', async (payload, callback) => {
    const { sessionId, keyword } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: 'セッションが見つかりません' });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (!participantId) {
        callback({ success: false, error: '参加者として認識されていません' });
        return;
      }

      const updated = addKeyword(sessionId, keyword.trim());
      if (!updated) {
        callback({ success: false, error: 'セッション更新に失敗しました' });
        return;
      }

      console.log(`[Socket] add_keyword: session=${sessionId}, keyword=${keyword}`);

      io.to(sessionId).emit('keyword_added', {
        keyword: keyword.trim(),
        keywords: updated.session.keywords,
        addedBy: participantId,
      });

      callback({ success: true });
    } catch (err) {
      console.error('[Socket] add_keyword error:', err);
      callback({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * キーワード削除
   */
  socket.on('remove_keyword', async (payload, callback) => {
    const { sessionId, keyword } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: 'セッションが見つかりません' });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (!participantId) {
        callback({ success: false, error: '参加者として認識されていません' });
        return;
      }

      const updated = removeKeyword(sessionId, keyword);
      if (!updated) {
        callback({ success: false, error: 'セッション更新に失敗しました' });
        return;
      }

      console.log(`[Socket] remove_keyword: session=${sessionId}, keyword=${keyword}`);

      io.to(sessionId).emit('keyword_removed', {
        keyword,
        keywords: updated.session.keywords,
        removedBy: participantId,
      });

      callback({ success: true });
    } catch (err) {
      console.error('[Socket] remove_keyword error:', err);
      callback({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * 検索開始（ホストのみ）
   * キーワードがある場合は Text Search、ない場合は Nearby Search を使用する。
   * API 失敗時はダミーデータにフォールバックして処理を継続する。
   */
  socket.on('start_search', async (payload, callback) => {
    const { sessionId, location, radius, maxPriceLevel } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: 'セッションが見つかりません' });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (participantId !== entry.session.hostId) {
        callback({ success: false, error: 'ホストのみが操作できます' });
        return;
      }

      // Google Places API で飲食店を検索し、失敗時はダミーデータにフォールバック
      let restaurants;
      try {
        restaurants = await searchRestaurants(
          entry.session.keywords,
          location.lat,
          location.lng,
          radius,
          maxPriceLevel ?? null
        );
        console.log(`[Socket] start_search: Places API で ${restaurants.length} 件取得`);
        if (restaurants.length === 0) {
          callback({ success: false, error: '条件に一致するお店が見つかりませんでした。キーワードや場所を変えて再度お試しください。' });
          return;
        }
      } catch (apiErr) {
        console.error('[Socket] start_search: Places API 失敗。ダミーデータにフォールバック:', (apiErr as Error).message);
        restaurants = generateDummyRestaurants(entry.session.keywords);
      }

      setRestaurants(sessionId, restaurants);

      const updated = setPhase(sessionId, 'voting');
      if (!updated) {
        callback({ success: false, error: 'セッション更新に失敗しました' });
        return;
      }

      console.log(`[Socket] start_search: session=${sessionId}, restaurants=${restaurants.length}件`);

      // 全員にレストラン一覧とフェーズ変更を通知
      io.to(sessionId).emit('restaurants_found', { restaurants });

      io.to(sessionId).emit('session_phase_changed', {
        phase: 'voting',
        session: updated.session,
      });

      callback({ success: true });
    } catch (err) {
      console.error('[Socket] start_search error:', err);
      callback({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * 投票送信
   */
  socket.on('submit_vote', async (payload, callback) => {
    const { sessionId, restaurantId, choice } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: 'セッションが見つかりません' });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (!participantId) {
        callback({ success: false, error: '参加者として認識されていません' });
        return;
      }

      recordVote(sessionId, participantId, restaurantId, choice);

      const summaries = buildVoteSummaries(entry);
      const totalParticipants = entry.session.participants.length;
      const totalRestaurants = entry.restaurants.length;

      // 当該レストランへの投票数を通知
      const restaurantVotes = entry.votes.get(restaurantId) ?? [];
      io.to(sessionId).emit('vote_submitted', {
        participantId,
        restaurantId,
        completedCount: restaurantVotes.length,
        totalCount: totalParticipants,
      });

      console.log(`[Socket] submit_vote: session=${sessionId}, restaurant=${restaurantId}, choice=${choice}`);

      // 全員分揃ったか判定
      if (isVotingComplete(summaries, totalParticipants, totalRestaurants)) {
        const result = judgeVotes(summaries, totalParticipants);

        const updated = setPhase(sessionId, 'result');
        if (updated) {
          io.to(sessionId).emit('voting_completed', { result });
          io.to(sessionId).emit('session_phase_changed', {
            phase: 'result',
            session: updated.session,
          });
          console.log(`[Socket] voting_completed: session=${sessionId}, isFallback=${result.isFallback}`);
        }
      }

      callback({ success: true });
    } catch (err) {
      console.error('[Socket] submit_vote error:', err);
      callback({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * ページリロード後のセッション再参加
   * 新しいsocket.idでsocketToParticipantマップを更新し、ルームに再参加する。
   */
  socket.on('rejoin_session', (payload, callback) => {
    const { sessionId, participantId } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: 'セッションが見つかりません' });
        return;
      }

      const updated = updateSocketMapping(sessionId, participantId, socket.id);
      if (!updated) {
        callback({ success: false, error: '参加者が見つかりません' });
        return;
      }

      const participant = updated.session.participants.find((p) => p.id === participantId);
      if (!participant) {
        callback({ success: false, error: '参加者が見つかりません' });
        return;
      }

      // 切断猶予タイマーがあればキャンセル
      cancelDisconnect(participantId);

      socket.join(sessionId);
      console.log(`[Socket] rejoin_session: session=${sessionId}, participant=${participantId}, socket=${socket.id}`);

      callback({
        success: true,
        session: updated.session,
        participant,
        restaurants: updated.restaurants,
      });
    } catch (err) {
      console.error('[Socket] rejoin_session error:', err);
      callback({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * 切断時の処理
   * リロードによる一時的な切断に対応するため、GRACE_PERIOD_MS の猶予を設けてから削除する。
   * rejoin_session が届いた場合はタイマーをキャンセルする。
   */
  socket.on('disconnect', async () => {
    console.log(`[Socket] disconnect handled for socket: ${socket.id}`);

    // socketマッピングのみ外す（participants配列はそのまま残す）
    const detached = detachSocketFromParticipant(socket.id);
    if (!detached) return;

    const { sessionId, participantId, entry } = detached;
    const { session } = entry;

    // ソロセッション: 猶予期間後に削除
    if (session.mode === 'solo') {
      scheduleDisconnect(participantId, () => {
        removeParticipantById(sessionId, participantId);
        deleteSession(sessionId);
        console.log(`[Socket] solo session deleted after grace period: ${sessionId}`);
      });
      return;
    }

    // マルチ: ホストが切断 → 猶予期間後にセッション終了
    if (participantId === session.hostId) {
      scheduleDisconnect(participantId, () => {
        const still = getSession(sessionId);
        if (!still) return;
        removeParticipantById(sessionId, participantId);
        io.to(sessionId).emit('session_ended', { reason: 'host_left' });
        deleteSession(sessionId);
        console.log(`[Socket] session ended (host_left) after grace period: ${sessionId}`);
      });
      return;
    }

    // 参加者が切断 → 猶予期間後に実際に除名・残り人数チェック
    scheduleDisconnect(participantId, () => {
      const still = getSession(sessionId);
      if (!still) return;

      removeParticipantById(sessionId, participantId);

      io.to(sessionId).emit('participant_left', {
        participantId,
        participants: still.session.participants,
      });

      // voting/resultフェーズ以外でホストのみになったらセッション終了
      if (
        still.session.phase !== 'result' &&
        still.session.participants.length <= 1
      ) {
        io.to(sessionId).emit('session_ended', { reason: 'participant_left' });
        deleteSession(sessionId);
        console.log(`[Socket] session ended (participant_left) after grace period: ${sessionId}`);
      }
    });
  });
}

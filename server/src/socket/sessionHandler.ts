import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  FinalDecision,
} from "shared/types";
import {
  createSession,
  getSession,
  deleteSession,
  addParticipant,
  setPhase,
  addKeyword,
  removeKeyword,
  setRestaurants,
  setResult,
  setFinalDecision,
  recordVote,
  recordRunoffVote,
  buildVoteSummaries,
  purgeVotesByParticipant,
  countVotesByParticipant,
  getVotedRestaurantIds,
  getAllSessions,
  detachSocketFromParticipant,
  removeParticipantById,
  updateSocketMapping,
  scheduleDisconnect,
  cancelDisconnect,
  type InMemorySession,
} from "../services/sessionStore";
import {
  judgeVotes,
  isVotingComplete,
  judgeRunoff,
  sortByRating,
} from "../services/voteService";
import { generateDummyRestaurants } from "../services/dummyRestaurants";
import { searchRestaurants } from "../services/placesService";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Places API 失敗時にダミーデータで続行してよいか（本番では実在しない店を出さない） */
const ALLOW_DUMMY_FALLBACK =
  process.env.ALLOW_DUMMY_FALLBACK === "true" ||
  process.env.NODE_ENV !== "production";

/**
 * 全員の投票が揃っていれば判定を実行し、結果をルーム全員に通知する。
 * submit_vote 時だけでなく、投票中の参加者離脱時にも呼ぶ
 * （離脱で「残りの全員が投票済み」になるケースがあるため）。
 */
function finalizeVotingIfComplete(io: AppServer, sessionId: string): boolean {
  const entry = getSession(sessionId);
  if (!entry || entry.session.phase !== "voting") return false;

  const summaries = buildVoteSummaries(entry);
  const totalParticipants = entry.session.participants.length;
  const totalRestaurants = entry.restaurants.length;

  if (!isVotingComplete(summaries, totalParticipants, totalRestaurants)) {
    return false;
  }

  const result = judgeVotes(summaries, totalParticipants);
  setResult(sessionId, result);

  const updated = setPhase(sessionId, "result");
  if (!updated) return false;

  io.to(sessionId).emit("voting_completed", { result });
  io.to(sessionId).emit("session_phase_changed", {
    phase: "result",
    session: updated.session,
  });
  console.log(
    `[Socket] voting_completed: session=${sessionId}, isFallback=${result.isFallback}`,
  );
  return true;
}

/** 投票結果のキープ店一覧を返す（result 確定後のフェーズで使用） */
function getKeptRestaurants(entry: InMemorySession) {
  const ids = entry.result?.keptRestaurantIds ?? [];
  return entry.restaurants.filter((r) => ids.includes(r.id));
}

/**
 * 決選投票が全員分揃っていれば判定して最終決定を通知する。
 * submit_runoff_vote 時と、決選投票中の参加者離脱時の両方から呼ぶ。
 */
function finalizeRunoffIfComplete(io: AppServer, sessionId: string): boolean {
  const entry = getSession(sessionId);
  if (!entry || entry.session.phase !== "runoff") return false;
  if (entry.runoffVotes.size < entry.session.participants.length) return false;

  const candidates = getKeptRestaurants(entry);
  const outcome = judgeRunoff(entry.runoffVotes, candidates);
  const decision: FinalDecision = {
    restaurantId: outcome.winnerRestaurantId,
    method: "runoff",
    tieBroken: outcome.tieBroken,
    runnersUpIds: candidates
      .map((c) => c.id)
      .filter((id) => id !== outcome.winnerRestaurantId),
  };
  setFinalDecision(sessionId, decision);

  const updated = setPhase(sessionId, "result");
  if (!updated) return false;

  io.to(sessionId).emit("final_decision", {
    decision,
    session: updated.session,
  });
  console.log(
    `[Socket] final_decision (runoff): session=${sessionId}, winner=${decision.restaurantId}, tieBroken=${decision.tieBroken}`,
  );
  return true;
}

/**
 * 参加者をセッションから取り除いた後の後始末を一元化する。
 * 切断猶予タイマー満了時と明示的な退出（leave_session）の両方から呼ばれる。
 */
function removeAndReconcile(
  io: AppServer,
  sessionId: string,
  participantId: string,
): void {
  const entry = getSession(sessionId);
  if (!entry) return;

  const { session } = entry;
  const wasHost = participantId === session.hostId;

  removeParticipantById(sessionId, participantId);
  // 票を残すと isVotingComplete が永遠に成立しなくなる
  purgeVotesByParticipant(sessionId, participantId);

  // 結果表示フェーズ: 閲覧中の参加者を巻き込まず、無人になったら削除するだけ
  if (session.phase === "result") {
    if (session.participants.length === 0) {
      deleteSession(sessionId);
      console.log(
        `[Socket] session deleted (result phase empty): ${sessionId}`,
      );
    }
    return;
  }

  if (session.mode === "solo") {
    deleteSession(sessionId);
    console.log(`[Socket] solo session deleted: ${sessionId}`);
    return;
  }

  if (wasHost) {
    io.to(sessionId).emit("session_ended", { reason: "host_left" });
    deleteSession(sessionId);
    console.log(`[Socket] session ended (host_left): ${sessionId}`);
    return;
  }

  io.to(sessionId).emit("participant_left", {
    participantId,
    participants: session.participants,
  });

  // ホストのみになったらセッション終了
  if (session.participants.length <= 1) {
    io.to(sessionId).emit("session_ended", { reason: "participant_left" });
    deleteSession(sessionId);
    console.log(`[Socket] session ended (participant_left): ${sessionId}`);
    return;
  }

  // 投票中・決選投票中の離脱: 残った参加者だけで全員分揃った可能性があるため再判定する
  if (session.phase === "runoff") {
    finalizeRunoffIfComplete(io, sessionId);
  } else {
    finalizeVotingIfComplete(io, sessionId);
  }
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * 放置されたセッションを定期的に削除するスイーパーを開始する。
 * インメモリストアのため、掃除しないとプロセスが生きている限り溜まり続ける。
 */
export function startSessionSweeper(io: AppServer): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    for (const [sessionId, entry] of getAllSessions()) {
      const age = now - new Date(entry.session.createdAt).getTime();
      if (age > SESSION_TTL_MS) {
        io.to(sessionId).emit("session_ended", { reason: "timeout" });
        deleteSession(sessionId);
        console.log(`[Socket] session expired (timeout): ${sessionId}`);
      }
    }
  }, SWEEP_INTERVAL_MS);
}

/**
 * Socket.IO セッション関連イベントハンドラを登録する。
 * 1セッション = 1ルーム（ルームIDはsessionId）の設計を守る。
 */
export function registerSessionHandlers(
  io: AppServer,
  socket: AppSocket,
): void {
  /**
   * セッション作成
   */
  socket.on("create_session", (payload, callback) => {
    try {
      const { mode, hostName } = payload;
      if (!hostName?.trim()) {
        callback({ success: false, error: "名前を入力してください" });
        return;
      }

      const entry = createSession(mode, hostName.trim(), socket.id);
      const { session } = entry;
      const host = session.participants[0];

      socket.join(session.id);
      console.log(
        `[Socket] create_session: id=${session.id}, mode=${mode}, host=${hostName}`,
      );

      callback({
        success: true,
        sessionId: session.id,
        participant: host,
        session,
      });

      // 作成者自身に session_phase_changed を送信してフェーズを伝える
      socket.emit("session_phase_changed", { phase: session.phase, session });
    } catch (err) {
      console.error("[Socket] create_session error:", err);
      callback({ success: false, error: "Internal server error" });
    }
  });

  /**
   * セッションへの参加
   */
  socket.on("join_session", async (payload, callback) => {
    const { sessionId, participantName } = payload;
    try {
      const result = addParticipant(
        sessionId,
        participantName.trim(),
        socket.id,
      );

      if ("error" in result) {
        callback({ success: false, error: result.error });
        return;
      }

      const { entry, participant } = result;

      socket.join(sessionId);
      console.log(
        `[Socket] join_session: session=${sessionId}, name=${participantName}`,
      );

      // 全員に参加通知
      io.to(sessionId).emit("participant_joined", {
        participant,
        participants: entry.session.participants,
      });

      callback({ success: true, session: entry.session, participant });
    } catch (err) {
      console.error("[Socket] join_session error:", err);
      callback({ success: false, error: "Internal server error" });
    }
  });

  /**
   * 参加者確定（ホストのみ）
   */
  socket.on("confirm_participants", async (payload, callback) => {
    const { sessionId } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: "セッションが見つかりません" });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (participantId !== entry.session.hostId) {
        callback({ success: false, error: "ホストのみが操作できます" });
        return;
      }

      if (
        entry.session.mode === "multi" &&
        entry.session.participants.length < 2
      ) {
        callback({ success: false, error: "自分以外に1人以上必要です" });
        return;
      }

      const updated = setPhase(sessionId, "keyword");
      if (!updated) {
        callback({ success: false, error: "セッション更新に失敗しました" });
        return;
      }

      console.log(`[Socket] confirm_participants: session=${sessionId}`);

      io.to(sessionId).emit("session_phase_changed", {
        phase: "keyword",
        session: updated.session,
      });

      callback({ success: true });
    } catch (err) {
      console.error("[Socket] confirm_participants error:", err);
      callback({ success: false, error: "Internal server error" });
    }
  });

  /**
   * キーワード追加
   */
  socket.on("add_keyword", async (payload, callback) => {
    const { sessionId, keyword } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: "セッションが見つかりません" });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (!participantId) {
        callback({ success: false, error: "参加者として認識されていません" });
        return;
      }

      const updated = addKeyword(sessionId, keyword.trim());
      if (!updated) {
        callback({ success: false, error: "セッション更新に失敗しました" });
        return;
      }

      console.log(
        `[Socket] add_keyword: session=${sessionId}, keyword=${keyword}`,
      );

      io.to(sessionId).emit("keyword_added", {
        keyword: keyword.trim(),
        keywords: updated.session.keywords,
        addedBy: participantId,
      });

      callback({ success: true });
    } catch (err) {
      console.error("[Socket] add_keyword error:", err);
      callback({ success: false, error: "Internal server error" });
    }
  });

  /**
   * キーワード削除
   */
  socket.on("remove_keyword", async (payload, callback) => {
    const { sessionId, keyword } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: "セッションが見つかりません" });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (!participantId) {
        callback({ success: false, error: "参加者として認識されていません" });
        return;
      }

      const updated = removeKeyword(sessionId, keyword);
      if (!updated) {
        callback({ success: false, error: "セッション更新に失敗しました" });
        return;
      }

      console.log(
        `[Socket] remove_keyword: session=${sessionId}, keyword=${keyword}`,
      );

      io.to(sessionId).emit("keyword_removed", {
        keyword,
        keywords: updated.session.keywords,
        removedBy: participantId,
      });

      callback({ success: true });
    } catch (err) {
      console.error("[Socket] remove_keyword error:", err);
      callback({ success: false, error: "Internal server error" });
    }
  });

  /**
   * 検索開始（ホストのみ）
   * キーワードがある場合は Text Search、ない場合は Nearby Search を使用する。
   * API 失敗時はダミーデータにフォールバックして処理を継続する。
   */
  socket.on("start_search", async (payload, callback) => {
    const { sessionId, location, radius, maxPriceLevel } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: "セッションが見つかりません" });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (participantId !== entry.session.hostId) {
        callback({ success: false, error: "ホストのみが操作できます" });
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
          maxPriceLevel ?? null,
        );
        console.log(
          `[Socket] start_search: Places API で ${restaurants.length} 件取得`,
        );
        if (restaurants.length === 0) {
          callback({
            success: false,
            error:
              "条件に一致するお店が見つかりませんでした。キーワードや場所を変えて再度お試しください。",
          });
          return;
        }
      } catch (apiErr) {
        if (!ALLOW_DUMMY_FALLBACK) {
          console.error(
            "[Socket] start_search: Places API 失敗:",
            (apiErr as Error).message,
          );
          callback({
            success: false,
            error:
              "お店の検索に失敗しました。しばらくしてから再度お試しください。",
          });
          return;
        }
        console.error(
          "[Socket] start_search: Places API 失敗。ダミーデータにフォールバック:",
          (apiErr as Error).message,
        );
        restaurants = generateDummyRestaurants(entry.session.keywords);
      }

      setRestaurants(sessionId, restaurants);

      const updated = setPhase(sessionId, "voting");
      if (!updated) {
        callback({ success: false, error: "セッション更新に失敗しました" });
        return;
      }

      console.log(
        `[Socket] start_search: session=${sessionId}, restaurants=${restaurants.length}件`,
      );

      // 全員にレストラン一覧とフェーズ変更を通知
      io.to(sessionId).emit("restaurants_found", { restaurants });

      io.to(sessionId).emit("session_phase_changed", {
        phase: "voting",
        session: updated.session,
      });

      callback({ success: true });
    } catch (err) {
      console.error("[Socket] start_search error:", err);
      callback({ success: false, error: "Internal server error" });
    }
  });

  /**
   * 投票送信
   */
  socket.on("submit_vote", async (payload, callback) => {
    const { sessionId, restaurantId, choice } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: "セッションが見つかりません" });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (!participantId) {
        callback({ success: false, error: "参加者として認識されていません" });
        return;
      }

      // 候補に存在しないレストランへの投票は弾く
      if (!entry.restaurants.some((r) => r.id === restaurantId)) {
        callback({ success: false, error: "投票対象が見つかりません" });
        return;
      }

      recordVote(sessionId, participantId, restaurantId, choice);

      // 当該レストランへの投票数を通知
      const restaurantVotes = entry.votes.get(restaurantId) ?? [];
      io.to(sessionId).emit("vote_submitted", {
        participantId,
        restaurantId,
        completedCount: restaurantVotes.length,
        totalCount: entry.session.participants.length,
      });

      console.log(
        `[Socket] submit_vote: session=${sessionId}, restaurant=${restaurantId}, choice=${choice}`,
      );

      // 全員分揃ったか判定
      finalizeVotingIfComplete(io, sessionId);

      callback({ success: true });
    } catch (err) {
      console.error("[Socket] submit_vote error:", err);
      callback({ success: false, error: "Internal server error" });
    }
  });

  /**
   * 複数キープ時: 評価順1位で決定（ホストのみ）
   */
  socket.on("decide_by_rating", (payload, callback) => {
    const { sessionId } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: "セッションが見つかりません" });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (participantId !== entry.session.hostId) {
        callback({ success: false, error: "ホストのみが操作できます" });
        return;
      }

      if (entry.session.phase !== "result" || entry.finalDecision) {
        callback({ success: false, error: "いまは決定操作ができません" });
        return;
      }

      const kept = getKeptRestaurants(entry);
      if (kept.length < 2) {
        callback({ success: false, error: "絞り込みの対象がありません" });
        return;
      }

      const sorted = sortByRating(kept);
      const decision: FinalDecision = {
        restaurantId: sorted[0].id,
        method: "rating",
        tieBroken: false,
        runnersUpIds: sorted.slice(1).map((r) => r.id),
      };
      setFinalDecision(sessionId, decision);

      console.log(
        `[Socket] decide_by_rating: session=${sessionId}, winner=${decision.restaurantId}`,
      );

      io.to(sessionId).emit("final_decision", {
        decision,
        session: entry.session,
      });
      callback({ success: true });
    } catch (err) {
      console.error("[Socket] decide_by_rating error:", err);
      callback({ success: false, error: "Internal server error" });
    }
  });

  /**
   * 複数キープ時: 決選投票を開始（マルチのホストのみ）
   */
  socket.on("start_runoff", (payload, callback) => {
    const { sessionId } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: "セッションが見つかりません" });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (participantId !== entry.session.hostId) {
        callback({ success: false, error: "ホストのみが操作できます" });
        return;
      }

      if (entry.session.mode !== "multi") {
        callback({
          success: false,
          error: "ソロモードでは一覧から直接選んでください",
        });
        return;
      }

      if (entry.session.phase !== "result" || entry.finalDecision) {
        callback({ success: false, error: "いまは決定操作ができません" });
        return;
      }

      const kept = getKeptRestaurants(entry);
      if (kept.length < 2) {
        callback({ success: false, error: "絞り込みの対象がありません" });
        return;
      }

      entry.runoffVotes.clear();
      const updated = setPhase(sessionId, "runoff");
      if (!updated) {
        callback({ success: false, error: "セッション更新に失敗しました" });
        return;
      }

      console.log(
        `[Socket] start_runoff: session=${sessionId}, candidates=${kept.length}`,
      );

      io.to(sessionId).emit("runoff_started", {
        restaurantIds: kept.map((r) => r.id),
        session: updated.session,
      });
      callback({ success: true });
    } catch (err) {
      console.error("[Socket] start_runoff error:", err);
      callback({ success: false, error: "Internal server error" });
    }
  });

  /**
   * 決選投票の1票を送信（全員分揃ったら自動確定）
   */
  socket.on("submit_runoff_vote", (payload, callback) => {
    const { sessionId, restaurantId } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: "セッションが見つかりません" });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (!participantId) {
        callback({ success: false, error: "参加者として認識されていません" });
        return;
      }

      if (entry.session.phase !== "runoff") {
        callback({ success: false, error: "決選投票は行われていません" });
        return;
      }

      const keptIds = entry.result?.keptRestaurantIds ?? [];
      if (!keptIds.includes(restaurantId)) {
        callback({ success: false, error: "投票対象が見つかりません" });
        return;
      }

      recordRunoffVote(sessionId, participantId, restaurantId);

      io.to(sessionId).emit("runoff_vote_submitted", {
        participantId,
        votedCount: entry.runoffVotes.size,
        totalCount: entry.session.participants.length,
      });

      console.log(
        `[Socket] submit_runoff_vote: session=${sessionId}, voted=${entry.runoffVotes.size}/${entry.session.participants.length}`,
      );

      finalizeRunoffIfComplete(io, sessionId);
      callback({ success: true });
    } catch (err) {
      console.error("[Socket] submit_runoff_vote error:", err);
      callback({ success: false, error: "Internal server error" });
    }
  });

  /**
   * ソロモード: 複数キープの一覧から1店を選んで決定
   */
  socket.on("decide_pick", (payload, callback) => {
    const { sessionId, restaurantId } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: "セッションが見つかりません" });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (participantId !== entry.session.hostId) {
        callback({ success: false, error: "ホストのみが操作できます" });
        return;
      }

      if (entry.session.mode !== "solo") {
        callback({
          success: false,
          error: "マルチセッションでは決め方を選んでください",
        });
        return;
      }

      if (entry.session.phase !== "result" || entry.finalDecision) {
        callback({ success: false, error: "いまは決定操作ができません" });
        return;
      }

      const keptIds = entry.result?.keptRestaurantIds ?? [];
      if (!keptIds.includes(restaurantId)) {
        callback({ success: false, error: "決定対象が見つかりません" });
        return;
      }

      const decision: FinalDecision = {
        restaurantId,
        method: "pick",
        tieBroken: false,
        runnersUpIds: keptIds.filter((id) => id !== restaurantId),
      };
      setFinalDecision(sessionId, decision);

      console.log(
        `[Socket] decide_pick: session=${sessionId}, winner=${restaurantId}`,
      );

      io.to(sessionId).emit("final_decision", {
        decision,
        session: entry.session,
      });
      callback({ success: true });
    } catch (err) {
      console.error("[Socket] decide_pick error:", err);
      callback({ success: false, error: "Internal server error" });
    }
  });

  /**
   * ページリロード後のセッション再参加
   * 新しいsocket.idでsocketToParticipantマップを更新し、ルームに再参加する。
   */
  socket.on("rejoin_session", (payload, callback) => {
    const { sessionId, participantId } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: false, error: "セッションが見つかりません" });
        return;
      }

      const updated = updateSocketMapping(sessionId, participantId, socket.id);
      if (!updated) {
        callback({ success: false, error: "参加者が見つかりません" });
        return;
      }

      const participant = updated.session.participants.find(
        (p) => p.id === participantId,
      );
      if (!participant) {
        callback({ success: false, error: "参加者が見つかりません" });
        return;
      }

      // 切断猶予タイマーがあればキャンセル
      cancelDisconnect(participantId);

      socket.join(sessionId);
      console.log(
        `[Socket] rejoin_session: session=${sessionId}, participant=${participantId}, socket=${socket.id}`,
      );

      callback({
        success: true,
        session: updated.session,
        participant,
        restaurants: updated.restaurants,
        // 投票フェーズ・結果フェーズの状態をリロード後も復元できるよう返す
        votedRestaurantIds: getVotedRestaurantIds(updated, participantId),
        participantVoteCounts: countVotesByParticipant(updated),
        votingResult: updated.result,
        myRunoffVote: updated.runoffVotes.get(participantId) ?? null,
        runoffVotedCount: updated.runoffVotes.size,
        finalDecision: updated.finalDecision,
      });
    } catch (err) {
      console.error("[Socket] rejoin_session error:", err);
      callback({ success: false, error: "Internal server error" });
    }
  });

  /**
   * セッションからの明示的な退出（戻るボタン・もう一度さがす等）
   * 切断と違い猶予期間なしで即座に除名・後始末を行う。
   */
  socket.on("leave_session", (payload, callback) => {
    const { sessionId } = payload;
    try {
      const entry = getSession(sessionId);
      if (!entry) {
        callback({ success: true });
        return;
      }

      const participantId = entry.socketToParticipant.get(socket.id);
      if (!participantId) {
        callback({ success: true });
        return;
      }

      // 自分には終了通知等を送らないよう先にルームを抜ける
      entry.socketToParticipant.delete(socket.id);
      socket.leave(sessionId);
      cancelDisconnect(participantId);

      console.log(
        `[Socket] leave_session: session=${sessionId}, participant=${participantId}`,
      );

      removeAndReconcile(io, sessionId, participantId);
      callback({ success: true });
    } catch (err) {
      console.error("[Socket] leave_session error:", err);
      callback({ success: false, error: "Internal server error" });
    }
  });

  /**
   * 切断時の処理
   * リロードによる一時的な切断に対応するため、GRACE_PERIOD_MS の猶予を設けてから削除する。
   * rejoin_session が届いた場合はタイマーをキャンセルする。
   */
  socket.on("disconnect", () => {
    console.log(`[Socket] disconnect handled for socket: ${socket.id}`);

    // socketマッピングのみ外す（participants配列はそのまま残す）
    const detached = detachSocketFromParticipant(socket.id);
    if (!detached) return;

    const { sessionId, participantId } = detached;

    // 猶予期間後に除名・後始末（rejoin されたらキャンセルされる）
    scheduleDisconnect(participantId, () => {
      removeAndReconcile(io, sessionId, participantId);
    });
  });
}

import { Router } from "express";
import { getSession } from "../services/sessionStore";

export const sessionRouter = Router();

// モジュールロード時に固定すると dotenv の読み込み順に暗黙依存するため、都度参照する
function clientUrl(): string {
  return process.env.CLIENT_URL ?? "http://localhost:5173";
}

/**
 * POST /api/sessions
 * セッション情報をメモリから取得してレスポンス（QRコード用のURL生成含む）
 * ※セッション作成はSocket.IOの create_session イベントで行うため、
 *   このエンドポイントは既存セッションの情報取得に使用
 */
sessionRouter.post("/", async (req, res) => {
  const { sessionId } = req.body as { sessionId?: string };
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }

  const entry = getSession(sessionId);
  if (!entry) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const joinUrl = `${clientUrl()}/join/${sessionId}`;

  res.json({
    session: entry.session,
    joinUrl,
  });
});

/**
 * GET /api/sessions/:id
 * セッション情報取得
 */
sessionRouter.get("/:id", async (req, res) => {
  const { id } = req.params;

  const entry = getSession(id);
  if (!entry) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const joinUrl = `${clientUrl()}/join/${id}`;

  res.json({
    session: entry.session,
    restaurants: entry.restaurants,
    joinUrl,
  });
});

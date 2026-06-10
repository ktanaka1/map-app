import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useSocketContext } from "../hooks/useSocketContext";
import { clearSessionFromStorage } from "../hooks/useSocket";
import RejoiningOverlay from "../components/RejoiningOverlay";

function WaitingPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { state, confirmParticipants, isRejoining, leaveSession } =
    useSocketContext();
  const { session, participants } = state;

  const joinUrl = `${window.location.origin}/join/${sessionId}`;

  // フェーズが変わったらリダイレクト
  useEffect(() => {
    if (session?.phase === "keyword") {
      navigate(`/session/${sessionId}/keyword`);
    }
  }, [session?.phase, sessionId, navigate]);

  const isHost = session
    ? state.me?.id === session.hostId || state.me?.isHost
    : false;
  const canConfirm = participants.length >= 2;

  if (isRejoining) return <RejoiningOverlay />;

  const handleConfirmParticipants = () => {
    if (!sessionId) return;
    confirmParticipants(sessionId, (res) => {
      if (!res.success) {
        alert(res.error ?? "確定に失敗しました");
      }
    });
  };

  const handleCopyLink = () => {
    void navigator.clipboard.writeText(joinUrl).then(() => {
      alert("リンクをコピーしました");
    });
  };

  const handleBack = () => {
    // サーバー側のセッションも終了させる（参加者には session_ended が通知される）
    if (sessionId) leaveSession(sessionId);
    clearSessionFromStorage();
    navigate("/");
  };

  return (
    <div style={styles.pageWrapper}>
      {/* スクロール可能なコンテンツ領域 */}
      <div style={styles.scrollArea}>
        <div style={styles.headerSection}>
          {isHost && (
            <button
              type="button"
              onClick={handleBack}
              style={styles.backButton}
            >
              ← 戻る
            </button>
          )}
          <h2 style={styles.heading}>参加者を待っています</h2>
          <p style={styles.sessionId}>
            セッションID: <strong>{sessionId}</strong>
          </p>
        </div>

        {/* QRコードセクション */}
        <div style={styles.card}>
          <p style={styles.sectionLabel}>QRコードを共有</p>
          <div style={styles.qrWrapper}>
            <QRCodeSVG value={joinUrl} size={240} />
          </div>
          <p style={styles.qrHint}>スキャンするとすぐに参加できます</p>
          <div style={styles.linkRow}>
            <input
              readOnly
              value={joinUrl}
              style={styles.linkInput}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={handleCopyLink}
              style={styles.copyButton}
            >
              コピー
            </button>
          </div>
        </div>

        {/* 参加者リスト */}
        <div style={styles.card}>
          <p style={styles.sectionLabel}>
            参加者
            <span style={styles.participantCount}>{participants.length}人</span>
          </p>
          <ul style={styles.participantsList}>
            {participants.map((p) => (
              <li key={p.id} style={styles.participantItem}>
                <span style={styles.avatarCircle}>{p.name.charAt(0)}</span>
                <span style={styles.participantName}>{p.name}</span>
                <div style={styles.badges}>
                  {p.isHost && <span style={styles.hostBadge}>ホスト</span>}
                  {p.id === state.me?.id && (
                    <span style={styles.meBadge}>あなた</span>
                  )}
                </div>
              </li>
            ))}
            {participants.length === 0 && (
              <li style={styles.emptyItem}>まだ誰も参加していません</li>
            )}
          </ul>
        </div>

        {!isHost && (
          <p style={styles.waitingMessage}>
            ホストが参加者を確定するまでお待ちください...
          </p>
        )}
      </div>

      {/* ホストのみ下部固定ボタン */}
      {isHost && (
        <div style={styles.footer}>
          <div style={styles.footerInner}>
            {!canConfirm && (
              <p style={styles.hint}>
                自分以外に1人以上参加するまで確定できません
              </p>
            )}
            <button
              type="button"
              onClick={handleConfirmParticipants}
              disabled={!canConfirm}
              style={{
                ...styles.confirmButton,
                ...(!canConfirm ? styles.confirmButtonDisabled : {}),
              }}
            >
              参加者を確定して始める（{participants.length}人）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#f5f5f5",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "24px 16px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
  },
  headerSection: {
    textAlign: "center",
    width: "100%",
    maxWidth: "480px",
    position: "relative",
  },
  backButton: {
    position: "absolute",
    left: 0,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    color: "#4a90e2",
    fontSize: "0.9rem",
    fontWeight: "bold",
    cursor: "pointer",
    padding: "4px 0",
  },
  heading: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    margin: "0 0 6px",
    color: "#1a1a1a",
  },
  sessionId: {
    color: "#666",
    fontSize: "0.85rem",
    margin: 0,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: "16px",
    padding: "24px",
    width: "100%",
    maxWidth: "480px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  sectionLabel: {
    fontWeight: "bold",
    fontSize: "0.9rem",
    color: "#333",
    margin: "0 0 16px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  participantCount: {
    display: "inline-block",
    backgroundColor: "#4a90e2",
    color: "#fff",
    fontSize: "0.75rem",
    padding: "2px 8px",
    borderRadius: "10px",
    fontWeight: "bold",
  },
  qrWrapper: {
    display: "flex",
    justifyContent: "center",
    padding: "20px",
    backgroundColor: "#fff",
    border: "1px solid #eee",
    borderRadius: "12px",
    marginBottom: "12px",
  },
  qrHint: {
    textAlign: "center",
    fontSize: "0.8rem",
    color: "#888",
    margin: "0 0 16px",
  },
  linkRow: {
    display: "flex",
    gap: "8px",
  },
  linkInput: {
    flex: 1,
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "0.8rem",
    color: "#555",
    backgroundColor: "#fafafa",
    minWidth: 0,
  },
  copyButton: {
    padding: "10px 20px",
    backgroundColor: "#4a90e2",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.9rem",
    fontWeight: "bold",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  participantsList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  participantItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 0",
    borderBottom: "1px solid #f0f0f0",
  },
  avatarCircle: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    backgroundColor: "#e8f0fc",
    color: "#4a90e2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "0.95rem",
    flexShrink: 0,
  },
  participantName: {
    flex: 1,
    fontSize: "0.95rem",
    color: "#1a1a1a",
    fontWeight: "500",
  },
  badges: {
    display: "flex",
    gap: "4px",
  },
  hostBadge: {
    fontSize: "0.7rem",
    padding: "2px 8px",
    backgroundColor: "#4a90e2",
    color: "#fff",
    borderRadius: "10px",
  },
  meBadge: {
    fontSize: "0.7rem",
    padding: "2px 8px",
    backgroundColor: "#48bb78",
    color: "#fff",
    borderRadius: "10px",
  },
  emptyItem: {
    color: "#aaa",
    fontSize: "0.9rem",
    textAlign: "center",
    padding: "16px 0",
  },
  waitingMessage: {
    color: "#888",
    fontSize: "0.9rem",
    textAlign: "center",
    margin: "8px 0 0",
  },
  footer: {
    position: "sticky",
    bottom: 0,
    backgroundColor: "#fff",
    borderTop: "1px solid #eee",
    padding: "12px 16px",
    paddingBottom: "max(12px, env(safe-area-inset-bottom))",
  },
  footerInner: {
    maxWidth: "480px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  hint: {
    fontSize: "0.8rem",
    color: "#888",
    textAlign: "center",
    margin: 0,
  },
  confirmButton: {
    width: "100%",
    padding: "18px",
    backgroundColor: "#4a90e2",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    fontSize: "1.05rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  confirmButtonDisabled: {
    backgroundColor: "#bbb",
    cursor: "not-allowed",
  },
};

export default WaitingPage;

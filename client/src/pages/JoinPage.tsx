import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocketContext } from "../hooks/useSocketContext";

/**
 * QRコード・リンクから参加するページ
 */
function JoinPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { joinSession } = useSocketContext();
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = () => {
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }
    if (!sessionId) {
      setError("セッションIDが不正です");
      return;
    }

    setIsLoading(true);
    setError(null);

    joinSession(sessionId, name.trim(), (res) => {
      setIsLoading(false);
      if (!res.success) {
        setError(res.error ?? "参加に失敗しました");
        return;
      }
      navigate(`/session/${sessionId}/waiting`);
    });
  };

  const isDisabled = isLoading || !name.trim();

  return (
    <div style={styles.pageWrapper}>
      {/* スクロール可能なコンテンツ */}
      <div style={styles.scrollArea}>
        <div style={styles.hero}>
          <h1 style={styles.appName}>map-app</h1>
          <p style={styles.subtitle}>セッションに参加する</p>
        </div>

        <div style={styles.card}>
          <div style={styles.sessionInfoBox}>
            <span style={styles.sessionInfoLabel}>セッションID</span>
            <span style={styles.sessionInfoValue}>{sessionId}</span>
          </div>

          <div style={styles.inputGroup}>
            <label htmlFor="name" style={styles.label}>
              あなたの名前
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 田中"
              style={styles.input}
              maxLength={20}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              autoFocus
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}
        </div>
      </div>

      {/* 下部固定ボタン */}
      <div style={styles.footer}>
        <div style={styles.footerInner}>
          <button
            type="button"
            onClick={handleJoin}
            disabled={isDisabled}
            style={{
              ...styles.joinButton,
              ...(isDisabled ? styles.joinButtonDisabled : {}),
            }}
          >
            {isLoading ? "参加中..." : "参加する"}
          </button>
        </div>
      </div>
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
    padding: "40px 16px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  hero: {
    textAlign: "center",
    marginBottom: "32px",
  },
  appName: {
    fontSize: "2.8rem",
    fontWeight: "bold",
    margin: "0 0 8px",
    color: "#1a1a1a",
    letterSpacing: "-0.5px",
  },
  subtitle: {
    color: "#666",
    fontSize: "1rem",
    margin: 0,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: "16px",
    padding: "28px 24px",
    width: "100%",
    maxWidth: "480px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  sessionInfoBox: {
    backgroundColor: "#f0f6ff",
    border: "1px solid #bdd5f7",
    padding: "12px 16px",
    borderRadius: "10px",
    marginBottom: "24px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  sessionInfoLabel: {
    fontSize: "0.78rem",
    fontWeight: "bold",
    color: "#4a90e2",
    flexShrink: 0,
  },
  sessionInfoValue: {
    fontSize: "0.88rem",
    color: "#1a5fa8",
    fontWeight: "600",
    wordBreak: "break-all",
  },
  inputGroup: {
    marginBottom: "20px",
  },
  label: {
    display: "block",
    fontWeight: "bold",
    marginBottom: "8px",
    fontSize: "0.9rem",
    color: "#333",
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    border: "1.5px solid #ddd",
    borderRadius: "10px",
    fontSize: "1rem",
  },
  error: {
    color: "#e53e3e",
    fontSize: "0.85rem",
    marginBottom: "0",
    padding: "10px 14px",
    backgroundColor: "#fff5f5",
    borderRadius: "8px",
    border: "1px solid #feb2b2",
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
  },
  joinButton: {
    width: "100%",
    padding: "18px",
    backgroundColor: "#48bb78",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    fontSize: "1.05rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  joinButtonDisabled: {
    backgroundColor: "#bbb",
    cursor: "not-allowed",
  },
};

export default JoinPage;

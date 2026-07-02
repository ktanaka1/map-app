import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { SessionMode } from "shared/types";
import { useSocketContext } from "../hooks/useSocketContext";
import { scanSessionQr } from "../services/qrScanner";

function TopPage() {
  const navigate = useNavigate();
  const { createSession } = useSocketContext();
  const [name, setName] = useState("");
  const [selectedMode, setSelectedMode] = useState<SessionMode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endedMessage, setEndedMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // URLSearchParams.get はデコード済みの値を返すため、ここで再デコードしない
    // （msg に % が含まれると URIError で画面全体が落ちる）
    const msg = params.get("ended");
    if (msg) {
      setEndedMessage(msg);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const handleSelectMode = (mode: SessionMode) => {
    setSelectedMode(mode);
    setError(null);
  };

  const handleStart = () => {
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }
    if (!selectedMode) {
      setError("モードを選択してください");
      return;
    }

    setIsLoading(true);
    setError(null);

    createSession(selectedMode, name.trim(), (res) => {
      setIsLoading(false);
      if (!res.success || !res.sessionId) {
        setError(res.error ?? "セッションの作成に失敗しました");
        return;
      }

      const sessionId = res.sessionId;
      if (selectedMode === "solo") {
        navigate(`/session/${sessionId}/keyword`);
      } else {
        navigate(`/session/${sessionId}/waiting`);
      }
    });
  };

  const handleScanQr = async () => {
    const outcome = await scanSessionQr();
    if (outcome.status === "ok") {
      navigate(`/join/${outcome.sessionId}`);
    } else if (outcome.status === "invalid") {
      alert("このQRコードはセッションのものではありません");
    } else if (outcome.status === "error") {
      alert(outcome.message);
    }
    // cancelled は何もしない
  };

  const isDisabled = isLoading || !selectedMode || !name.trim();

  return (
    <div style={styles.pageWrapper}>
      {/* スクロール可能なコンテンツ領域 */}
      <div style={styles.scrollArea}>
        <div style={styles.hero}>
          <h1 style={styles.appName}>map-app</h1>
          <p style={styles.tagline}>お店をみんなで一緒に決めよう</p>
        </div>

        <div style={styles.card}>
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
              onKeyDown={(e) =>
                e.key === "Enter" && selectedMode && handleStart()
              }
            />
          </div>

          <p style={styles.modeLabel}>モードを選んでください</p>
          <div style={styles.modeButtons}>
            <button
              type="button"
              onClick={() => handleSelectMode("solo")}
              style={{
                ...styles.modeButton,
                ...(selectedMode === "solo" ? styles.modeButtonActive : {}),
              }}
            >
              <span style={styles.modeIcon}>1</span>
              <span style={styles.modeName}>ひとりで決める</span>
              <span style={styles.modeDesc}>自分だけで候補を探す</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectMode("multi")}
              style={{
                ...styles.modeButton,
                ...(selectedMode === "multi" ? styles.modeButtonActive : {}),
              }}
            >
              <span style={styles.modeIcon}>多</span>
              <span style={styles.modeName}>みんなで決める</span>
              <span style={styles.modeDesc}>グループで投票して決定</span>
            </button>
          </div>

          {endedMessage && <p style={styles.ended}>{endedMessage}</p>}
          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div style={styles.joinDivider}>
          <span style={styles.joinDividerText}>または</span>
        </div>
        <button type="button" onClick={handleScanQr} style={styles.scanButton}>
          QRコードで参加
        </button>
      </div>

      {/* 下部固定ボタン */}
      <div style={styles.footer}>
        <div style={styles.footerInner}>
          <button
            type="button"
            onClick={handleStart}
            disabled={isDisabled}
            style={{
              ...styles.startButton,
              ...(isDisabled ? styles.startButtonDisabled : {}),
            }}
          >
            {isLoading ? "作成中..." : "はじめる"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: "#f5f5f5",
  },
  scrollArea: {
    flex: 1,
    // 小画面（iPhone SE等）でコンテンツが切れて操作不能にならないようスクロール可能にする
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    overscrollBehavior: "contain",
    padding: "max(40px, calc(var(--safe-top) + 16px)) 16px 16px",
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
  tagline: {
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
  joinDivider: {
    width: "100%",
    maxWidth: "480px",
    textAlign: "center",
    margin: "20px 0 12px",
    borderTop: "1px solid #e0e0e0",
    position: "relative",
  },
  joinDividerText: {
    position: "relative",
    top: "-11px",
    backgroundColor: "#f5f5f5",
    padding: "0 12px",
    color: "#999",
    fontSize: "0.85rem",
  },
  scanButton: {
    width: "100%",
    maxWidth: "480px",
    padding: "14px",
    backgroundColor: "#fff",
    color: "#4a90e2",
    border: "1px solid #4a90e2",
    borderRadius: "12px",
    fontSize: "1rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  inputGroup: {
    marginBottom: "28px",
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
  modeLabel: {
    fontWeight: "bold",
    fontSize: "0.9rem",
    color: "#333",
    marginBottom: "14px",
    margin: "0 0 14px",
  },
  modeButtons: {
    display: "flex",
    gap: "12px",
    marginBottom: "24px",
  },
  modeButton: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "20px 8px",
    border: "2px solid #ddd",
    borderRadius: "12px",
    cursor: "pointer",
    backgroundColor: "#fff",
    transition: "all 0.15s",
  },
  modeButtonActive: {
    border: "2px solid #4a90e2",
    backgroundColor: "#f0f6ff",
  },
  modeIcon: {
    fontSize: "1.8rem",
    fontWeight: "bold",
    marginBottom: "10px",
    color: "#4a90e2",
  },
  modeName: {
    fontWeight: "bold",
    fontSize: "0.85rem",
    marginBottom: "4px",
    color: "#1a1a1a",
  },
  modeDesc: {
    fontSize: "0.72rem",
    color: "#888",
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
  ended: {
    color: "#92400e",
    fontSize: "0.85rem",
    marginBottom: "0",
    padding: "10px 14px",
    backgroundColor: "#fffbeb",
    borderRadius: "8px",
    border: "1px solid #fcd34d",
  },
  footer: {
    backgroundColor: "#fff",
    borderTop: "1px solid #eee",
    padding: "12px 16px",
    paddingBottom: "max(12px, var(--safe-bottom))",
  },
  footerInner: {
    maxWidth: "480px",
    margin: "0 auto",
  },
  startButton: {
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
  startButtonDisabled: {
    backgroundColor: "#bbb",
    cursor: "not-allowed",
  },
};

export default TopPage;

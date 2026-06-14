import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocketContext } from "../hooks/useSocketContext";
import { geocodeAddress } from "../services/geocodingService";
import RejoiningOverlay from "../components/RejoiningOverlay";

const RADIUS_OPTIONS: { label: string; value: number }[] = [
  { label: "500m", value: 500 },
  { label: "1km", value: 1000 },
  { label: "2km", value: 2000 },
];

const PRICE_OPTIONS: { label: string; value: number | null }[] = [
  { label: "指定なし", value: null },
  { label: "~1,000円", value: 1 },
  { label: "~2,000円", value: 2 },
  { label: "~5,000円", value: 3 },
];

type GpsStatus = "acquiring" | "ok" | "denied" | "error";

function KeywordPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { state, addKeyword, removeKeyword, startSearch, isRejoining } =
    useSocketContext();
  const { session } = state;

  // キーワード入力
  const [inputValue, setInputValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // GPS / 位置情報
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("acquiring");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  // 手動入力フォールバック
  const [manualAddress, setManualAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  const [radius, setRadius] = useState<number>(500);
  const [maxPriceLevel, setMaxPriceLevel] = useState<number | null>(null);

  const keywords = session?.keywords ?? [];
  const isHost = state.me?.id === session?.hostId || state.me?.isHost;

  // GPS取得は1回だけ実行
  const gpsAttempted = useRef(false);

  useEffect(() => {
    if (gpsAttempted.current) return;
    gpsAttempted.current = true;

    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGpsStatus("ok");
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus("denied");
        } else {
          setGpsStatus("error");
        }
      },
      { timeout: 5000, maximumAge: 60000 },
    );
  }, []);

  // フェーズが変わったらリダイレクト
  useEffect(() => {
    if (session?.phase === "voting") {
      navigate(`/session/${sessionId}/voting`);
    }
  }, [session?.phase, sessionId, navigate]);

  const handleAddKeyword = () => {
    const kw = inputValue.trim();
    if (!kw || !sessionId) return;
    if (keywords.includes(kw)) {
      setError("すでに追加されています");
      return;
    }

    addKeyword(sessionId, kw, (res) => {
      if (res.success) {
        setInputValue("");
        setError(null);
      } else {
        setError(res.error ?? "キーワードの追加に失敗しました");
      }
    });
  };

  const handleRemoveKeyword = (keyword: string) => {
    if (!sessionId) return;
    removeKeyword(sessionId, keyword, (res) => {
      if (!res.success) {
        setError(res.error ?? "キーワードの削除に失敗しました");
      }
    });
  };

  const handleGeocodeManual = async () => {
    const address = manualAddress.trim();
    if (!address) return;
    setIsGeocoding(true);
    setGeocodeError(null);

    try {
      const result = await geocodeAddress(address);
      setCoords(result);
      setGeocodeError(null);
    } catch (err) {
      setGeocodeError(
        err instanceof Error ? err.message : "場所の検索に失敗しました",
      );
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleStartSearch = () => {
    if (!sessionId || !coords) return;
    setIsSearching(true);
    setError(null);

    startSearch(
      sessionId,
      coords,
      radius,
      (res) => {
        setIsSearching(false);
        if (!res.success) {
          setError(res.error ?? "検索に失敗しました");
        }
      },
      maxPriceLevel,
    );
  };

  const isLocationReady = coords !== null;
  const needsManualInput = gpsStatus !== "ok";
  const isSearchButtonDisabled =
    keywords.length === 0 || isSearching || !isLocationReady;

  const searchButtonLabel = isSearching ? "検索中..." : "このキーワードで探す";

  if (isRejoining) return <RejoiningOverlay />;

  return (
    <div style={styles.pageWrapper}>
      {/* 固定ヘッダー */}
      <div style={styles.pageHeader}>
        <h2 style={styles.heading}>キーワードを入力</h2>
        {session && (
          <p style={styles.participants}>
            参加者: {session.participants.map((p) => p.name).join("、")}
          </p>
        )}
      </div>

      {/* スクロール可能なコンテンツ領域 */}
      <div style={styles.scrollArea}>
        <div style={styles.card}>
          {/* GPS状態バナー */}
          {gpsStatus === "ok" && coords && (
            <div style={{ ...styles.banner, ...styles.bannerSuccess }}>
              現在地を取得しました（{coords.lat.toFixed(4)},{" "}
              {coords.lng.toFixed(4)}）
            </div>
          )}

          {needsManualInput && (
            <div style={styles.manualSection}>
              <div style={{ ...styles.banner, ...styles.bannerWarning }}>
                {gpsStatus === "acquiring"
                  ? "現在地を取得中です。または場所をテキストで入力してください。"
                  : gpsStatus === "denied"
                    ? "位置情報の取得が拒否されました。場所をテキストで入力してください。"
                    : "位置情報の取得に失敗しました。場所をテキストで入力してください。"}
              </div>

              <div style={styles.inputRow}>
                <input
                  type="text"
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGeocodeManual()}
                  placeholder="例: 渋谷、新宿駅、東京タワー付近"
                  style={styles.input}
                  disabled={isGeocoding}
                />
                <button
                  type="button"
                  onClick={handleGeocodeManual}
                  disabled={!manualAddress.trim() || isGeocoding}
                  style={{
                    ...styles.addButton,
                    ...(!manualAddress.trim() || isGeocoding
                      ? styles.addButtonDisabled
                      : {}),
                  }}
                >
                  {isGeocoding ? "検索中" : "決定"}
                </button>
              </div>

              {geocodeError && <p style={styles.error}>{geocodeError}</p>}

              {coords && (
                <div style={{ ...styles.banner, ...styles.bannerSuccess }}>
                  場所を確定しました（{coords.lat.toFixed(4)},{" "}
                  {coords.lng.toFixed(4)}）
                </div>
              )}
            </div>
          )}

          {/* 半径・予算選択（ホストのみ） */}
          {isHost && (
            <>
              <div style={styles.radiusSection}>
                <p style={styles.sectionLabel}>検索範囲</p>
                <div style={styles.radiusButtons}>
                  {RADIUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRadius(opt.value)}
                      style={{
                        ...styles.radiusButton,
                        ...(radius === opt.value
                          ? styles.radiusButtonActive
                          : {}),
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.radiusSection}>
                <p style={styles.sectionLabel}>予算（上限）</p>
                <div style={styles.radiusButtons}>
                  {PRICE_OPTIONS.map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setMaxPriceLevel(opt.value)}
                      style={{
                        ...styles.radiusButton,
                        ...(maxPriceLevel === opt.value
                          ? styles.radiusButtonActive
                          : {}),
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* キーワード入力 */}
          <p style={styles.sectionLabel}>キーワード</p>
          <div style={styles.inputRow}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
              placeholder="例: 焼肉、個室、コスパよし"
              style={styles.input}
              maxLength={30}
            />
            <button
              type="button"
              onClick={handleAddKeyword}
              disabled={!inputValue.trim()}
              style={{
                ...styles.addButton,
                ...(!inputValue.trim() ? styles.addButtonDisabled : {}),
              }}
            >
              追加
            </button>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          {keywords.length === 0 ? (
            <p style={styles.empty}>キーワードをひとつ以上追加してください</p>
          ) : (
            <ul style={styles.keywordList}>
              {keywords.map((kw) => (
                <li key={kw} style={styles.keywordItem}>
                  <span style={styles.keywordText}>{kw}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveKeyword(kw)}
                    style={styles.removeButton}
                    aria-label={`${kw}を削除`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!isHost && (
            <p style={styles.waitingMessage}>
              ホストが検索を開始するまでお待ちください...
            </p>
          )}
        </div>
      </div>

      {/* ホストのみ下部固定ボタン */}
      {isHost && (
        <div style={styles.footer}>
          <div style={styles.footerInner}>
            <button
              type="button"
              onClick={handleStartSearch}
              disabled={isSearchButtonDisabled}
              style={{
                ...styles.searchButton,
                ...(isSearchButtonDisabled ? styles.searchButtonDisabled : {}),
              }}
            >
              {searchButtonLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    height: "calc(100vh - var(--safe-top) - var(--safe-bottom))",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: "#f5f5f5",
  },
  pageHeader: {
    flexShrink: 0,
    backgroundColor: "#fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
    paddingTop: "var(--safe-top)",
    padding: "var(--safe-top) 16px 14px",
    textAlign: "center",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 16px 32px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
  },
  heading: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    margin: "0 0 6px",
    color: "#1a1a1a",
  },
  participants: {
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
    fontSize: "0.88rem",
    fontWeight: "bold",
    color: "#444",
    margin: "0 0 10px",
  },
  banner: {
    padding: "10px 14px",
    borderRadius: "8px",
    fontSize: "0.85rem",
    marginBottom: "16px",
    lineHeight: "1.5",
  },
  bannerInfo: {
    backgroundColor: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
  },
  bannerSuccess: {
    backgroundColor: "#f0fdf4",
    color: "#15803d",
    border: "1px solid #bbf7d0",
  },
  bannerWarning: {
    backgroundColor: "#fffbeb",
    color: "#92400e",
    border: "1px solid #fde68a",
  },
  manualSection: {
    marginBottom: "20px",
  },
  radiusSection: {
    marginBottom: "24px",
  },
  radiusButtons: {
    display: "flex",
    gap: "8px",
  },
  radiusButton: {
    flex: 1,
    padding: "12px 0",
    border: "1.5px solid #ddd",
    borderRadius: "10px",
    backgroundColor: "#f9f9f9",
    color: "#333",
    fontSize: "0.9rem",
    cursor: "pointer",
    fontWeight: "500",
  },
  radiusButtonActive: {
    backgroundColor: "#4a90e2",
    color: "#fff",
    border: "1.5px solid #4a90e2",
    fontWeight: "bold",
  },
  inputRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "14px",
  },
  input: {
    flex: 1,
    padding: "12px 14px",
    border: "1.5px solid #ddd",
    borderRadius: "10px",
    fontSize: "1rem",
    minWidth: 0,
  },
  addButton: {
    padding: "12px 18px",
    backgroundColor: "#4a90e2",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontSize: "0.9rem",
    fontWeight: "bold",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  addButtonDisabled: {
    backgroundColor: "#bbb",
    cursor: "not-allowed",
  },
  error: {
    color: "#e53e3e",
    fontSize: "0.85rem",
    marginBottom: "12px",
    padding: "10px 14px",
    backgroundColor: "#fff5f5",
    borderRadius: "8px",
    border: "1px solid #feb2b2",
  },
  empty: {
    color: "#aaa",
    fontSize: "0.9rem",
    textAlign: "center",
    padding: "20px 0 4px",
    margin: 0,
  },
  keywordList: {
    listStyle: "none",
    padding: 0,
    margin: "0 0 8px",
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  keywordItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "7px 12px",
    backgroundColor: "#f0f6ff",
    border: "1.5px solid #bdd5f7",
    borderRadius: "20px",
  },
  keywordText: {
    fontSize: "0.9rem",
    color: "#1a5fa8",
    fontWeight: "500",
  },
  removeButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#7aaee8",
    fontSize: "1rem",
    padding: "0",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
  },
  waitingMessage: {
    color: "#888",
    fontSize: "0.9rem",
    textAlign: "center",
    margin: "16px 0 0",
  },
  footer: {
    flexShrink: 0,
    backgroundColor: "#fff",
    borderTop: "1px solid #eee",
    padding: "12px 16px",
    paddingBottom: "max(12px, var(--safe-bottom))",
  },
  footerInner: {
    maxWidth: "480px",
    margin: "0 auto",
  },
  searchButton: {
    width: "100%",
    padding: "18px",
    backgroundColor: "#f6813d",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    fontSize: "1.05rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  searchButtonDisabled: {
    backgroundColor: "#bbb",
    cursor: "not-allowed",
  },
};

export default KeywordPage;

import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { VoteChoice } from "shared/types";
import { useSocketContext } from "../hooks/useSocketContext";
import RejoiningOverlay from "../components/RejoiningOverlay";

function VotingPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { state, submitVote, isRejoining } = useSocketContext();
  const { session, restaurants, votedRestaurantIds, participantVoteCounts } =
    state;

  const participants = session?.participants ?? [];
  const totalParticipants = participants.length;

  // まだ投票していないレストランを順番に表示
  const currentRestaurant =
    restaurants.find((r) => !votedRestaurantIds.has(r.id)) ?? null;
  const votedCount = votedRestaurantIds.size;

  const allPhotos = currentRestaurant?.photos.filter(Boolean) ?? [];
  const heroPhoto = allPhotos[0] ?? null;
  const stripPhotos = allPhotos.slice(1);

  // フェーズが変わったらリダイレクト
  useEffect(() => {
    if (session?.phase === "result") {
      navigate(`/session/${sessionId}/result`);
    }
  }, [session?.phase, sessionId, navigate]);

  if (isRejoining) return <RejoiningOverlay />;

  const handleVote = (choice: VoteChoice) => {
    if (!currentRestaurant || !sessionId) return;
    submitVote(sessionId, currentRestaurant.id, choice, (res) => {
      if (!res.success) {
        console.error("投票に失敗しました:", res.error);
      }
    });
  };

  if (restaurants.length === 0) {
    return (
      <div style={styles.pageWrapper}>
        <div style={styles.centerBox}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>候補を読み込んでいます...</p>
        </div>
      </div>
    );
  }

  const allVoted = currentRestaurant === null;
  const progressPercent =
    restaurants.length > 0
      ? Math.round((votedCount / restaurants.length) * 100)
      : 0;

  return (
    <div style={styles.pageWrapper}>
      {/* 固定ヘッダー */}
      <div style={styles.stickyHeader}>
        <div style={styles.headerInner}>
          <div style={styles.headerLeft}>
            <span style={styles.headerTitle}>投票</span>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.progressBadge}>
              {votedCount} / {restaurants.length} 件
            </span>
          </div>
        </div>
        {/* プログレスバー */}
        <div style={styles.progressBarTrack}>
          <div
            style={{
              ...styles.progressBarFill,
              width: `${progressPercent}%`,
            }}
          />
        </div>
      </div>

      {/* スクロール可能なコンテンツ */}
      <div style={styles.scrollArea}>
        {/* 参加者進捗（マルチ時のみ） */}
        {totalParticipants > 1 && (
          <div style={styles.progressSection}>
            <p style={styles.progressTitle}>参加者の進捗</p>
            <div style={styles.progressList}>
              {participants.map((p) => {
                const isMe = p.id === state.me?.id;
                const count = isMe
                  ? votedCount
                  : (participantVoteCounts.get(p.id) ?? 0);
                return (
                  <div key={p.id} style={styles.progressItem}>
                    <span style={styles.progressName}>
                      {p.name}
                      {isMe ? "（あなた）" : ""}
                    </span>
                    <span style={styles.progressVotes}>{count}票</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 全投票完了して待機中 */}
        {allVoted ? (
          <div style={styles.waitingCard}>
            <div style={styles.waitingIcon}>
              <div style={styles.spinner} />
            </div>
            <p style={styles.waitingTitle}>投票が完了しました</p>
            <p style={styles.waitingText}>他の参加者の投票を待っています...</p>
          </div>
        ) : (
          /* 店舗カード */
          <div style={styles.restaurantCard}>
            {/* トップ写真 */}
            {heroPhoto && (
              <img
                src={heroPhoto}
                alt={currentRestaurant.name}
                style={styles.heroPhoto}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}

            <div style={styles.cardBody}>
              <div style={styles.cardMeta}>
                <span style={styles.cardIndex}>
                  {votedCount + 1} / {restaurants.length}
                </span>
                {currentRestaurant.priceLevel !== null && (
                  <span style={styles.priceTag}>
                    {"¥".repeat(currentRestaurant.priceLevel + 1)}
                  </span>
                )}
              </div>

              <h3 style={styles.restaurantName}>{currentRestaurant.name}</h3>
              <p style={styles.restaurantAddress}>
                {currentRestaurant.address}
              </p>

              <div style={styles.ratingRow}>
                <span style={styles.stars}>
                  {"★".repeat(Math.round(currentRestaurant.rating))}
                  {"☆".repeat(5 - Math.round(currentRestaurant.rating))}
                </span>
                <span style={styles.ratingValue}>
                  {currentRestaurant.rating.toFixed(1)}
                </span>
                <span style={styles.reviewCount}>
                  （{currentRestaurant.reviewCount}件のレビュー）
                </span>
              </div>

              {/* 投稿写真（横スクロール、2枚目以降） */}
              {stripPhotos.length > 0 && (
                <div style={styles.photoStrip}>
                  {stripPhotos.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`${currentRestaurant.name} ${i + 2}`}
                      style={styles.photoThumb}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ))}
                </div>
              )}

              {/* 外部リンク */}
              <div style={styles.linkRow}>
                <a
                  href={currentRestaurant.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.mapLink}
                >
                  Google Maps で見る
                </a>
                {currentRestaurant.websiteUrl && (
                  <a
                    href={currentRestaurant.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.webLink}
                  >
                    公式サイト
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 下部固定の投票ボタン（投票中のみ表示） */}
      {!allVoted && (
        <div style={styles.voteFooter}>
          <div style={styles.voteFooterInner}>
            <button
              type="button"
              onClick={() => handleVote("reject")}
              style={styles.rejectButton}
            >
              除外
            </button>
            <button
              type="button"
              onClick={() => handleVote("keep")}
              style={styles.keepButton}
            >
              キープ
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
  centerBox: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
  },
  stickyHeader: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    backgroundColor: "#fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
    paddingTop: "var(--safe-top)",
  },
  headerInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px 8px",
    maxWidth: "480px",
    margin: "0 auto",
    width: "100%",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
  },
  headerTitle: {
    fontWeight: "bold",
    fontSize: "1.1rem",
    color: "#1a1a1a",
  },
  progressBadge: {
    backgroundColor: "#f0f6ff",
    color: "#4a90e2",
    fontSize: "0.9rem",
    fontWeight: "bold",
    padding: "4px 12px",
    borderRadius: "12px",
    border: "1px solid #bdd5f7",
  },
  progressBarTrack: {
    height: "4px",
    backgroundColor: "#e8e8e8",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#4a90e2",
    transition: "width 0.3s ease",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "14px",
  },
  progressSection: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "16px 20px",
    width: "100%",
    maxWidth: "480px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  progressTitle: {
    fontWeight: "bold",
    fontSize: "0.82rem",
    color: "#888",
    margin: "0 0 10px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  progressList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  progressItem: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.9rem",
    color: "#333",
  },
  progressName: {
    color: "#444",
  },
  progressVotes: {
    color: "#4a90e2",
    fontWeight: "bold",
  },
  waitingCard: {
    backgroundColor: "#fff",
    borderRadius: "16px",
    padding: "48px 32px",
    textAlign: "center",
    width: "100%",
    maxWidth: "480px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
  },
  waitingIcon: {
    marginBottom: "8px",
  },
  waitingTitle: {
    fontWeight: "bold",
    fontSize: "1.15rem",
    color: "#1a1a1a",
    margin: 0,
  },
  waitingText: {
    color: "#888",
    fontSize: "0.9rem",
    margin: 0,
  },
  spinner: {
    width: "36px",
    height: "36px",
    border: "3px solid #eee",
    borderTopColor: "#4a90e2",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    margin: "0 auto",
  },
  restaurantCard: {
    backgroundColor: "#fff",
    borderRadius: "16px",
    overflow: "hidden",
    width: "100%",
    maxWidth: "480px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  heroPhoto: {
    width: "100%",
    height: "200px",
    objectFit: "cover",
    display: "block",
  },
  photoStrip: {
    display: "flex",
    gap: "4px",
    overflowX: "auto",
    marginTop: "14px",
    scrollbarWidth: "none" as const,
  },
  photoThumb: {
    flexShrink: 0,
    width: "100px",
    height: "100px",
    objectFit: "cover",
    borderRadius: "6px",
    display: "block",
  },
  cardBody: {
    padding: "20px",
  },
  cardMeta: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
  },
  cardIndex: {
    fontSize: "0.82rem",
    color: "#888",
    backgroundColor: "#f5f5f5",
    padding: "3px 12px",
    borderRadius: "10px",
  },
  priceTag: {
    fontSize: "0.9rem",
    color: "#666",
    fontWeight: "bold",
  },
  restaurantName: {
    fontSize: "1.4rem",
    fontWeight: "bold",
    color: "#1a1a1a",
    margin: "0 0 10px",
    lineHeight: "1.3",
  },
  restaurantAddress: {
    color: "#666",
    fontSize: "0.88rem",
    marginBottom: "16px",
    lineHeight: "1.5",
  },
  ratingRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  stars: {
    color: "#f6ad55",
    fontSize: "1.1rem",
    letterSpacing: "1px",
  },
  ratingValue: {
    color: "#444",
    fontSize: "1rem",
    fontWeight: "bold",
  },
  reviewCount: {
    color: "#888",
    fontSize: "0.82rem",
  },
  linkRow: {
    display: "flex",
    gap: "8px",
    marginTop: "14px",
    flexWrap: "wrap",
  },
  mapLink: {
    display: "inline-block",
    padding: "7px 14px",
    backgroundColor: "#e8f0fe",
    color: "#1a73e8",
    borderRadius: "8px",
    fontSize: "0.82rem",
    fontWeight: "600",
    textDecoration: "none",
  },
  webLink: {
    display: "inline-block",
    padding: "7px 14px",
    backgroundColor: "#f0fdf4",
    color: "#15803d",
    borderRadius: "8px",
    fontSize: "0.82rem",
    fontWeight: "600",
    textDecoration: "none",
  },
  loadingText: {
    color: "#888",
    fontSize: "0.95rem",
  },
  voteFooter: {
    position: "sticky",
    bottom: 0,
    backgroundColor: "#fff",
    borderTop: "1px solid #eee",
    padding: "12px 16px",
    paddingBottom: "max(12px, var(--safe-bottom))",
  },
  voteFooterInner: {
    display: "flex",
    gap: "12px",
    maxWidth: "480px",
    margin: "0 auto",
  },
  rejectButton: {
    flex: 1,
    height: "64px",
    backgroundColor: "#fc8181",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    fontSize: "1.15rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  keepButton: {
    flex: 1,
    height: "64px",
    backgroundColor: "#48bb78",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    fontSize: "1.15rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
};

export default VotingPage;

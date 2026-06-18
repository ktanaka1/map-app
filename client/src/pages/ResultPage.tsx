import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Restaurant } from "shared/types";
import { useSocketContext } from "../hooks/useSocketContext";
import { clearSessionFromStorage } from "../hooks/useSocket";
import { shareOrCopy } from "../services/share";
import RejoiningOverlay from "../components/RejoiningOverlay";

function ResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const {
    state,
    isRejoining,
    leaveSession,
    decideByRating,
    startRunoff,
    submitRunoffVote,
    decidePick,
  } = useSocketContext();
  const {
    votingResult,
    restaurants,
    session,
    me,
    finalDecision,
    myRunoffVote,
    runoffVotedCount,
  } = state;

  useEffect(() => {
    if (finalDecision) {
      scrollAreaRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [finalDecision]);

  if (isRejoining) return <RejoiningOverlay />;

  const getRestaurantById = (id: string): Restaurant | undefined =>
    restaurants.find((r) => r.id === id);

  if (votingResult === null) {
    return (
      <div style={styles.pageWrapper}>
        <div style={styles.centerBox}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>結果を読み込んでいます...</p>
        </div>
      </div>
    );
  }

  const keptRestaurants = votingResult.keptRestaurantIds
    .map((id) => getRestaurantById(id))
    .filter((r): r is Restaurant => r !== undefined);

  const fallbackRestaurant =
    votingResult.fallbackRestaurantId !== null
      ? getRestaurantById(votingResult.fallbackRestaurantId)
      : null;

  const isHost = me?.isHost ?? false;
  const isSolo = session?.mode === "solo";
  const isRunoff = session?.phase === "runoff";
  const totalParticipants = session?.participants.length ?? 0;

  // 決定店: 最終決定があればその店、キープ1件ならその店
  const decidedRestaurant = finalDecision
    ? getRestaurantById(finalDecision.restaurantId)
    : keptRestaurants.length === 1
      ? keptRestaurants[0]
      : null;

  const runnersUp = finalDecision
    ? finalDecision.runnersUpIds
        .map((id) => getRestaurantById(id))
        .filter((r): r is Restaurant => r !== undefined)
    : [];

  const decisionLabel = !finalDecision
    ? "全員一致で決定！"
    : finalDecision.method === "rating"
      ? "評価1位のお店に決定！"
      : finalDecision.method === "pick"
        ? "あなたが選んだお店に決定！"
        : finalDecision.tieBroken
          ? "決選投票で決定！（同数のため評価順で採用）"
          : "決選投票で決定！";

  const handleDecideByRating = () => {
    if (!sessionId) return;
    decideByRating(sessionId, (res) => {
      if (!res.success) alert(res.error ?? "決定に失敗しました");
    });
  };

  const handleStartRunoff = () => {
    if (!sessionId) return;
    startRunoff(sessionId, (res) => {
      if (!res.success) alert(res.error ?? "決選投票を開始できませんでした");
    });
  };

  const handleRunoffVote = (restaurantId: string) => {
    if (!sessionId) return;
    submitRunoffVote(sessionId, restaurantId, (res) => {
      if (!res.success) alert(res.error ?? "投票に失敗しました");
    });
  };

  const handlePick = (restaurantId: string) => {
    if (!sessionId) return;
    decidePick(sessionId, restaurantId, (res) => {
      if (!res.success) alert(res.error ?? "決定に失敗しました");
    });
  };

  const handleShareDecided = (restaurant: Restaurant) => {
    void shareOrCopy({
      title: "お店が決まりました！",
      text: `「${restaurant.name}」に決定！\n${restaurant.address}`,
      url: restaurant.websiteUrl ?? restaurant.googleMapsUrl,
      dialogTitle: "決まったお店を共有",
    }).then((result) => {
      if (result === "copied") alert("お店の情報をコピーしました");
    });
  };

  return (
    <div style={styles.pageWrapper}>
      {/* 固定ヘッダー */}
      <div style={styles.stickyHeader}>
        <div style={styles.headerInner}>
          <h2 style={styles.headerTitle}>投票結果</h2>
          <span style={styles.sessionLabel}>{sessionId}</span>
        </div>
      </div>

      {/* スクロール可能なコンテンツ */}
      <div ref={scrollAreaRef} style={styles.scrollArea}>
        {votingResult.allRejected ? (
          <div style={styles.section}>
            <div style={styles.allRejectedBanner}>
              <span style={styles.bannerEmoji}>×</span>
              <div>
                <p style={styles.allRejectedTitle}>全候補が除外されました</p>
                <p style={styles.allRejectedSubtitle}>
                  キーワードや場所、予算を変えてもう一度さがしてみましょう
                </p>
              </div>
            </div>
          </div>
        ) : votingResult.isFallback ? (
          <div style={styles.section}>
            <div style={styles.fallbackBanner}>
              <span style={styles.bannerEmoji}>!</span>
              <div>
                <p style={styles.fallbackTitle}>意見が分かれましたが...</p>
                <p style={styles.fallbackSubtitle}>
                  最も支持されたお店をご提案します
                </p>
              </div>
            </div>
            {fallbackRestaurant !== null &&
              fallbackRestaurant !== undefined && (
                <RestaurantCard restaurant={fallbackRestaurant} highlight />
              )}
          </div>
        ) : decidedRestaurant ? (
          /* 決定済み（キープ1件 or 絞り込み完了） */
          <div style={styles.section}>
            <div style={styles.successBanner}>
              <span style={styles.bannerEmoji}>OK</span>
              <div>
                <p style={styles.successTitle}>{decisionLabel}</p>
                <p style={styles.successSubtitle}>このお店に決まりました</p>
              </div>
            </div>
            <RestaurantCard restaurant={decidedRestaurant} highlight />
            <button
              type="button"
              onClick={() => handleShareDecided(decidedRestaurant)}
              style={styles.shareButton}
            >
              このお店を共有
            </button>
            {runnersUp.length > 0 && (
              <>
                <p style={styles.runnersUpLabel}>次点（全員一致だったお店）</p>
                {runnersUp.map((r) => (
                  <RestaurantCard key={r.id} restaurant={r} />
                ))}
              </>
            )}
          </div>
        ) : isRunoff ? (
          /* 決選投票中 */
          <div style={styles.section}>
            <div style={styles.runoffBanner}>
              <span style={styles.bannerEmoji}>VS</span>
              <div>
                <p style={styles.runoffTitle}>決選投票</p>
                <p style={styles.runoffSubtitle}>
                  行きたいお店を1つ選んでください（{runoffVotedCount} /{" "}
                  {totalParticipants}人投票済み）
                </p>
              </div>
            </div>
            {keptRestaurants.map((r) => (
              <div key={r.id}>
                <RestaurantCard restaurant={r} />
                <button
                  type="button"
                  onClick={() => handleRunoffVote(r.id)}
                  style={
                    myRunoffVote === r.id
                      ? styles.runoffVotedButton
                      : styles.runoffVoteButton
                  }
                >
                  {myRunoffVote === r.id
                    ? "✓ このお店に投票済み"
                    : "このお店に投票する"}
                </button>
              </div>
            ))}
            {myRunoffVote !== null && (
              <p style={styles.runoffHint}>
                全員の投票が揃うと自動で決定します（投票は変更できます）
              </p>
            )}
          </div>
        ) : (
          /* 複数キープ・未決定: 決め方の選択 */
          <div style={styles.section}>
            <div style={styles.successBanner}>
              <span style={styles.bannerEmoji}>OK</span>
              <div>
                <p style={styles.successTitle}>
                  {keptRestaurants.length}件のお店が全員一致！
                </p>
                <p style={styles.successSubtitle}>
                  {isSolo
                    ? "行きたいお店を1つ選んでください"
                    : isHost
                      ? "1店への決め方を選んでください"
                      : "ホストが決め方を選んでいます..."}
                </p>
              </div>
            </div>
            {!isSolo && isHost && (
              <div style={styles.decideButtonRow}>
                <button
                  type="button"
                  onClick={handleDecideByRating}
                  style={styles.decideRatingButton}
                >
                  評価1位で決定
                </button>
                <button
                  type="button"
                  onClick={handleStartRunoff}
                  style={styles.decideRunoffButton}
                >
                  決選投票する
                </button>
              </div>
            )}
            {keptRestaurants.map((r) => (
              <div key={r.id}>
                <RestaurantCard restaurant={r} />
                {isSolo && (
                  <button
                    type="button"
                    onClick={() => handlePick(r.id)}
                    style={styles.runoffVoteButton}
                  >
                    このお店にする
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 下部固定の「もう一度」ボタン */}
      <div style={styles.footer}>
        <div style={styles.footerInner}>
          <button
            type="button"
            onClick={() => {
              // サーバー側のセッションからも退出させる（残留するとメモリに溜まり続ける）
              if (sessionId) leaveSession(sessionId);
              clearSessionFromStorage();
              navigate("/");
            }}
            style={styles.retryButton}
          >
            もう一度さがす
          </button>
        </div>
      </div>
    </div>
  );
}

function RestaurantCard({
  restaurant,
  highlight = false,
}: {
  restaurant: Restaurant;
  highlight?: boolean;
}) {
  const allPhotos = restaurant.photos.filter(Boolean);
  const heroPhoto = allPhotos[0] ?? null;
  const stripPhotos = allPhotos.slice(1);

  return (
    <div
      style={{ ...cardStyles.card, ...(highlight ? cardStyles.highlight : {}) }}
    >
      {heroPhoto && (
        <img
          src={heroPhoto}
          alt={restaurant.name}
          style={cardStyles.heroPhoto}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}

      <div style={cardStyles.cardBody}>
        {highlight && <div style={cardStyles.highlightBadge}>おすすめ</div>}

        <h3 style={cardStyles.name}>{restaurant.name}</h3>
        <p style={cardStyles.address}>{restaurant.address}</p>

        <div style={cardStyles.ratingRow}>
          <span style={cardStyles.stars}>
            {"★".repeat(Math.round(restaurant.rating))}
            {"☆".repeat(5 - Math.round(restaurant.rating))}
          </span>
          <span style={cardStyles.ratingValue}>
            {restaurant.rating.toFixed(1)}
          </span>
          <span style={cardStyles.reviewCount}>
            （{restaurant.reviewCount}件）
          </span>
        </div>

        {restaurant.priceLevel !== null && (
          <p style={cardStyles.price}>
            価格帯: {"¥".repeat(restaurant.priceLevel + 1)}
          </p>
        )}

        {stripPhotos.length > 0 && (
          <div style={cardStyles.photoStrip}>
            {stripPhotos.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`${restaurant.name} ${i + 2}`}
                style={cardStyles.photoThumb}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ))}
          </div>
        )}

        <div style={cardStyles.actions}>
          <a
            href={restaurant.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={cardStyles.mapsLink}
          >
            Google マップで見る
          </a>
          {restaurant.websiteUrl && (
            <a
              href={restaurant.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={cardStyles.websiteLink}
            >
              公式サイト
            </a>
          )}
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
  centerBox: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
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
  loadingText: {
    color: "#888",
    fontSize: "0.95rem",
    margin: 0,
  },
  stickyHeader: {
    flexShrink: 0,
    backgroundColor: "#fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
    paddingTop: "var(--safe-top)",
  },
  headerInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    maxWidth: "480px",
    margin: "0 auto",
    width: "100%",
  },
  headerTitle: {
    fontSize: "1.2rem",
    fontWeight: "bold",
    color: "#1a1a1a",
    margin: 0,
  },
  sessionLabel: {
    fontSize: "0.75rem",
    color: "#aaa",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  section: {
    width: "100%",
    maxWidth: "480px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  fallbackBanner: {
    backgroundColor: "#fef3cd",
    border: "1px solid #fbbf24",
    borderRadius: "12px",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  allRejectedBanner: {
    backgroundColor: "#fee2e2",
    border: "1px solid #fca5a5",
    borderRadius: "12px",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  allRejectedTitle: {
    fontWeight: "bold",
    fontSize: "0.95rem",
    color: "#991b1b",
    margin: "0 0 2px",
  },
  allRejectedSubtitle: {
    color: "#991b1b",
    fontSize: "0.82rem",
    margin: 0,
  },
  successBanner: {
    backgroundColor: "#f0fff4",
    border: "1px solid #68d391",
    borderRadius: "12px",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  bannerEmoji: {
    fontSize: "1.4rem",
    fontWeight: "bold",
    flexShrink: 0,
    color: "#92400e",
  },
  fallbackTitle: {
    fontWeight: "bold",
    fontSize: "0.95rem",
    color: "#92400e",
    margin: "0 0 2px",
  },
  fallbackSubtitle: {
    color: "#92400e",
    fontSize: "0.82rem",
    margin: 0,
  },
  successTitle: {
    fontWeight: "bold",
    fontSize: "0.95rem",
    color: "#22543d",
    margin: "0 0 2px",
  },
  successCount: {
    color: "#276749",
    fontSize: "1.5rem",
    fontWeight: "bold",
    margin: 0,
  },
  successSubtitle: {
    color: "#276749",
    fontSize: "0.82rem",
    margin: 0,
  },
  runoffBanner: {
    backgroundColor: "#ede9fe",
    border: "1px solid #a78bfa",
    borderRadius: "12px",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  runoffTitle: {
    fontWeight: "bold",
    fontSize: "0.95rem",
    color: "#5b21b6",
    margin: "0 0 2px",
  },
  runoffSubtitle: {
    color: "#5b21b6",
    fontSize: "0.82rem",
    margin: 0,
  },
  runoffVoteButton: {
    width: "100%",
    marginTop: "8px",
    padding: "14px",
    backgroundColor: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontSize: "0.95rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  runoffVotedButton: {
    width: "100%",
    marginTop: "8px",
    padding: "14px",
    backgroundColor: "#ede9fe",
    color: "#5b21b6",
    border: "2px solid #7c3aed",
    borderRadius: "10px",
    fontSize: "0.95rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  runoffHint: {
    color: "#888",
    fontSize: "0.8rem",
    textAlign: "center",
    margin: 0,
  },
  decideButtonRow: {
    display: "flex",
    gap: "10px",
  },
  decideRatingButton: {
    flex: 1,
    padding: "16px 12px",
    backgroundColor: "#4a90e2",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontSize: "0.95rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  decideRunoffButton: {
    flex: 1,
    padding: "16px 12px",
    backgroundColor: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontSize: "0.95rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  shareButton: {
    width: "100%",
    padding: "12px",
    marginTop: "12px",
    backgroundColor: "#4a90e2",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  runnersUpLabel: {
    fontWeight: "bold",
    fontSize: "0.82rem",
    color: "#888",
    margin: "8px 0 0",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
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
  retryButton: {
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
};

const cardStyles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "16px",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    position: "relative",
  },
  highlight: {
    border: "2px solid #f6ad55",
    boxShadow: "0 4px 16px rgba(246,173,85,0.25)",
  },
  heroPhoto: {
    width: "100%",
    height: "200px",
    objectFit: "cover",
    display: "block",
  },
  cardBody: {
    padding: "20px 24px",
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
  highlightBadge: {
    display: "inline-block",
    backgroundColor: "#f6813d",
    color: "#fff",
    fontSize: "0.72rem",
    fontWeight: "bold",
    padding: "3px 10px",
    borderRadius: "10px",
    marginBottom: "10px",
  },
  name: {
    fontSize: "1.25rem",
    fontWeight: "bold",
    color: "#1a1a1a",
    margin: "0 0 8px",
    lineHeight: "1.3",
  },
  address: {
    color: "#666",
    fontSize: "0.85rem",
    marginBottom: "12px",
    lineHeight: "1.5",
  },
  ratingRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "6px",
    flexWrap: "wrap",
  },
  stars: {
    color: "#f6ad55",
    fontSize: "1rem",
    letterSpacing: "1px",
  },
  ratingValue: {
    color: "#444",
    fontSize: "0.95rem",
    fontWeight: "bold",
  },
  reviewCount: {
    color: "#888",
    fontSize: "0.82rem",
  },
  price: {
    color: "#666",
    fontSize: "0.85rem",
    marginBottom: "0",
  },
  actions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginTop: "18px",
  },
  mapsLink: {
    display: "inline-block",
    padding: "12px 20px",
    backgroundColor: "#4285f4",
    color: "#fff",
    borderRadius: "10px",
    textDecoration: "none",
    fontSize: "0.9rem",
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
  },
  websiteLink: {
    display: "inline-block",
    padding: "12px 20px",
    backgroundColor: "#f5f5f5",
    color: "#333",
    borderRadius: "10px",
    textDecoration: "none",
    fontSize: "0.9rem",
    border: "1px solid #ddd",
    textAlign: "center",
  },
};

export default ResultPage;

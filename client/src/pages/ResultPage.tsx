import { useNavigate, useParams } from "react-router-dom";
import type { Restaurant } from "shared/types";
import { useSocketContext } from "../hooks/useSocketContext";
import { clearSessionFromStorage } from "../hooks/useSocket";
import RejoiningOverlay from "../components/RejoiningOverlay";

function ResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { state, isRejoining, leaveSession } = useSocketContext();
  const { votingResult, restaurants } = state;

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
      <div style={styles.scrollArea}>
        {votingResult.isFallback ? (
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
        ) : (
          <div style={styles.section}>
            <div style={styles.successBanner}>
              <span style={styles.bannerEmoji}>OK</span>
              <div>
                <p style={styles.successTitle}>全員一致でキープされたお店</p>
                <p style={styles.successCount}>{keptRestaurants.length}件</p>
              </div>
            </div>
            {keptRestaurants.map((r) => (
              <RestaurantCard key={r.id} restaurant={r} />
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
    position: "sticky",
    top: 0,
    zIndex: 10,
    backgroundColor: "#fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
  },
  headerInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
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

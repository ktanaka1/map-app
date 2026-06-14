import { useSocketContext } from "../hooks/useSocketContext";

/**
 * サーバーとの接続が切れている間、画面上部に再接続中バナーを表示する。
 * Socket.IO が自動再接続するため、ユーザー操作は不要。
 */
function ConnectionBanner() {
  const { isConnected } = useSocketContext();

  if (isConnected) return null;

  return (
    <div style={styles.banner}>
      <span style={styles.dot} />
      接続が切れました。再接続しています...
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    paddingTop: "max(10px, var(--safe-top))",
    paddingBottom: "10px",
    paddingLeft: "16px",
    paddingRight: "16px",
    backgroundColor: "#fef3cd",
    borderBottom: "1px solid #fbbf24",
    color: "#92400e",
    fontSize: "0.85rem",
    fontWeight: "bold",
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#f59e0b",
    animation: "pulse 1s ease-in-out infinite",
  },
};

export default ConnectionBanner;

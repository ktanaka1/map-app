import type React from 'react';

/**
 * ページリロード後のセッション再接続中に表示するローディング画面
 */
function RejoiningOverlay() {
  return (
    <div style={styles.wrapper}>
      <div style={styles.box}>
        <div style={styles.spinner} />
        <p style={styles.text}>セッションに再接続中...</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  box: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '40px',
    backgroundColor: '#fff',
    borderRadius: '16px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #eee',
    borderTopColor: '#4a90e2',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  text: {
    color: '#555',
    fontSize: '1rem',
    margin: 0,
  },
};

export default RejoiningOverlay;

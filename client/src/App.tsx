import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SocketProvider } from "./hooks/useSocketContext";
import ConnectionBanner from "./components/ConnectionBanner";
import TopPage from "./pages/TopPage";
import WaitingPage from "./pages/WaitingPage";
import KeywordPage from "./pages/KeywordPage";
import VotingPage from "./pages/VotingPage";
import ResultPage from "./pages/ResultPage";
import JoinPage from "./pages/JoinPage";

function App() {
  return (
    <SocketProvider>
      <ConnectionBanner />
      <BrowserRouter>
        <Routes>
          {/* ソロ／マルチ選択・セッション作成 */}
          <Route path="/" element={<TopPage />} />
          {/* QRコード・リンクからの参加 */}
          <Route path="/join/:sessionId" element={<JoinPage />} />
          {/* 参加者の入室待ち（ホストはQRコード表示） */}
          <Route path="/session/:sessionId/waiting" element={<WaitingPage />} />
          {/* キーワード入力フェーズ */}
          <Route path="/session/:sessionId/keyword" element={<KeywordPage />} />
          {/* 投票フェーズ */}
          <Route path="/session/:sessionId/voting" element={<VotingPage />} />
          {/* 結果表示フェーズ */}
          <Route path="/session/:sessionId/result" element={<ResultPage />} />
          {/* 未知のURLは白画面にせずトップへ戻す */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
}

export default App;

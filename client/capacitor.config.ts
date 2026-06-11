import type { CapacitorConfig } from "@capacitor/cli";

// appId（Bundle ID）は App Store 提出後は実質変更不可。
// 提出前に正式なものを決めること（現在は仮: 会社ドメイン clover-hd.jp ベース）。
const config: CapacitorConfig = {
  appId: "jp.cloverhd.mapapp",
  appName: "map-app",
  webDir: "dist",
  // ローカル実機/シミュレータで Vite dev サーバーに接続する場合は
  // 以下を一時的に有効化する（コミットしないこと）:
  // server: { url: "http://<MacのローカルIP>:5173", cleartext: true },
};

export default config;

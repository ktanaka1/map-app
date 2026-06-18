import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";

export type SharePayload = {
  title?: string;
  text?: string;
  url?: string;
  /** Android の共有ダイアログのタイトル（iOS/Web では無視される） */
  dialogTitle?: string;
};

export type ShareResult = "shared" | "copied" | "dismissed";

/**
 * ネイティブ共有シート（iOS の UIActivityViewController = AirDrop/LINE/メッセージ等）を開く。
 *
 * - iOS/Android アプリ: `@capacitor/share` でネイティブシートを起動
 * - Web: Web Share API（モバイル Safari 等）が使えればそれを使い、
 *   非対応ならクリップボードコピーにフォールバックする
 *
 * Haptics と同様、Web では silent にフォールバックし呼び出し側は分岐不要。
 * 戻り値で「コピーにフォールバックしたか」を判定できる（コピー時はトースト表示等に使う）。
 */
export async function shareOrCopy(payload: SharePayload): Promise<ShareResult> {
  const { title, text, url, dialogTitle } = payload;

  // ネイティブ（iOS/Android）: Capacitor Share プラグイン
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ title, text, url, dialogTitle });
      return "shared";
    } catch {
      // ユーザーがキャンセルした場合も例外になるため dismissed 扱い
      return "dismissed";
    }
  }

  // Web: Web Share API（対応ブラウザはネイティブのシートが出る）
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch {
      return "dismissed";
    }
  }

  // フォールバック: クリップボードへコピー
  const copyText = url ?? text ?? "";
  if (copyText && navigator.clipboard) {
    await navigator.clipboard.writeText(copyText);
    return "copied";
  }
  return "dismissed";
}

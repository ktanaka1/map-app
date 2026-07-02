import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint,
} from "@capacitor/barcode-scanner";

export type ScanOutcome =
  | { status: "ok"; sessionId: string }
  | { status: "invalid"; raw: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/**
 * 招待QRが指す URL（`.../join/<sessionId>`）からセッションIDを抽出する。
 * クエリ・ハッシュは無視。対象外の文字列なら null。
 */
export function extractSessionId(raw: string): string | null {
  if (!raw) return null;
  const match = raw.match(/\/join\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * ネイティブのカメラQRスキャナを開き、読み取ったセッションIDを返す。
 *
 * - iOS/Android アプリ: `@capacitor/barcode-scanner` のネイティブスキャナUIを起動
 * - Web: html5-qrcode によるブラウザ内スキャナ（カメラ権限が必要）
 *
 * 参加者は標準カメラ → ブラウザ で入室できるため、これはアプリ利用者向けの
 * 追加導線（in-app スキャナ）。参加者へのインストール強制は発生しない。
 */
export async function scanSessionQr(): Promise<ScanOutcome> {
  let raw: string;
  try {
    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
      scanInstructions: "セッションのQRコードを枠内に収めてください",
    });
    raw = result.ScanResult;
  } catch (err) {
    // ユーザーキャンセルは無反応でよいが、権限拒否・非対応は理由を伝えないと
    // 「タップしても何も起きないボタン」になる
    const message = err instanceof Error ? err.message : String(err);
    if (/permission|denied|not.?allowed|access/i.test(message)) {
      return {
        status: "error",
        message:
          "カメラへのアクセスが許可されていません。設定アプリからカメラを許可してください",
      };
    }
    if (/not.?implemented|not.?supported|unavailable/i.test(message)) {
      return {
        status: "error",
        message: "この環境ではQRスキャンを利用できません",
      };
    }
    return { status: "cancelled" };
  }

  const sessionId = extractSessionId(raw);
  return sessionId ? { status: "ok", sessionId } : { status: "invalid", raw };
}

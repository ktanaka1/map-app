import type { SessionPhase } from "shared/types";

/**
 * セッションフェーズから対応するページのURLパスを返す。
 *
 * バックグラウンド復帰などで2フェーズ以上進んでいても、
 * 各ページはこのマッピングで正しい画面へ直接リダイレクトできる。
 * result と runoff はどちらも結果ページ（ResultPage内で決選投票UIを表示）。
 */
export function phaseToPath(sessionId: string, phase: SessionPhase): string {
  switch (phase) {
    case "waiting":
      return `/session/${sessionId}/waiting`;
    case "keyword":
      return `/session/${sessionId}/keyword`;
    case "voting":
      return `/session/${sessionId}/voting`;
    case "result":
    case "runoff":
      return `/session/${sessionId}/result`;
  }
}

/** 指定フェーズがこのページ（パス）に対応するかを判定するためのフェーズ集合 */
export const RESULT_PHASES: readonly SessionPhase[] = ["result", "runoff"];

import { PrismaClient } from "@prisma/client";
import type { SessionMode, SessionPhase } from "shared/types";

const prisma = new PrismaClient();

export const sessionRepository = {
  /**
   * セッションを新規作成する
   */
  async create(data: { mode: SessionMode; hostId: string }) {
    return prisma.session.create({
      data: {
        mode: data.mode,
        phase: "waiting" as SessionPhase,
        hostId: data.hostId,
        keywords: [],
      },
      include: { participants: true },
    });
  },

  /**
   * IDでセッションを取得する
   */
  async findById(id: string) {
    return prisma.session.findUnique({
      where: { id },
      include: { participants: true, candidates: true },
    });
  },

  /**
   * セッションのフェーズを更新する
   */
  async updatePhase(id: string, phase: SessionPhase) {
    return prisma.session.update({
      where: { id },
      data: { phase },
      include: { participants: true },
    });
  },

  /**
   * セッションのキーワードを更新する
   */
  async updateKeywords(id: string, keywords: string[]) {
    return prisma.session.update({
      where: { id },
      data: { keywords },
      include: { participants: true },
    });
  },
};

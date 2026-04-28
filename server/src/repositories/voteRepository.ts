import { PrismaClient } from '@prisma/client';
import type { VoteChoice } from 'shared/types';

const prisma = new PrismaClient();

export const voteRepository = {
  /**
   * 投票を記録する（すでに存在する場合は更新する）
   */
  async upsert(data: {
    sessionId: string;
    participantId: string;
    candidateId: string;
    choice: VoteChoice;
  }) {
    return prisma.vote.upsert({
      where: {
        participantId_candidateId: {
          participantId: data.participantId,
          candidateId: data.candidateId,
        },
      },
      create: {
        sessionId: data.sessionId,
        participantId: data.participantId,
        candidateId: data.candidateId,
        choice: data.choice,
      },
      update: {
        choice: data.choice,
      },
    });
  },

  /**
   * セッション内の全投票を取得する
   */
  async findBySession(sessionId: string) {
    return prisma.vote.findMany({
      where: { sessionId },
      include: { candidate: true },
    });
  },

  /**
   * 特定の飲食店への投票を取得する
   */
  async findByCandidate(candidateId: string) {
    return prisma.vote.findMany({
      where: { candidateId },
    });
  },
};

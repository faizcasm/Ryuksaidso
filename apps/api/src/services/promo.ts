import { timingSafeEqual } from 'node:crypto';
import { prisma } from '../lib/db';

export const PROMO_CODE = 'RyuksaidsoISLIVE20';
export const PROMO_DISCOUNT_PERCENT = 20;

export type PromoQualification = {
  customProviders: number;
  runsThroughCustom: number;
  eligible: boolean;
};

export type PromoValidation = {
  valid: boolean;
  message?: string;
  discountPercent?: number;
};

export async function promoQualification(organizationId: string): Promise<PromoQualification> {
  const providers = await prisma.modelProvider.findMany({
    where: { organizationId },
    select: { id: true },
  });
  if (!providers.length) return { customProviders: 0, runsThroughCustom: 0, eligible: false };
  const runsThroughCustom = await prisma.agentRun.count({
    where: {
      organizationId,
      status: 'COMPLETED',
      provider: { in: providers.map((row) => row.id) },
    },
  });
  return { customProviders: providers.length, runsThroughCustom, eligible: runsThroughCustom > 0 };
}

export function isPromoCodeMatch(candidate: string): boolean {
  const provided = Buffer.from(candidate.trim(), 'utf8');
  const expected = Buffer.from(PROMO_CODE, 'utf8');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export async function validatePromoCode(code: string, organizationId: string): Promise<PromoValidation> {
  if (!isPromoCodeMatch(code)) return { valid: false, message: 'That promo code is not valid.' };
  const qualification = await promoQualification(organizationId);
  if (!qualification.eligible) {
    return {
      valid: false,
      message: 'Add your own model provider and complete a run through it to unlock this code.',
    };
  }
  return { valid: true, discountPercent: PROMO_DISCOUNT_PERCENT };
}

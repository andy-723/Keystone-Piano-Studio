/** Plain-language money rules shown above the studio terms on the family enrolment form. */
export type MoneyRules = {
  billingCycle: string;
  lateFee: string;
  cancelNotice: string;
  makeUps: string;
  stopNotice: string;
};

export function moneyRulesFrom(
  mergeValues: Record<string, unknown> | null | undefined,
): MoneyRules {
  const billing = (mergeValues?.["billing"] ?? {}) as {
    cycle?: string;
    lateFee?: number;
    lateFeeAfterDays?: number;
    withdrawalNoticeWeeks?: number;
  };
  const policies = (mergeValues?.["policies"] ?? {}) as {
    cancelNoticeHours?: number;
    makeUpQuota?: number;
    makeUpPeriod?: string;
  };
  return {
    billingCycle: `Billing: ${billing.cycle ?? "per_term"}`,
    lateFee: `Late fee: $${billing.lateFee ?? 15} after ${billing.lateFeeAfterDays ?? 7} days`,
    cancelNotice: `Cancel notice: ${policies.cancelNoticeHours ?? 24} hours`,
    makeUps: `Make-ups: ${policies.makeUpQuota ?? 1} per ${policies.makeUpPeriod ?? "term"}`,
    stopNotice: `Stop notice: ${billing.withdrawalNoticeWeeks ?? 4} weeks`,
  };
}

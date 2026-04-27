// 源泉徴収税額表（簡易版）
// 甲欄: 月額課税対象額に対するブラケット方式
// 参考: 令和6年分 源泉徴収税額表（月額表）

interface TaxBracket {
  min: number;
  max: number;
  rate: number;
  deduction: number;
}

// 甲欄（扶養0人ベース）
const KOU_BRACKETS: TaxBracket[] = [
  { min: 0, max: 88000, rate: 0, deduction: 0 },
  { min: 88000, max: 89000, rate: 0.03063, deduction: 0 },
  { min: 89000, max: 162500, rate: 0.03063, deduction: 0 },
  { min: 162500, max: 275000, rate: 0.05105, deduction: 3300 },
  { min: 275000, max: 579000, rate: 0.10210, deduction: 17340 },
  { min: 579000, max: 750000, rate: 0.20420, deduction: 76480 },
  { min: 750000, max: 1500000, rate: 0.23483, deduction: 99450 },
  { min: 1500000, max: Infinity, rate: 0.33693, deduction: 252600 },
];

// 扶養1人あたりの月額控除額
const DEPENDENT_DEDUCTION_PER_PERSON = 31667;

/**
 * 甲欄の源泉徴収税額を計算
 * @param taxableAmount 課税対象額（総支給 - 社保）
 * @param dependentsCount 扶養人数
 * @returns 源泉徴収税額（円、端数切捨て）
 */
export function calculateKouTax(taxableAmount: number, dependentsCount: number): number {
  // 扶養控除を適用した課税対象額
  const adjustedAmount = Math.max(0, taxableAmount - dependentsCount * DEPENDENT_DEDUCTION_PER_PERSON);

  if (adjustedAmount < 88000) return 0;

  for (const bracket of KOU_BRACKETS) {
    if (adjustedAmount >= bracket.min && adjustedAmount < bracket.max) {
      return Math.floor(adjustedAmount * bracket.rate - bracket.deduction);
    }
  }

  // 最高ブラケット
  const last = KOU_BRACKETS[KOU_BRACKETS.length - 1];
  return Math.floor(adjustedAmount * last.rate - last.deduction);
}

/**
 * 乙欄の源泉徴収税額を計算
 * 甲欄の概算×1.5、最低3.063%
 * @param taxableAmount 課税対象額
 * @returns 源泉徴収税額（円、端数切捨て）
 */
export function calculateOtsuTax(taxableAmount: number): number {
  if (taxableAmount <= 0) return 0;

  const kouTax = calculateKouTax(taxableAmount, 0);
  const otsuTax = Math.max(
    Math.floor(taxableAmount * 0.03063),
    Math.floor(kouTax * 1.5)
  );
  return otsuTax;
}

/**
 * 源泉徴収税額を計算（甲欄/乙欄対応）
 */
export function calculateIncomeTax(
  taxableAmount: number,
  taxColumn: "kou" | "otsu",
  dependentsCount: number
): number {
  if (taxColumn === "otsu") {
    return calculateOtsuTax(taxableAmount);
  }
  return calculateKouTax(taxableAmount, dependentsCount);
}

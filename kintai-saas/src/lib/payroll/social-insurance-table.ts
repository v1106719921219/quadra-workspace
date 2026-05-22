// ============================================
// 協会けんぽ 標準報酬月額テーブル（令和8年度対応）
// ============================================
//
// 標準報酬月額から健康保険料・厚生年金保険料・子ども子育て支援金を自動計算
// 報酬月額の範囲 → 等級 → 標準報酬月額 → 保険料

interface InsuranceGrade {
  grade: number;           // 等級
  standard: number;        // 標準報酬月額
  minRemuneration: number; // 報酬月額下限
  maxRemuneration: number; // 報酬月額上限
}

// 健康保険の等級表（1〜50等級）
const HEALTH_INSURANCE_GRADES: InsuranceGrade[] = [
  { grade: 1, standard: 58000, minRemuneration: 0, maxRemuneration: 63000 },
  { grade: 2, standard: 68000, minRemuneration: 63000, maxRemuneration: 73000 },
  { grade: 3, standard: 78000, minRemuneration: 73000, maxRemuneration: 83000 },
  { grade: 4, standard: 88000, minRemuneration: 83000, maxRemuneration: 93000 },
  { grade: 5, standard: 98000, minRemuneration: 93000, maxRemuneration: 101000 },
  { grade: 6, standard: 104000, minRemuneration: 101000, maxRemuneration: 107000 },
  { grade: 7, standard: 110000, minRemuneration: 107000, maxRemuneration: 114000 },
  { grade: 8, standard: 118000, minRemuneration: 114000, maxRemuneration: 122000 },
  { grade: 9, standard: 126000, minRemuneration: 122000, maxRemuneration: 130000 },
  { grade: 10, standard: 134000, minRemuneration: 130000, maxRemuneration: 138000 },
  { grade: 11, standard: 142000, minRemuneration: 138000, maxRemuneration: 146000 },
  { grade: 12, standard: 150000, minRemuneration: 146000, maxRemuneration: 155000 },
  { grade: 13, standard: 160000, minRemuneration: 155000, maxRemuneration: 165000 },
  { grade: 14, standard: 170000, minRemuneration: 165000, maxRemuneration: 175000 },
  { grade: 15, standard: 180000, minRemuneration: 175000, maxRemuneration: 185000 },
  { grade: 16, standard: 190000, minRemuneration: 185000, maxRemuneration: 195000 },
  { grade: 17, standard: 200000, minRemuneration: 195000, maxRemuneration: 210000 },
  { grade: 18, standard: 220000, minRemuneration: 210000, maxRemuneration: 230000 },
  { grade: 19, standard: 240000, minRemuneration: 230000, maxRemuneration: 250000 },
  { grade: 20, standard: 260000, minRemuneration: 250000, maxRemuneration: 270000 },
  { grade: 21, standard: 280000, minRemuneration: 270000, maxRemuneration: 290000 },
  { grade: 22, standard: 300000, minRemuneration: 290000, maxRemuneration: 310000 },
  { grade: 23, standard: 320000, minRemuneration: 310000, maxRemuneration: 330000 },
  { grade: 24, standard: 340000, minRemuneration: 330000, maxRemuneration: 350000 },
  { grade: 25, standard: 360000, minRemuneration: 350000, maxRemuneration: 370000 },
  { grade: 26, standard: 380000, minRemuneration: 370000, maxRemuneration: 395000 },
  { grade: 27, standard: 410000, minRemuneration: 395000, maxRemuneration: 425000 },
  { grade: 28, standard: 440000, minRemuneration: 425000, maxRemuneration: 455000 },
  { grade: 29, standard: 470000, minRemuneration: 455000, maxRemuneration: 485000 },
  { grade: 30, standard: 500000, minRemuneration: 485000, maxRemuneration: 515000 },
  { grade: 31, standard: 530000, minRemuneration: 515000, maxRemuneration: 545000 },
  { grade: 32, standard: 560000, minRemuneration: 545000, maxRemuneration: 575000 },
  { grade: 33, standard: 590000, minRemuneration: 575000, maxRemuneration: 605000 },
  { grade: 34, standard: 620000, minRemuneration: 605000, maxRemuneration: 635000 },
  { grade: 35, standard: 650000, minRemuneration: 635000, maxRemuneration: 665000 },
  { grade: 36, standard: 680000, minRemuneration: 665000, maxRemuneration: 695000 },
  { grade: 37, standard: 710000, minRemuneration: 695000, maxRemuneration: 730000 },
  { grade: 38, standard: 750000, minRemuneration: 730000, maxRemuneration: 770000 },
  { grade: 39, standard: 790000, minRemuneration: 770000, maxRemuneration: 810000 },
  { grade: 40, standard: 830000, minRemuneration: 810000, maxRemuneration: 855000 },
  { grade: 41, standard: 880000, minRemuneration: 855000, maxRemuneration: 905000 },
  { grade: 42, standard: 930000, minRemuneration: 905000, maxRemuneration: 955000 },
  { grade: 43, standard: 980000, minRemuneration: 955000, maxRemuneration: 1005000 },
  { grade: 44, standard: 1030000, minRemuneration: 1005000, maxRemuneration: 1055000 },
  { grade: 45, standard: 1090000, minRemuneration: 1055000, maxRemuneration: 1115000 },
  { grade: 46, standard: 1150000, minRemuneration: 1115000, maxRemuneration: 1175000 },
  { grade: 47, standard: 1210000, minRemuneration: 1175000, maxRemuneration: 1235000 },
  { grade: 48, standard: 1270000, minRemuneration: 1235000, maxRemuneration: 1295000 },
  { grade: 49, standard: 1330000, minRemuneration: 1295000, maxRemuneration: 1355000 },
  { grade: 50, standard: 1390000, minRemuneration: 1355000, maxRemuneration: Infinity },
];

// 厚生年金の等級表（1〜32等級、上限65万円）
const PENSION_GRADES: InsuranceGrade[] = [
  { grade: 1, standard: 88000, minRemuneration: 0, maxRemuneration: 93000 },
  { grade: 2, standard: 98000, minRemuneration: 93000, maxRemuneration: 101000 },
  { grade: 3, standard: 104000, minRemuneration: 101000, maxRemuneration: 107000 },
  { grade: 4, standard: 110000, minRemuneration: 107000, maxRemuneration: 114000 },
  { grade: 5, standard: 118000, minRemuneration: 114000, maxRemuneration: 122000 },
  { grade: 6, standard: 126000, minRemuneration: 122000, maxRemuneration: 130000 },
  { grade: 7, standard: 134000, minRemuneration: 130000, maxRemuneration: 138000 },
  { grade: 8, standard: 142000, minRemuneration: 138000, maxRemuneration: 146000 },
  { grade: 9, standard: 150000, minRemuneration: 146000, maxRemuneration: 155000 },
  { grade: 10, standard: 160000, minRemuneration: 155000, maxRemuneration: 165000 },
  { grade: 11, standard: 170000, minRemuneration: 165000, maxRemuneration: 175000 },
  { grade: 12, standard: 180000, minRemuneration: 175000, maxRemuneration: 185000 },
  { grade: 13, standard: 190000, minRemuneration: 185000, maxRemuneration: 195000 },
  { grade: 14, standard: 200000, minRemuneration: 195000, maxRemuneration: 210000 },
  { grade: 15, standard: 220000, minRemuneration: 210000, maxRemuneration: 230000 },
  { grade: 16, standard: 240000, minRemuneration: 230000, maxRemuneration: 250000 },
  { grade: 17, standard: 260000, minRemuneration: 250000, maxRemuneration: 270000 },
  { grade: 18, standard: 280000, minRemuneration: 270000, maxRemuneration: 290000 },
  { grade: 19, standard: 300000, minRemuneration: 290000, maxRemuneration: 310000 },
  { grade: 20, standard: 320000, minRemuneration: 310000, maxRemuneration: 330000 },
  { grade: 21, standard: 340000, minRemuneration: 330000, maxRemuneration: 350000 },
  { grade: 22, standard: 360000, minRemuneration: 350000, maxRemuneration: 370000 },
  { grade: 23, standard: 380000, minRemuneration: 370000, maxRemuneration: 395000 },
  { grade: 24, standard: 410000, minRemuneration: 395000, maxRemuneration: 425000 },
  { grade: 25, standard: 440000, minRemuneration: 425000, maxRemuneration: 455000 },
  { grade: 26, standard: 470000, minRemuneration: 455000, maxRemuneration: 485000 },
  { grade: 27, standard: 500000, minRemuneration: 485000, maxRemuneration: 515000 },
  { grade: 28, standard: 530000, minRemuneration: 515000, maxRemuneration: 545000 },
  { grade: 29, standard: 560000, minRemuneration: 545000, maxRemuneration: 575000 },
  { grade: 30, standard: 590000, minRemuneration: 575000, maxRemuneration: 605000 },
  { grade: 31, standard: 620000, minRemuneration: 605000, maxRemuneration: 635000 },
  { grade: 32, standard: 650000, minRemuneration: 635000, maxRemuneration: Infinity },
];

// 保険料率（令和8年度想定、被保険者負担分）
// 健康保険料率は都道府県によって異なる。ここではデフォルト値を設定。
// 実際の都道府県別料率は設定画面から変更可能にする想定。
const DEFAULT_HEALTH_INSURANCE_RATE = 0.05;  // 健康保険 被保険者負担 約5.0%（全国平均）
const PENSION_RATE = 0.0915;                  // 厚生年金 被保険者負担 9.15%（全国一律）
const CHILD_SUPPORT_RATE = 0.00036;           // 子ども・子育て支援金 R8.4〜 被保険者負担 0.036%

/**
 * 標準報酬月額から健康保険の等級を取得
 */
function getHealthInsuranceGrade(standardRemuneration: number): InsuranceGrade {
  for (const grade of HEALTH_INSURANCE_GRADES) {
    if (standardRemuneration >= grade.minRemuneration && standardRemuneration < grade.maxRemuneration) {
      return grade;
    }
  }
  return HEALTH_INSURANCE_GRADES[HEALTH_INSURANCE_GRADES.length - 1];
}

/**
 * 標準報酬月額から厚生年金の等級を取得
 */
function getPensionGrade(standardRemuneration: number): InsuranceGrade {
  for (const grade of PENSION_GRADES) {
    if (standardRemuneration >= grade.minRemuneration && standardRemuneration < grade.maxRemuneration) {
      return grade;
    }
  }
  return PENSION_GRADES[PENSION_GRADES.length - 1];
}

export interface SocialInsuranceResult {
  healthInsurance: number;          // 健康保険料（被保険者負担）
  pension: number;                  // 厚生年金保険料（被保険者負担）
  childSupportContribution: number; // 子ども・子育て支援金（被保険者負担）
  healthGradeStandard: number;      // 健康保険 標準報酬月額
  pensionGradeStandard: number;     // 厚生年金 標準報酬月額
}

/**
 * 標準報酬月額から社会保険料を計算
 * @param standardRemuneration 標準報酬月額（従業員マスタに登録された値）
 * @param healthRate 健康保険料率（被保険者負担分、デフォルト5.0%）
 */
export function calculateSocialInsurance(
  standardRemuneration: number,
  healthRate: number = DEFAULT_HEALTH_INSURANCE_RATE
): SocialInsuranceResult {
  if (standardRemuneration <= 0) {
    return {
      healthInsurance: 0,
      pension: 0,
      childSupportContribution: 0,
      healthGradeStandard: 0,
      pensionGradeStandard: 0,
    };
  }

  const healthGrade = getHealthInsuranceGrade(standardRemuneration);
  const pensionGrade = getPensionGrade(standardRemuneration);

  // 各保険料 = 標準報酬月額 × 料率（端数50銭以下切捨て、50銭超切上げ）
  const healthInsurance = Math.round(healthGrade.standard * healthRate);
  const pension = Math.round(pensionGrade.standard * PENSION_RATE);
  const childSupportContribution = Math.round(healthGrade.standard * CHILD_SUPPORT_RATE);

  return {
    healthInsurance,
    pension,
    childSupportContribution,
    healthGradeStandard: healthGrade.standard,
    pensionGradeStandard: pensionGrade.standard,
  };
}

/**
 * 報酬月額から標準報酬月額を決定する
 * （定時決定・随時改定で使用）
 */
export function determineStandardRemuneration(monthlyRemuneration: number): number {
  const grade = getHealthInsuranceGrade(monthlyRemuneration);
  return grade.standard;
}

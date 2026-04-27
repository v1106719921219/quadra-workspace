/**
 * 締め日期間計算ユーティリティ
 *
 * 例: 26日締めの場合
 * - 3月度 = 2/26 〜 3/25
 * - 4月度 = 3/26 〜 4/25
 */

export interface ClosingPeriod {
  /** 表示用の年 (例: 2026) */
  year: number;
  /** 表示用の月 (例: 3 = 3月度) */
  month: number;
  /** 期間開始日 (YYYY-MM-DD) */
  startDate: string;
  /** 期間終了日 (YYYY-MM-DD) */
  endDate: string;
  /** ラベル (例: "2026年3月度") */
  label: string;
}

/**
 * 締め日ベースの期間を計算
 * @param year 対象年
 * @param month 対象月（1-12）
 * @param closingDay 締め日（0=月末, 1-28）
 */
export function getClosingPeriod(year: number, month: number, closingDay: number): ClosingPeriod {
  if (closingDay === 0) {
    // 月末締め: 当月1日〜当月末日
    const startDate = formatDate(year, month, 1);
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = formatDate(year, month, lastDay);
    return {
      year,
      month,
      startDate,
      endDate,
      label: `${year}年${month}月度`,
    };
  }

  // N日締め: 前月(N+1)日 〜 当月N日
  // 例: 26日締め3月度 → 2/26 〜 3/25 ではなく 2/27 〜 3/26
  // 実際の慣習: 26日締め = 前月27日〜当月26日
  // → しかし建設業界では「26日締め」=前月26日〜当月25日が一般的
  // ここでは: 前月(closingDay)日 〜 当月(closingDay-1)日
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const startDate = formatDate(prevYear, prevMonth, closingDay);
  const endDate = formatDate(year, month, closingDay - 1);

  return {
    year,
    month,
    startDate,
    endDate,
    label: `${year}年${month}月度`,
  };
}

/**
 * 今日がどの締め期間に属するかを返す
 */
export function getCurrentPeriod(closingDay: number): ClosingPeriod {
  const now = new Date();
  const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const year = jstNow.getFullYear();
  const month = jstNow.getMonth() + 1;
  const day = jstNow.getDate();

  if (closingDay === 0) {
    // 月末締め: 当月
    return getClosingPeriod(year, month, closingDay);
  }

  // N日締め: 当日がN日以降なら翌月度、N日より前なら当月度
  if (day >= closingDay) {
    // 翌月度
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return getClosingPeriod(nextYear, nextMonth, closingDay);
  } else {
    // 当月度
    return getClosingPeriod(year, month, closingDay);
  }
}

/**
 * 前の期間を取得
 */
export function getPreviousPeriod(period: ClosingPeriod, closingDay: number): ClosingPeriod {
  const prevMonth = period.month === 1 ? 12 : period.month - 1;
  const prevYear = period.month === 1 ? period.year - 1 : period.year;
  return getClosingPeriod(prevYear, prevMonth, closingDay);
}

/**
 * 次の期間を取得
 */
export function getNextPeriod(period: ClosingPeriod, closingDay: number): ClosingPeriod {
  const nextMonth = period.month === 12 ? 1 : period.month + 1;
  const nextYear = period.month === 12 ? period.year + 1 : period.year;
  return getClosingPeriod(nextYear, nextMonth, closingDay);
}

/**
 * 期間内の全日付をYYYY-MM-DD配列で返す
 */
export function getDatesInPeriod(period: ClosingPeriod): string[] {
  const dates: string[] = [];
  const current = new Date(period.startDate + "T00:00:00+09:00");
  const end = new Date(period.endDate + "T00:00:00+09:00");

  while (current <= end) {
    dates.push(current.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

import type {
  EmployeeForPayroll,
  TimeRecordForPayroll,
  DailyWorkDetail,
  PayrollCalculation,
} from "./types";
import { calculateIncomeTax } from "./tax-table";
import { calculateSocialInsurance } from "./social-insurance-table";
import { roundUpToInterval, roundDownToInterval } from "@/lib/time-utils";

// ドライバー手当（円/日）
const DRIVER_ALLOWANCE_PER_DAY = 1200;

// 雇用保険料率（一般事業 被保険者負担 0.5%）
const EMPLOYMENT_INSURANCE_RATE = 0.005;

// 深夜時間帯（22:00-05:00）
const LATE_NIGHT_START = 22;
const LATE_NIGHT_END = 5;

// 1日の所定労働時間（分）
const STANDARD_DAILY_MINUTES = 480; // 8時間

// 月の所定労働日数（不就労控除計算用）
const STANDARD_MONTHLY_WORK_DAYS = 22;

// JSTオフセット（サーバーTZに依存せずJSTの壁時計時刻で計算するため）
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 日付が土日（休日）かどうか判定（TZ非依存）
 */
function isHoliday(dateStr: string): boolean {
  const day = new Date(dateStr + "T00:00:00Z").getUTCDay();
  return day === 0 || day === 6; // 日曜=0, 土曜=6
}

/**
 * clock_in〜clock_outのうちJSTの22:00-05:00に重なる分数を計算（TZ非依存）
 * 実時刻を+9hシフトし、UTCメソッドでJSTの壁時計時刻として扱う
 */
function calcLateNightMinutes(clockIn: Date, clockOut: Date): number {
  const inJst = new Date(clockIn.getTime() + JST_OFFSET_MS);
  const outJst = new Date(clockOut.getTime() + JST_OFFSET_MS);

  let total = 0;
  const current = new Date(inJst);

  while (current < outJst) {
    const dayStart = new Date(current);
    dayStart.setUTCHours(0, 0, 0, 0);

    const lateStart = new Date(dayStart);
    lateStart.setUTCHours(LATE_NIGHT_START, 0, 0, 0);

    const nextDay = new Date(dayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const lateEnd = new Date(dayStart);
    lateEnd.setUTCHours(LATE_NIGHT_END, 0, 0, 0);

    // 0:00-5:00の深夜帯
    if (lateEnd > inJst && dayStart < outJst) {
      const overlapStart = new Date(Math.max(inJst.getTime(), dayStart.getTime()));
      const overlapEnd = new Date(Math.min(outJst.getTime(), lateEnd.getTime()));
      if (overlapEnd > overlapStart) {
        total += (overlapEnd.getTime() - overlapStart.getTime()) / 60000;
      }
    }

    // 22:00-24:00の深夜帯
    if (nextDay > inJst && lateStart < outJst) {
      const overlapStart = new Date(Math.max(inJst.getTime(), lateStart.getTime()));
      const overlapEnd = new Date(Math.min(outJst.getTime(), nextDay.getTime()));
      if (overlapEnd > overlapStart) {
        total += (overlapEnd.getTime() - overlapStart.getTime()) / 60000;
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
    current.setUTCHours(0, 0, 0, 0);
  }

  return total;
}

/**
 * 1日分の勤務詳細を計算（15分刻み丸め対応）
 */
function calculateDailyWork(record: TimeRecordForPayroll, roundingMinutes: number = 15, fallbackHourlyRate: number = 0): DailyWorkDetail | null {
  if (!record.clock_out) return null;

  const clockIn = new Date(record.clock_in);
  const clockOut = new Date(record.clock_out);

  let totalMinutes: number;
  if (record.actual_hours_override != null) {
    // 手動上書き値を使用
    totalMinutes = record.actual_hours_override * 60;
  } else {
    // 15分刻み丸め: 出勤は切り上げ、退勤は切り下げ
    const roundedIn = roundUpToInterval(clockIn, roundingMinutes);
    const roundedOut = roundDownToInterval(clockOut, roundingMinutes);
    totalMinutes = (roundedOut.getTime() - roundedIn.getTime()) / 60000 - record.break_minutes;
  }

  if (totalMinutes <= 0) return null;

  const overtimeMinutes = Math.max(0, totalMinutes - STANDARD_DAILY_MINUTES);
  const normalMinutes = totalMinutes - overtimeMinutes;
  const lateNightMinutes = calcLateNightMinutes(clockIn, clockOut);
  const holiday = isHoliday(record.work_date);

  // 日当加算: 配置ボードの現場日当 → work_typeの日当 の優先順位
  const dailyAllowance = record.site_daily_allowance > 0
    ? record.site_daily_allowance
    : (record.work_types?.daily_allowance || 0);

  // 時給: 配置ボードの現場時給 → work_typeの時給 → フォールバック の優先順位
  const hourlyRate = record.site_hourly_rate ?? record.work_types?.hourly_rate ?? fallbackHourlyRate;

  return {
    date: record.work_date,
    clockIn: record.clock_in,
    clockOut: record.clock_out,
    breakMinutes: record.break_minutes,
    totalMinutes,
    normalMinutes,
    overtimeMinutes,
    lateNightMinutes,
    isHoliday: holiday,
    dailyAllowance,
    workTypeName: record.work_types?.name || "",
    isDriver: record.is_driver || false,
    hourlyRate,
    siteName: record.site_name || null,
  };
}

/**
 * 従業員1人分の月次給与を計算
 */
export function calculateEmployeePayroll(
  employee: EmployeeForPayroll,
  records: TimeRecordForPayroll[],
  roundingMinutes: number = 15
): PayrollCalculation {
  // 日次計算（パートは業務タイプの時給、社員はフォールバックとして月給÷160h）
  const fallbackHourlyRate = employee.employee_type === "part_time"
    ? (employee.hourly_rate || 0)
    : (employee.monthly_salary || 0) / 160;

  const dailyDetails: DailyWorkDetail[] = [];
  for (const record of records) {
    const detail = calculateDailyWork(record, roundingMinutes, fallbackHourlyRate);
    if (detail) dailyDetails.push(detail);
  }

  // 勤怠サマリ
  const workDays = dailyDetails.length;
  let totalMinutes = 0;
  let overtimeMinutes = 0;
  let lateNightMinutes = 0;
  let holidayMinutes = 0;
  let dailyAllowanceTotal = 0;
  let driverDays = 0;

  for (const d of dailyDetails) {
    totalMinutes += d.totalMinutes;
    overtimeMinutes += d.overtimeMinutes;
    lateNightMinutes += d.lateNightMinutes;
    if (d.isHoliday) holidayMinutes += d.totalMinutes;
    dailyAllowanceTotal += d.dailyAllowance;
    if (d.isDriver) driverDays++;
  }

  const driverAllowance = driverDays * DRIVER_ALLOWANCE_PER_DAY;

  const totalHours = Math.round(totalMinutes / 60 * 4) / 4;
  // 正社員は早退と相殺のため残業計算不要
  const overtimeHours = employee.employee_type === "full_time" ? 0 : Math.round(overtimeMinutes / 60 * 4) / 4;
  const lateNightHoursVal = Math.round(lateNightMinutes / 60 * 4) / 4;
  const holidayHours = Math.round(holidayMinutes / 60 * 4) / 4;

  // 基本給・割増計算
  let basePay: number;
  let overtimePay: number;
  let lateNightPay: number;
  let holidayPay: number;
  let absenceDeduction = 0;

  if (employee.employee_type === "part_time") {
    // パート: 日ごとの業務タイプ時給を使って計算
    basePay = 0;
    overtimePay = 0;
    lateNightPay = 0;
    holidayPay = 0;
    for (const d of dailyDetails) {
      basePay += d.normalMinutes / 60 * d.hourlyRate;
      overtimePay += d.overtimeMinutes / 60 * d.hourlyRate * 1.25;
      lateNightPay += d.lateNightMinutes / 60 * d.hourlyRate * 0.25;
      if (d.isHoliday) holidayPay += d.totalMinutes / 60 * d.hourlyRate * 0.35;
    }
    basePay = Math.round(basePay);
    overtimePay = Math.round(overtimePay);
    lateNightPay = Math.round(lateNightPay);
    holidayPay = Math.round(holidayPay);
  } else {
    // 社員: 月給固定、割増分のみ追加
    const hourlyBase = (employee.monthly_salary || 0) / 160;
    basePay = employee.monthly_salary || 0;
    overtimePay = Math.round(overtimeHours * hourlyBase * 0.25);
    lateNightPay = Math.round(lateNightHoursVal * hourlyBase * 0.25);
    holidayPay = Math.round(holidayHours * hourlyBase * 0.35);

    // 不就労控除: 所定労働日数に対して欠勤がある場合
    // 不就労控除 = 月給 ÷ 所定労働日数 × 欠勤日数
    if (workDays < STANDARD_MONTHLY_WORK_DAYS) {
      const absenceDays = STANDARD_MONTHLY_WORK_DAYS - workDays;
      const dailyRate = (employee.monthly_salary || 0) / STANDARD_MONTHLY_WORK_DAYS;
      absenceDeduction = Math.round(dailyRate * absenceDays);
    }
  }

  const transportationAllowance = employee.transportation_allowance || 0;

  const grossPay = basePay + overtimePay + lateNightPay + holidayPay
    - absenceDeduction
    + dailyAllowanceTotal + driverAllowance + transportationAllowance;

  // ========== 控除計算 ==========

  // 社会保険料（協会けんぽ・標準報酬月額ベース）
  let healthInsurance = 0;
  let pension = 0;
  let childSupportContribution = 0;
  let careInsurance = 0;

  if (employee.social_insurance_enrolled && employee.standard_monthly_remuneration > 0) {
    const siResult = calculateSocialInsurance(
      employee.standard_monthly_remuneration,
      employee.care_insurance_enrolled
    );
    healthInsurance = siResult.healthInsurance;
    pension = siResult.pension;
    childSupportContribution = siResult.childSupportContribution;
    careInsurance = siResult.careInsurance;
  }

  // 雇用保険（加入者のみ、総支給額ベース）
  let employmentInsurance = 0;
  if (employee.employment_insurance_enrolled) {
    employmentInsurance = Math.round(grossPay * EMPLOYMENT_INSURANCE_RATE);
  }

  const totalSocialInsurance = healthInsurance + pension + childSupportContribution + careInsurance + employmentInsurance;

  // 所得税（課税対象 = 総支給 - 社保 - 非課税通勤手当）
  const taxableAmount = Math.max(0, grossPay - totalSocialInsurance - transportationAllowance);
  const incomeTax = calculateIncomeTax(taxableAmount, employee.tax_column, employee.dependents_count);

  // 住民税（従業員マスタの固定額）
  const residentTax = employee.resident_tax || 0;

  // 積立金（従業員マスタの固定額）
  const savingsDeduction = employee.savings_deduction || 0;

  const totalDeductions = totalSocialInsurance + incomeTax + residentTax + savingsDeduction;
  const netPay = grossPay - totalDeductions;

  return {
    employee,
    workDays,
    totalHours,
    overtimeHours,
    lateNightHours: lateNightHoursVal,
    holidayHours,
    basePay,
    overtimePay,
    lateNightPay,
    holidayPay,
    absenceDeduction,
    dailyAllowanceTotal,
    driverDays,
    driverAllowance,
    transportationAllowance,
    grossPay,
    healthInsurance,
    pension,
    childSupportContribution,
    careInsurance,
    employmentInsurance,
    incomeTax,
    residentTax,
    savingsDeduction,
    totalDeductions,
    netPay,
    dailyDetails,
  };
}

import type {
  EmployeeForPayroll,
  TimeRecordForPayroll,
  DailyWorkDetail,
  PayrollCalculation,
} from "./types";
import { calculateIncomeTax } from "./tax-table";
import { roundUpToInterval, roundDownToInterval } from "@/lib/time-utils";

// ドライバー手当（円/日）
const DRIVER_ALLOWANCE_PER_DAY = 1200;

// 社保料率（概算）
const HEALTH_INSURANCE_RATE = 0.05; // 健康保険 5%
const PENSION_RATE = 0.0915; // 厚生年金 9.15%
const EMPLOYMENT_INSURANCE_RATE = 0.006; // 雇用保険 0.6%

// 深夜時間帯（22:00-05:00）
const LATE_NIGHT_START = 22;
const LATE_NIGHT_END = 5;

// 1日の所定労働時間（分）
const STANDARD_DAILY_MINUTES = 480; // 8時間

/**
 * 日付が土日（休日）かどうか判定
 */
function isHoliday(dateStr: string): boolean {
  const date = new Date(dateStr + "T00:00:00+09:00");
  const day = date.getDay();
  return day === 0 || day === 6; // 日曜=0, 土曜=6
}

/**
 * clock_in〜clock_outのうち22:00-05:00に重なる分数を計算
 */
function calcLateNightMinutes(clockIn: Date, clockOut: Date): number {
  let total = 0;
  // 日付をまたぐ可能性があるので、1日ずつチェック
  const current = new Date(clockIn);

  while (current < clockOut) {
    // この日の22:00
    const dayStart = new Date(current);
    dayStart.setHours(0, 0, 0, 0);

    const lateStart = new Date(dayStart);
    lateStart.setHours(LATE_NIGHT_START, 0, 0, 0);

    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);

    const lateEnd = new Date(dayStart);
    lateEnd.setHours(LATE_NIGHT_END, 0, 0, 0);

    // 0:00-5:00の深夜帯
    if (lateEnd > clockIn && dayStart < clockOut) {
      const overlapStart = new Date(Math.max(clockIn.getTime(), dayStart.getTime()));
      const overlapEnd = new Date(Math.min(clockOut.getTime(), lateEnd.getTime()));
      if (overlapEnd > overlapStart) {
        total += (overlapEnd.getTime() - overlapStart.getTime()) / 60000;
      }
    }

    // 22:00-24:00の深夜帯
    if (nextDay > clockIn && lateStart < clockOut) {
      const overlapStart = new Date(Math.max(clockIn.getTime(), lateStart.getTime()));
      const overlapEnd = new Date(Math.min(clockOut.getTime(), nextDay.getTime()));
      if (overlapEnd > overlapStart) {
        total += (overlapEnd.getTime() - overlapStart.getTime()) / 60000;
      }
    }

    // 次の日へ
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
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

  // 15分刻み丸め: 出勤は切り上げ、退勤は切り下げ
  const roundedIn = roundUpToInterval(clockIn, roundingMinutes);
  const roundedOut = roundDownToInterval(clockOut, roundingMinutes);
  const totalMinutes = (roundedOut.getTime() - roundedIn.getTime()) / 60000 - record.break_minutes;

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
 * @param roundingMinutes 時間丸め分数（デフォルト15分）
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
  const overtimeHours = Math.round(overtimeMinutes / 60 * 4) / 4;
  const lateNightHoursVal = Math.round(lateNightMinutes / 60 * 4) / 4;
  const holidayHours = Math.round(holidayMinutes / 60 * 4) / 4;

  // 基本給・割増計算
  let basePay: number;
  let overtimePay: number;
  let lateNightPay: number;
  let holidayPay: number;

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
  }

  const transportationAllowance = employee.transportation_allowance || 0;

  const grossPay = basePay + overtimePay + lateNightPay + holidayPay
    + dailyAllowanceTotal + driverAllowance + transportationAllowance;

  // 社保控除（概算）
  let healthInsurance = 0;
  let pension = 0;
  if (employee.social_insurance_enrolled) {
    // 社保は通勤手当を含む総支給額ベース
    const socialInsuranceBase = grossPay;
    healthInsurance = Math.round(socialInsuranceBase * HEALTH_INSURANCE_RATE);
    pension = Math.round(socialInsuranceBase * PENSION_RATE);
  }
  // 雇用保険は全員対象
  const employmentInsurance = Math.round(grossPay * EMPLOYMENT_INSURANCE_RATE);

  const totalSocialInsurance = healthInsurance + pension + employmentInsurance;

  // 所得税（課税対象 = 総支給 - 社保 - 非課税通勤手当）
  const taxableAmount = Math.max(0, grossPay - totalSocialInsurance - transportationAllowance);
  const incomeTax = calculateIncomeTax(taxableAmount, employee.tax_column, employee.dependents_count);

  const totalDeductions = totalSocialInsurance + incomeTax;
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
    dailyAllowanceTotal,
    driverDays,
    driverAllowance,
    transportationAllowance,
    grossPay,
    healthInsurance,
    pension,
    employmentInsurance,
    incomeTax,
    totalDeductions,
    netPay,
    dailyDetails,
  };
}

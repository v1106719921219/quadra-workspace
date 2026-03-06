// 給与計算関連の型定義

export interface EmployeeForPayroll {
  id: string;
  name: string;
  employee_number: string | null;
  employee_type: "part_time" | "full_time";
  hourly_rate: number | null;
  monthly_salary: number | null;
  transportation_allowance: number;
  dependents_count: number;
  tax_column: "kou" | "otsu";
  social_insurance_enrolled: boolean;
}

export interface TimeRecordForPayroll {
  id: string;
  employee_id: string;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  work_types: { name: string; daily_allowance: number };
}

export interface DailyWorkDetail {
  date: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  totalMinutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  lateNightMinutes: number;
  isHoliday: boolean;
  dailyAllowance: number;
  workTypeName: string;
}

export interface PayrollCalculation {
  employee: EmployeeForPayroll;

  // 勤怠サマリ
  workDays: number;
  totalHours: number;
  overtimeHours: number;
  lateNightHours: number;
  holidayHours: number;

  // 支給
  basePay: number;
  overtimePay: number;
  lateNightPay: number;
  holidayPay: number;
  dailyAllowanceTotal: number;
  transportationAllowance: number;
  grossPay: number;

  // 控除
  healthInsurance: number;
  pension: number;
  employmentInsurance: number;
  incomeTax: number;
  totalDeductions: number;

  // 差引支給額
  netPay: number;

  // 明細
  dailyDetails: DailyWorkDetail[];
}

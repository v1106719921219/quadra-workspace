"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { createEmployee, updateEmployee } from "./actions";
import { toast } from "sonner";
import { ResidentTaxDialog } from "./resident-tax-dialog";

interface Employee {
  id: string;
  name: string;
  employee_number: string | null;
  employee_type: string;
  hourly_rate: number | null;
  monthly_salary: number | null;
  is_active: boolean;
  transportation_allowance: number;
  dependents_count: number;
  tax_column: string;
  social_insurance_enrolled: boolean;
  employment_insurance_enrolled: boolean;
  care_insurance_enrolled: boolean;
  standard_monthly_remuneration: number;
  resident_tax: number;
  savings_deduction: number;
  can_be_driver: boolean;
  board_char: string | null;
  pin: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  account_type: string | null;
  account_number: string | null;
  account_holder: string | null;
  address: string | null;
  birth_date: string | null;
  gender: string | null;
  hire_date: string | null;
  retire_date: string | null;
  job_description: string | null;
}

interface EmployeeFormProps {
  employee?: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmployeeForm({ employee, open, onOpenChange }: EmployeeFormProps) {
  const [employeeType, setEmployeeType] = useState(employee?.employee_type || "part_time");
  const [taxColumn, setTaxColumn] = useState(employee?.tax_column || "kou");
  const [socialInsurance, setSocialInsurance] = useState(employee?.social_insurance_enrolled || false);
  const [employmentInsurance, setEmploymentInsurance] = useState(employee?.employment_insurance_enrolled || false);
  const [careInsurance, setCareInsurance] = useState(employee?.care_insurance_enrolled || false);
  const [canBeDriver, setCanBeDriver] = useState(employee?.can_be_driver || false);
  const [loading, setLoading] = useState(false);
  const [residentTaxOpen, setResidentTaxOpen] = useState(false);
  const [accountType, setAccountType] = useState(employee?.account_type || "ordinary");
  const [gender, setGender] = useState(employee?.gender || "");

  // ダイアログが開くたびに既存データで状態を初期化
  useEffect(() => {
    if (open) {
      setEmployeeType(employee?.employee_type || "part_time");
      setTaxColumn(employee?.tax_column || "kou");
      setSocialInsurance(employee?.social_insurance_enrolled || false);
      setEmploymentInsurance(employee?.employment_insurance_enrolled || false);
      setCareInsurance(employee?.care_insurance_enrolled || false);
      setCanBeDriver(employee?.can_be_driver || false);
      setAccountType(employee?.account_type || "ordinary");
      setGender(employee?.gender || "");
    }
  }, [open, employee]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      formData.set("employee_type", employeeType);
      formData.set("tax_column", taxColumn);
      formData.set("social_insurance_enrolled", String(socialInsurance));
      formData.set("employment_insurance_enrolled", String(employmentInsurance));
      formData.set("care_insurance_enrolled", String(careInsurance));
      formData.set("can_be_driver", String(canBeDriver));
      formData.set("account_type", accountType);
      formData.set("gender", gender);
      if (employee) {
        formData.set("is_active", String(employee.is_active));
        await updateEmployee(employee.id, formData);
        toast.success("従業員を更新しました");
      } else {
        await createEmployee(formData);
        toast.success("従業員を追加しました");
      }
      onOpenChange(false);
    } catch {
      toast.error("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee ? "従業員編集" : "従業員追加"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="name">名前</Label>
              <Input
                id="name"
                name="name"
                defaultValue={employee?.name}
                required
              />
            </div>
            <div className="col-span-1 space-y-2">
              <Label htmlFor="board_char">
                配置表文字
                <span className="text-[10px] text-gray-400 ml-1">（1文字）</span>
              </Label>
              <Input
                id="board_char"
                name="board_char"
                defaultValue={employee?.board_char || ""}
                maxLength={1}
                placeholder={employee?.name?.slice(0, 1) || "自動"}
                className="text-center text-lg font-bold"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="employee_number">社員番号</Label>
              <Input
                id="employee_number"
                name="employee_number"
                defaultValue={employee?.employee_number || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">
                PIN
                <span className="text-[10px] text-gray-400 ml-1">（4〜6桁）</span>
              </Label>
              <Input
                id="pin"
                name="pin"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                maxLength={6}
                minLength={4}
                defaultValue={employee?.pin || ""}
                placeholder="0000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>雇用形態</Label>
            <Select value={employeeType} onValueChange={setEmployeeType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="part_time">パート（時給）</SelectItem>
                <SelectItem value="full_time">社員（月給）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {employeeType === "part_time" ? (
            <div className="space-y-2">
              <Label htmlFor="hourly_rate">時給（円）</Label>
              <Input
                id="hourly_rate"
                name="hourly_rate"
                type="number"
                defaultValue={employee?.hourly_rate || ""}
                placeholder="1200"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="monthly_salary">月給（円）</Label>
              <Input
                id="monthly_salary"
                name="monthly_salary"
                type="number"
                defaultValue={employee?.monthly_salary || ""}
                placeholder="250000"
              />
            </div>
          )}
          <div className="border-t pt-4 mt-4">
            <p className="text-sm font-medium mb-3">給与設定</p>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="transportation_allowance">通勤手当（月額・円）</Label>
                <Input
                  id="transportation_allowance"
                  name="transportation_allowance"
                  type="number"
                  defaultValue={employee?.transportation_allowance || 0}
                  placeholder="10000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dependents_count">扶養人数</Label>
                <Input
                  id="dependents_count"
                  name="dependents_count"
                  type="number"
                  min="0"
                  defaultValue={employee?.dependents_count || 0}
                />
              </div>
              <div className="space-y-2">
                <Label>税区分</Label>
                <Select value={taxColumn} onValueChange={setTaxColumn}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kou">甲欄</SelectItem>
                    <SelectItem value="otsu">乙欄</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="social_insurance_enrolled"
                  checked={socialInsurance}
                  onCheckedChange={(checked) => setSocialInsurance(checked === true)}
                />
                <Label htmlFor="social_insurance_enrolled" className="cursor-pointer">
                  社会保険加入（協会けんぽ）
                </Label>
              </div>
              {socialInsurance && (
                <div className="space-y-2 ml-6">
                  <Label htmlFor="standard_monthly_remuneration">標準報酬月額（円）</Label>
                  <Input
                    id="standard_monthly_remuneration"
                    name="standard_monthly_remuneration"
                    type="number"
                    defaultValue={employee?.standard_monthly_remuneration || 0}
                    placeholder="200000"
                  />
                  <p className="text-xs text-muted-foreground">
                    健康保険・厚生年金・子ども子育て支援金を自動計算します
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="care_insurance_enrolled"
                      checked={careInsurance}
                      onCheckedChange={(checked) => setCareInsurance(checked === true)}
                    />
                    <Label htmlFor="care_insurance_enrolled" className="cursor-pointer">
                      介護保険対象（40〜64歳）
                    </Label>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="employment_insurance_enrolled"
                  checked={employmentInsurance}
                  onCheckedChange={(checked) => setEmploymentInsurance(checked === true)}
                />
                <Label htmlFor="employment_insurance_enrolled" className="cursor-pointer">
                  雇用保険加入（0.5%）
                </Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="resident_tax">住民税（月額・円）</Label>
                <div className="flex gap-2">
                  <Input
                    id="resident_tax"
                    name="resident_tax"
                    type="number"
                    defaultValue={employee?.resident_tax || 0}
                    placeholder="0"
                  />
                  {employee && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setResidentTaxOpen(true)}
                    >
                      月別内訳
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-gray-400">
                  月別内訳の登録がある月はそちらが優先されます
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="savings_deduction">積立金（月額・円）</Label>
                <Input
                  id="savings_deduction"
                  name="savings_deduction"
                  type="number"
                  defaultValue={employee?.savings_deduction || 0}
                  placeholder="0"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="can_be_driver"
                  checked={canBeDriver}
                  onCheckedChange={(checked) => setCanBeDriver(checked === true)}
                />
                <Label htmlFor="can_be_driver" className="cursor-pointer">
                  ドライバー対象
                </Label>
              </div>
            </div>
          </div>
          <div className="border-t pt-4 mt-4">
            <p className="text-sm font-medium mb-3">振込口座（給与振込一覧表用）</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bank_name">銀行名</Label>
                <Input id="bank_name" name="bank_name" defaultValue={employee?.bank_name || ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_branch">支店名</Label>
                <Input id="bank_branch" name="bank_branch" defaultValue={employee?.bank_branch || ""} />
              </div>
              <div className="space-y-2">
                <Label>口座種別</Label>
                <Select value={accountType} onValueChange={setAccountType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ordinary">普通</SelectItem>
                    <SelectItem value="checking">当座</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="account_number">口座番号</Label>
                <Input id="account_number" name="account_number" inputMode="numeric" defaultValue={employee?.account_number || ""} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="account_holder">口座名義（カナ）</Label>
                <Input id="account_holder" name="account_holder" defaultValue={employee?.account_holder || ""} />
              </div>
            </div>
          </div>
          <div className="border-t pt-4 mt-4">
            <p className="text-sm font-medium mb-3">労働者名簿情報</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="address">住所</Label>
                <Input id="address" name="address" defaultValue={employee?.address || ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birth_date">生年月日</Label>
                <Input id="birth_date" name="birth_date" type="date" defaultValue={employee?.birth_date || ""} />
              </div>
              <div className="space-y-2">
                <Label>性別</Label>
                <Select value={gender || undefined} onValueChange={setGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="未設定" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">男</SelectItem>
                    <SelectItem value="female">女</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hire_date">入社日</Label>
                <Input id="hire_date" name="hire_date" type="date" defaultValue={employee?.hire_date || ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="retire_date">退職日</Label>
                <Input id="retire_date" name="retire_date" type="date" defaultValue={employee?.retire_date || ""} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="job_description">従事する業務の種類</Label>
                <Input id="job_description" name="job_description" defaultValue={employee?.job_description || ""} placeholder="ハウスクリーニング業務" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "保存中..." : "保存"}
            </Button>
          </div>
        </form>
      </DialogContent>
      {employee && (
        <ResidentTaxDialog
          employeeId={employee.id}
          employeeName={employee.name}
          open={residentTaxOpen}
          onOpenChange={setResidentTaxOpen}
        />
      )}
    </Dialog>
  );
}

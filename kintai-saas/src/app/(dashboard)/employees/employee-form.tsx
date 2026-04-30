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
  can_be_driver: boolean;
  board_char: string | null;
  pin: string | null;
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
  const [canBeDriver, setCanBeDriver] = useState(employee?.can_be_driver || false);
  const [loading, setLoading] = useState(false);

  // ダイアログが開くたびに既存データで状態を初期化
  useEffect(() => {
    if (open) {
      setEmployeeType(employee?.employee_type || "part_time");
      setTaxColumn(employee?.tax_column || "kou");
      setSocialInsurance(employee?.social_insurance_enrolled || false);
      setCanBeDriver(employee?.can_be_driver || false);
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
      formData.set("can_be_driver", String(canBeDriver));
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
      <DialogContent>
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
                  社会保険加入
                </Label>
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
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { EmployeeForm } from "./employee-form";
import { deleteEmployee, updateEmployee } from "./actions";
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
}

export function EmployeesClient({ employees }: { employees: Employee[] }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  function handleEdit(emp: Employee) {
    setEditingEmployee(emp);
    setFormOpen(true);
  }

  function handleAdd() {
    setEditingEmployee(null);
    setFormOpen(true);
  }

  async function handleDelete(emp: Employee) {
    if (!confirm(`${emp.name} を削除しますか？`)) return;
    try {
      await deleteEmployee(emp.id);
      toast.success("従業員を削除しました");
    } catch {
      toast.error("削除に失敗しました");
    }
  }

  async function handleToggleActive(emp: Employee) {
    const formData = new FormData();
    formData.set("name", emp.name);
    formData.set("employee_number", emp.employee_number || "");
    formData.set("employee_type", emp.employee_type);
    formData.set("hourly_rate", emp.hourly_rate?.toString() || "");
    formData.set("monthly_salary", emp.monthly_salary?.toString() || "");
    formData.set("transportation_allowance", emp.transportation_allowance?.toString() || "0");
    formData.set("dependents_count", emp.dependents_count?.toString() || "0");
    formData.set("tax_column", emp.tax_column || "kou");
    formData.set("social_insurance_enrolled", String(emp.social_insurance_enrolled || false));
    formData.set("is_active", String(!emp.is_active));
    try {
      await updateEmployee(emp.id, formData);
      toast.success(emp.is_active ? "無効化しました" : "有効化しました");
    } catch {
      toast.error("更新に失敗しました");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">従業員管理</h1>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          従業員追加
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名前</TableHead>
            <TableHead>社員番号</TableHead>
            <TableHead>雇用形態</TableHead>
            <TableHead>時給/月給</TableHead>
            <TableHead>状態</TableHead>
            <TableHead className="w-[100px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                従業員が登録されていません
              </TableCell>
            </TableRow>
          ) : (
            employees.map((emp) => (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">{emp.name}</TableCell>
                <TableCell>{emp.employee_number || "-"}</TableCell>
                <TableCell>
                  <Badge variant={emp.employee_type === "part_time" ? "secondary" : "default"}>
                    {emp.employee_type === "part_time" ? "パート" : "社員"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {emp.employee_type === "part_time"
                    ? emp.hourly_rate ? `¥${emp.hourly_rate.toLocaleString()}/h` : "-"
                    : emp.monthly_salary ? `¥${emp.monthly_salary.toLocaleString()}/月` : "-"
                  }
                </TableCell>
                <TableCell>
                  <Badge
                    variant={emp.is_active ? "default" : "secondary"}
                    className="cursor-pointer"
                    onClick={() => handleToggleActive(emp)}
                  >
                    {emp.is_active ? "有効" : "無効"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(emp)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(emp)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <EmployeeForm
        employee={editingEmployee}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </div>
  );
}

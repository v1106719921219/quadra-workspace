"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Employee {
  id: string;
  name: string;
  can_be_driver: boolean;
  is_spot: boolean;
}

interface JobSite {
  id: string;
  name: string;
  client_name: string | null;
}

interface AssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  jobSites: JobSite[];
  defaultDate: string;
  defaultJobSiteId: string;
  defaultEmployeeId?: string;
  onSubmitSingle: (params: {
    employee_id: string;
    job_site_id: string;
    assignment_date: string;
    is_driver: boolean;
    car_number: string | null;
    start_time: string | null;
  }) => Promise<void>;
  onSubmitBulk: (params: {
    employee_id: string;
    job_site_id: string;
    start_date: string;
    end_date: string;
    is_driver: boolean;
    car_number: string | null;
    start_time: string | null;
    skip_weekends: boolean;
  }) => Promise<void>;
}

export function AssignmentDialog({
  open,
  onOpenChange,
  employees,
  jobSites,
  defaultDate,
  defaultJobSiteId,
  defaultEmployeeId,
  onSubmitSingle,
  onSubmitBulk,
}: AssignmentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId || "");
  const [jobSiteId, setJobSiteId] = useState(defaultJobSiteId);
  const [isDriver, setIsDriver] = useState(false);
  const [carNumber, setCarNumber] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [date, setDate] = useState(defaultDate);
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [skipWeekends, setSkipWeekends] = useState(true);

  function reset() {
    setEmployeeId(defaultEmployeeId || "");
    setIsDriver(false);
    setCarNumber("");
    setStartTime("08:00");
  }

  async function handleSingle() {
    if (!employeeId || !jobSiteId) return;
    setLoading(true);
    try {
      await onSubmitSingle({
        employee_id: employeeId,
        job_site_id: jobSiteId,
        assignment_date: date,
        is_driver: isDriver,
        car_number: carNumber || null,
        start_time: startTime && startTime !== "08:00" ? startTime : null,
      });
      reset();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleBulk() {
    if (!employeeId || !jobSiteId) return;
    setLoading(true);
    try {
      await onSubmitBulk({
        employee_id: employeeId,
        job_site_id: jobSiteId,
        start_date: startDate,
        end_date: endDate,
        is_driver: isDriver,
        car_number: carNumber || null,
        start_time: startTime && startTime !== "08:00" ? startTime : null,
        skip_weekends: skipWeekends,
      });
      reset();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>配置追加</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="single">
          <TabsList className="w-full">
            <TabsTrigger value="single" className="flex-1">単日</TabsTrigger>
            <TabsTrigger value="bulk" className="flex-1">連続配置</TabsTrigger>
          </TabsList>

          {/* 共通フィールド */}
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>従業員</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}{e.is_spot ? " (スポット)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>現場</Label>
              <Select value={jobSiteId} onValueChange={setJobSiteId}>
                <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                <SelectContent>
                  {jobSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.client_name ? `${s.client_name} / ` : ""}{s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>出発時間</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">08:00が通常（省略時は非表示）</p>
              </div>
              <div className="space-y-2">
                <Label>車番</Label>
                <Input
                  type="text"
                  value={carNumber}
                  onChange={(e) => setCarNumber(e.target.value)}
                  placeholder="例: ③ / 1号"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_driver"
                checked={isDriver}
                onCheckedChange={(v) => setIsDriver(!!v)}
              />
              <Label htmlFor="is_driver">運転手</Label>
            </div>
          </div>

          <TabsContent value="single" className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>日付</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
              <Button onClick={handleSingle} disabled={loading || !employeeId || !jobSiteId}>
                {loading ? "追加中..." : "追加"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>開始日</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>終了日</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="skip_weekends"
                checked={skipWeekends}
                onCheckedChange={(v) => setSkipWeekends(!!v)}
              />
              <Label htmlFor="skip_weekends">土日を除く</Label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
              <Button onClick={handleBulk} disabled={loading || !employeeId || !jobSiteId}>
                {loading ? "追加中..." : "一括追加"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

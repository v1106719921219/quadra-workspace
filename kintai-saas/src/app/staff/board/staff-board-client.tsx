"use client";

import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getAssignments, getSiteDailyLabels } from "./actions";

interface JobSite {
  id: string;
  name: string;
  short_name: string | null;
  client_name: string | null;
  color: string;
}

interface Employee {
  id: string;
  name: string;
  can_be_driver: boolean;
  is_spot: boolean;
  board_char: string | null;
}

interface Assignment {
  id: string;
  employee_id: string;
  job_site_id: string;
  assignment_date: string;
  start_time: string | null;
  is_driver: boolean;
  car_number: string | null;
  note: string | null;
}

interface DailyLabel {
  job_site_id: string;
  label_date: string;
  site_name: string;
  car_number: string | null;
  departure_time: string | null;
}

const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

function getWeekDates(baseDate: Date, weeks = 1): string[] {
  const monday = new Date(baseDate);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  const dates: string[] = [];
  for (let i = 0; i < 7 * weeks; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    dates.push(d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }));
  }
  return dates;
}

function formatDepartureTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  if (h === "08" && m === "00") return null;
  return `${parseInt(h)}:${m}`;
}

function oneChar(emp: Employee): string {
  return emp.board_char || emp.name.slice(0, 1);
}

export function StaffBoardClient({
  initialJobSites,
  initialEmployees,
  initialAssignments,
  initialDailyLabels,
}: {
  initialJobSites: JobSite[];
  initialEmployees: Employee[];
  initialAssignments: Assignment[];
  initialDailyLabels: DailyLabel[];
}) {
  const [jobSites] = useState(initialJobSites);
  const [employees] = useState(initialEmployees);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [dailyLabels, setDailyLabels] = useState(initialDailyLabels);
  const [viewMode, setViewMode] = useState<"week" | "day">("day");
  const [baseDate, setBaseDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
  );

  const weekDates = useMemo(() => getWeekDates(baseDate, 1), [baseDate]);
  const displayDates = viewMode === "week" ? weekDates : [selectedDate];

  const activeSites = useMemo(() => {
    const activeIds = new Set(
      assignments
        .filter((a) => displayDates.includes(a.assignment_date))
        .map((a) => a.job_site_id)
    );
    return jobSites.filter((s) => activeIds.has(s.id));
  }, [jobSites, assignments, displayDates]);

  const employeeMap = useMemo(() => {
    const m = new Map<string, Employee>();
    employees.forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  const assignmentIndex = useMemo(() => {
    const idx = new Map<string, Assignment[]>();
    assignments.forEach((a) => {
      const key = `${a.job_site_id}__${a.assignment_date}`;
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key)!.push(a);
    });
    return idx;
  }, [assignments]);

  const labelIndex = useMemo(() => {
    const idx = new Map<string, DailyLabel>();
    dailyLabels.forEach((l) => idx.set(`${l.job_site_id}__${l.label_date}`, l));
    return idx;
  }, [dailyLabels]);

  const refreshAll = useCallback(async (start: string, end: string) => {
    const [asgn, lbls] = await Promise.all([
      getAssignments(start, end),
      getSiteDailyLabels(start, end),
    ]);
    setAssignments(asgn);
    setDailyLabels(lbls);
  }, []);

  function navigatePrev() {
    if (viewMode === "day") {
      const d = new Date(selectedDate + "T00:00:00+09:00");
      d.setDate(d.getDate() - 1);
      const nd = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
      setSelectedDate(nd);
      refreshAll(nd, nd);
    } else {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - 7);
      setBaseDate(d);
      const dates = getWeekDates(d, 1);
      refreshAll(dates[0], dates[dates.length - 1]);
    }
  }

  function navigateNext() {
    if (viewMode === "day") {
      const d = new Date(selectedDate + "T00:00:00+09:00");
      d.setDate(d.getDate() + 1);
      const nd = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
      setSelectedDate(nd);
      refreshAll(nd, nd);
    } else {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + 7);
      setBaseDate(d);
      const dates = getWeekDates(d, 1);
      refreshAll(dates[0], dates[dates.length - 1]);
    }
  }

  function handleViewModeChange(mode: string) {
    const m = mode as "week" | "day";
    setViewMode(m);
    const dates = m === "day" ? [selectedDate] : getWeekDates(baseDate, 1);
    refreshAll(dates[0], dates[dates.length - 1]);
  }

  const navLabel = useMemo(() => {
    if (viewMode === "day") {
      const d = new Date(selectedDate + "T00:00:00+09:00");
      return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_NAMES[d.getDay()]})`;
    }
    const s = weekDates[0].slice(5).replace("-", "/");
    const e = weekDates[weekDates.length - 1].slice(5).replace("-", "/");
    return `${s} 〜 ${e}`;
  }, [viewMode, weekDates, selectedDate]);

  return (
    <div className="flex flex-col h-full" style={{ userSelect: "none" }}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h1 className="text-lg font-bold">配置表</h1>
        <Tabs value={viewMode} onValueChange={handleViewModeChange}>
          <TabsList className="h-8">
            <TabsTrigger value="day" className="text-xs px-3">日</TabsTrigger>
            <TabsTrigger value="week" className="text-xs px-3">週</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={navigatePrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium text-sm min-w-[140px] text-center">{navLabel}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={navigateNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* ボード */}
      <div className="flex-1 overflow-auto rounded border bg-white shadow" style={{ WebkitOverflowScrolling: "touch" }}>
        <ReadOnlyBoard
          dates={displayDates}
          jobSites={activeSites}
          employeeMap={employeeMap}
          assignmentIndex={assignmentIndex}
          labelIndex={labelIndex}
        />
      </div>
    </div>
  );
}

function ReadOnlyBoard({
  dates,
  jobSites,
  employeeMap,
  assignmentIndex,
  labelIndex,
}: {
  dates: string[];
  jobSites: JobSite[];
  employeeMap: Map<string, Employee>;
  assignmentIndex: Map<string, Assignment[]>;
  labelIndex: Map<string, DailyLabel>;
}) {
  const CELL_W = dates.length === 1 ? 200 : 88;
  const LABEL_W = 100;

  return (
    <table className="border-collapse text-sm" style={{ minWidth: `${LABEL_W + dates.length * CELL_W}px` }}>
      <thead className="sticky top-0 z-30">
        <tr className="border-b">
          <th
            className="sticky left-0 z-40 bg-gray-100 border-r p-1 text-left"
            style={{ width: `${LABEL_W}px`, minWidth: `${LABEL_W}px` }}
          >
            <span className="text-[10px] text-gray-400">会社 / 現場</span>
          </th>
          {dates.map((dateStr) => {
            const d = new Date(dateStr + "T00:00:00+09:00");
            const di = d.getDay();
            const isSun = di === 0;
            const isSat = di === 6;
            const bg = isSun ? "bg-red-100" : isSat ? "bg-blue-50" : "bg-gray-100";
            return (
              <th
                key={dateStr}
                className={`border-r last:border-r-0 p-0 ${bg}`}
                style={{ width: `${CELL_W}px`, minWidth: `${CELL_W}px` }}
              >
                <div className="flex flex-col items-center py-1 gap-0">
                  <span className={`font-bold text-sm leading-tight ${isSun ? "text-red-600" : isSat ? "text-blue-600" : "text-gray-800"}`}>
                    {d.getDate()}
                  </span>
                  <span className={`text-[10px] leading-tight ${isSun ? "text-red-500" : isSat ? "text-blue-500" : "text-gray-400"}`}>
                    {WEEKDAY_NAMES[di]}
                  </span>
                </div>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {jobSites.map((site) => (
          <tr key={site.id} className="border-b">
            <td
              className="sticky left-0 z-10 bg-white border-r p-1.5 align-middle"
              style={{ minWidth: `${LABEL_W}px` }}
            >
              <div className="text-[12px] font-bold text-gray-800 leading-tight truncate">
                {site.client_name || site.name}
              </div>
              {site.client_name && (
                <div className="text-[10px] text-gray-400 leading-tight truncate">{site.name}</div>
              )}
            </td>
            {dates.map((dateStr) => {
              const d = new Date(dateStr + "T00:00:00+09:00");
              const di = d.getDay();
              const bg = di === 0 ? "bg-red-50/40" : di === 6 ? "bg-blue-50/20" : "";
              const key = `${site.id}__${dateStr}`;
              const cellAssignments = assignmentIndex.get(key) || [];
              const label = labelIndex.get(key);
              const customSiteName = label?.site_name?.trim() || null;
              const carNumber = label?.car_number;
              const departureTime = formatDepartureTime(label?.departure_time);

              return (
                <td
                  key={dateStr}
                  className={`border-r last:border-r-0 p-1 align-top ${bg}`}
                  style={{ minWidth: `${CELL_W}px`, height: "64px" }}
                >
                  {customSiteName && (
                    <div className="text-[11px] leading-tight truncate mb-0.5 text-blue-600 font-bold">
                      {customSiteName}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-0.5 min-h-[20px]">
                    {cellAssignments.map((a) => {
                      const emp = employeeMap.get(a.employee_id);
                      if (!emp) return null;
                      return (
                        <span
                          key={a.id}
                          className="inline-flex items-center justify-center bg-white border border-gray-400 rounded text-[12px] font-bold text-gray-800 shadow-sm leading-none"
                          style={{ minWidth: "20px", height: "20px", padding: "0 2px" }}
                          title={emp.name}
                        >
                          {oneChar(emp)}
                        </span>
                      );
                    })}
                  </div>
                  {(departureTime || carNumber) && (
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {departureTime && (
                        <span className="text-[10px] text-gray-600 font-bold">{departureTime}</span>
                      )}
                      {carNumber && (
                        <span
                          className="inline-flex items-center justify-center rounded-full bg-yellow-400 border-2 border-yellow-500 text-yellow-900 font-bold shadow-sm"
                          style={{ width: "18px", height: "18px", minWidth: "18px", fontSize: "10px" }}
                        >
                          {carNumber}
                        </span>
                      )}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
        {jobSites.length === 0 && (
          <tr>
            <td colSpan={dates.length + 1} className="text-center text-gray-400 py-8">
              この期間の配置データはありません
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

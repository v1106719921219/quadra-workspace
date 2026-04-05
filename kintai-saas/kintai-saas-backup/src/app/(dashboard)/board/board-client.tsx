"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Copy, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import {
  getAssignments,
  getSiteDailyLabels,
  createAssignment,
  deleteAssignment,
  copyPreviousDay,
  upsertSiteDailyLabel,
} from "./actions";

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

interface TenantSettings {
  closing_day: number;
  time_rounding_minutes: number;
}

// ボトムシートで選択中のセル情報
interface SelectedCell {
  date: string;
  siteId: string; // "" = スポット列
  siteName: string; // display name
  clientName: string | null;
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


function chunkByWeek(dates: string[]): string[][] {
  const result: string[][] = [];
  for (let i = 0; i < dates.length; i += 7) {
    result.push(dates.slice(i, i + 7));
  }
  return result;
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

export function BoardClient({
  initialJobSites,
  initialEmployees,
  initialAssignments,
  initialDailyLabels,
  initialSettings,
}: {
  initialJobSites: JobSite[];
  initialEmployees: Employee[];
  initialAssignments: Assignment[];
  initialDailyLabels: DailyLabel[];
  initialSettings: TenantSettings;
}) {
  const [jobSites] = useState(initialJobSites);
  const [employees] = useState(initialEmployees);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [dailyLabels, setDailyLabels] = useState(initialDailyLabels);
  const [viewMode, setViewMode] = useState<"week" | "2weeks" | "day">("week");
  const [baseDate, setBaseDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
  );

  // ボトムシート
  const [sheet, setSheet] = useState<SelectedCell | null>(null);
  const [pendingEmpIds, setPendingEmpIds] = useState<Set<string>>(new Set());
  // 現場追加ピッカー
  const [addSiteDate, setAddSiteDate] = useState<string | null>(null);
  // 閉じた現場（週移動でリセット）
  const [hiddenSiteIds, setHiddenSiteIds] = useState<Set<string>>(new Set());

  const weekDates = useMemo(() => getWeekDates(baseDate, 1), [baseDate]);
  const twoWeekDates = useMemo(() => getWeekDates(baseDate, 2), [baseDate]);
  const displayDates = viewMode === "week" ? weekDates : viewMode === "2weeks" ? twoWeekDates : [selectedDate];

  // 2週表示は7日ずつに分割して縦積み（横スクロール不要）
  const dateGroups = useMemo(() => {
    if (viewMode !== "2weeks") return [displayDates];
    return chunkByWeek(displayDates);
  }, [viewMode, displayDates]);

  // 表示期間内に配置がある現場のみ表示（閉じた現場は除外、登録順を維持）
  const activeSites = useMemo(() => {
    const activeIds = new Set(
      assignments
        .filter((a) => displayDates.includes(a.assignment_date))
        .map((a) => a.job_site_id)
    );
    return jobSites.filter((s) => activeIds.has(s.id) && !hiddenSiteIds.has(s.id));
  }, [jobSites, assignments, displayDates, hiddenSiteIds]);

  const employeeMap = useMemo(() => {
    const m = new Map<string, Employee>();
    employees.forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  // 配置インデックス: "siteId__date" → Assignment[]
  const assignmentIndex = useMemo(() => {
    const idx = new Map<string, Assignment[]>();
    assignments.forEach((a) => {
      const key = `${a.job_site_id}__${a.assignment_date}`;
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key)!.push(a);
    });
    return idx;
  }, [assignments]);

  // 日別ラベルインデックス: "siteId__date" → DailyLabel
  const labelIndex = useMemo(() => {
    const idx = new Map<string, DailyLabel>();
    dailyLabels.forEach((l) => idx.set(`${l.job_site_id}__${l.label_date}`, l));
    return idx;
  }, [dailyLabels]);

  function getDateRange() {
    if (viewMode === "day") return { start: selectedDate, end: selectedDate };
    const dates = viewMode === "week" ? weekDates : twoWeekDates;
    return { start: dates[0], end: dates[dates.length - 1] };
  }

  const refreshAll = useCallback(async (start: string, end: string) => {
    const [asgn, lbls] = await Promise.all([
      getAssignments(start, end),
      getSiteDailyLabels(start, end),
    ]);
    setAssignments(asgn);
    setDailyLabels(lbls);
  }, []);

  function navigatePrev() {
    setHiddenSiteIds(new Set());
    if (viewMode === "day") {
      const d = new Date(selectedDate + "T00:00:00+09:00");
      d.setDate(d.getDate() - 1);
      const nd = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
      setSelectedDate(nd);
      refreshAll(nd, nd);
    } else {
      const delta = viewMode === "2weeks" ? -14 : -7;
      const d = new Date(baseDate);
      d.setDate(d.getDate() + delta);
      setBaseDate(d);
      const dates = getWeekDates(d, viewMode === "2weeks" ? 2 : 1);
      refreshAll(dates[0], dates[dates.length - 1]);
    }
  }

  function navigateNext() {
    setHiddenSiteIds(new Set());
    if (viewMode === "day") {
      const d = new Date(selectedDate + "T00:00:00+09:00");
      d.setDate(d.getDate() + 1);
      const nd = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
      setSelectedDate(nd);
      refreshAll(nd, nd);
    } else {
      const delta = viewMode === "2weeks" ? 14 : 7;
      const d = new Date(baseDate);
      d.setDate(d.getDate() + delta);
      setBaseDate(d);
      const dates = getWeekDates(d, viewMode === "2weeks" ? 2 : 1);
      refreshAll(dates[0], dates[dates.length - 1]);
    }
  }

  function handleViewModeChange(mode: string) {
    const m = mode as "week" | "2weeks" | "day";
    setViewMode(m);
    setHiddenSiteIds(new Set());
    const dates = m === "day" ? [selectedDate] : getWeekDates(baseDate, m === "2weeks" ? 2 : 1);
    refreshAll(dates[0], dates[dates.length - 1]);
  }

  function openSheet(date: string, siteId: string, site: JobSite | null) {
    setSheet({
      date,
      siteId,
      siteName: site?.name ?? "スポット",
      clientName: site?.client_name ?? null,
    });
  }

  async function handleToggleEmployee(empId: string) {
    if (!sheet) return;
    const { date, siteId } = sheet;
    if (!siteId) return;
    // 処理中は無視（二重タップ防止）
    if (pendingEmpIds.has(empId)) return;

    const key = `${siteId}__${date}`;
    const existing = assignmentIndex.get(key) || [];
    // temp IDは実IDではないので削除対象から除外
    const found = existing.find((a) => a.employee_id === empId && !a.id.startsWith("temp_"));
    // tempが存在する = 追加中なのでスキップ
    const hasTempAdd = existing.some((a) => a.employee_id === empId && a.id.startsWith("temp_"));
    if (hasTempAdd) return;

    setPendingEmpIds((prev) => new Set(prev).add(empId));

    try {
      if (found) {
        // 楽観的削除 → サーバー削除のみ（再フェッチ不要）
        setAssignments((cur) => cur.filter((a) => a.id !== found.id));
        await deleteAssignment(found.id);
      } else {
        // 楽観的追加 → サーバー追加 → 仮IDを実IDに差し替え
        const tempId = `temp_${empId}_${Date.now()}`;
        const tempAssignment: Assignment = {
          id: tempId,
          employee_id: empId,
          job_site_id: siteId,
          assignment_date: date,
          start_time: null,
          is_driver: false,
          car_number: null,
          note: null,
        };
        setAssignments((cur) => [...cur, tempAssignment]);
        const { id: realId } = await createAssignment({
          employee_id: empId,
          job_site_id: siteId,
          assignment_date: date,
          is_driver: false,
          car_number: null,
          start_time: null,
        });
        // 仮IDを実IDに差し替え（再フェッチ不要）
        setAssignments((cur) =>
          cur.map((a) => a.id === tempId ? { ...a, id: realId } : a)
        );
      }
    } catch (e) {
      // エラー時のみサーバーから取り直し
      const { start, end } = getDateRange();
      const asgn = await getAssignments(start, end);
      setAssignments(asgn);
      toast.error(e instanceof Error ? e.message : "操作に失敗しました");
    } finally {
      setPendingEmpIds((prev) => { const s = new Set(prev); s.delete(empId); return s; });
    }
  }

  async function handleSheetLabelSave(siteId: string, date: string, fields: {
    site_name?: string;
    car_number?: string | null;
    departure_time?: string | null;
  }) {
    try {
      await upsertSiteDailyLabel(siteId, date, fields);
      const { start, end } = getDateRange();
      const lbls = await getSiteDailyLabels(start, end);
      setDailyLabels(lbls);
    } catch {
      toast.error("保存に失敗しました");
    }
  }

  async function handleCopyPrev(date: string) {
    try {
      const count = await copyPreviousDay(date);
      const { start, end } = getDateRange();
      await refreshAll(start, end);
      toast.success(`${count}件コピーしました`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "コピーに失敗しました");
    }
  }

  const navLabel = useMemo(() => {
    if (viewMode === "day") {
      const d = new Date(selectedDate + "T00:00:00+09:00");
      return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_NAMES[d.getDay()]})`;
    }
    const dates = viewMode === "week" ? weekDates : twoWeekDates;
    const s = dates[0].slice(5).replace("-", "/");
    const e = dates[dates.length - 1].slice(5).replace("-", "/");
    return `${s} 〜 ${e}`;
  }, [viewMode, weekDates, twoWeekDates, selectedDate]);

  // シートで選択中のセルの配置リスト
  const sheetAssignments = useMemo(() => {
    if (!sheet?.siteId) return [];
    return assignmentIndex.get(`${sheet.siteId}__${sheet.date}`) || [];
  }, [sheet, assignmentIndex]);

  const sheetAssignedEmpIds = useMemo(
    () => new Set(sheetAssignments.map((a) => a.employee_id)),
    [sheetAssignments]
  );

  const sheetLabel = useMemo(() => {
    if (!sheet?.siteId) return null;
    return labelIndex.get(`${sheet.siteId}__${sheet.date}`) ?? null;
  }, [sheet, labelIndex]);

  return (
    <div className="flex flex-col h-full" style={{ userSelect: "none" }}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h1 className="text-xl font-bold">配置表</h1>
        <Tabs value={viewMode} onValueChange={handleViewModeChange}>
          <TabsList className="h-8">
            <TabsTrigger value="day" className="text-xs px-3">日</TabsTrigger>
            <TabsTrigger value="week" className="text-xs px-3">週</TabsTrigger>
            <TabsTrigger value="2weeks" className="text-xs px-3">2週</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={navigatePrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium text-sm min-w-[160px] text-center">{navLabel}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={navigateNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {viewMode === "day" && (
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              refreshAll(e.target.value, e.target.value);
            }}
            className="border rounded px-2 py-1 text-sm"
          />
        )}
      </div>

      {/* メインボード（2週は週ごとに縦積み → 横スクロール不要） */}
      <div className="flex flex-col gap-2 overflow-y-auto flex-1">
        {dateGroups.map((weekDates, i) => (
          <div key={i} className="flex-shrink-0">
            {viewMode === "2weeks" && (
              <div className="px-1 py-0.5 text-xs font-bold text-gray-400">
                {weekDates[0].slice(5).replace("-", "/")}〜{weekDates[6].slice(5).replace("-", "/")}
              </div>
            )}
            <div
              className="overflow-x-auto rounded border bg-white shadow"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <WhiteBoard
                dates={weekDates}
                jobSites={activeSites}
                allJobSites={jobSites}
                employees={employees}
                employeeMap={employeeMap}
                assignmentIndex={assignmentIndex}
                labelIndex={labelIndex}
                onCellTap={openSheet}
                onCopyPrev={handleCopyPrev}
                onAddSite={(date) => setAddSiteDate(date)}
                onHideSite={(siteId) => setHiddenSiteIds((prev) => new Set(prev).add(siteId))}
              />
            </div>
          </div>
        ))}
      </div>

      {/* ボトムシート */}
      {sheet && (
        <BottomSheet
          cell={sheet}
          employees={employees}
          assignedEmpIds={sheetAssignedEmpIds}
          pendingEmpIds={pendingEmpIds}
          label={sheetLabel}
          onToggleEmployee={handleToggleEmployee}
          onSaveLabel={handleSheetLabelSave}
          onClose={() => setSheet(null)}
        />
      )}

      {/* 現場追加ピッカー */}
      {addSiteDate && (
        <SitePicker
          date={addSiteDate}
          jobSites={jobSites}
          assignmentIndex={assignmentIndex}
          onSelect={(site) => {
            setAddSiteDate(null);
            openSheet(addSiteDate, site.id, site);
          }}
          onClose={() => setAddSiteDate(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// メインホワイトボード（横=日付列、縦=現場行）
// ============================================================
function WhiteBoard({
  dates,
  jobSites,
  allJobSites,
  employees,
  employeeMap,
  assignmentIndex,
  labelIndex,
  onCellTap,
  onCopyPrev,
  onAddSite,
  onHideSite,
}: {
  dates: string[];
  jobSites: JobSite[];
  allJobSites: JobSite[];
  employees: Employee[];
  employeeMap: Map<string, Employee>;
  assignmentIndex: Map<string, Assignment[]>;
  labelIndex: Map<string, DailyLabel>;
  onCellTap: (date: string, siteId: string, site: JobSite | null) => void;
  onCopyPrev: (date: string) => void;
  onAddSite: (date: string) => void;
  onHideSite: (siteId: string) => void;
}) {
  const spotEmployees = employees.filter((e) => e.is_spot);
  const CELL_W = dates.length > 7 ? 72 : 88;
  const LABEL_W = 100;

  return (
    <table className="border-collapse text-sm" style={{ minWidth: `${LABEL_W + dates.length * CELL_W}px` }}>
      <thead>
        <tr className="border-b">
          {/* 左ヘッダー */}
          <th
            className="sticky left-0 z-20 bg-gray-100 border-r p-1 text-left"
            style={{ width: `${LABEL_W}px`, minWidth: `${LABEL_W}px` }}
          >
            <span className="text-[10px] text-gray-400">会社 / 現場</span>
          </th>
          {/* 日付ヘッダー */}
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
                  <button
                    title="前日コピー"
                    onClick={() => onCopyPrev(dateStr)}
                    className="text-gray-300 hover:text-gray-500 active:text-gray-700 mt-0.5"
                  >
                    <Copy className="h-2.5 w-2.5" />
                  </button>
                </div>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {/* 先（外部スタッフ）行（先頭） */}
        {spotEmployees.length > 0 && (
          <tr className="border-b border-dashed border-orange-200">
            <td
              className="sticky left-0 z-10 bg-orange-50 border-r p-1.5 align-middle"
              style={{ minWidth: `${LABEL_W}px` }}
            >
              <span className="text-[13px] font-bold text-orange-500">先</span>
            </td>
            {dates.map((dateStr) => {
              const d = new Date(dateStr + "T00:00:00+09:00");
              const di = d.getDay();
              const bg = di === 0 ? "bg-red-50/40" : di === 6 ? "bg-blue-50/20" : "bg-orange-50/20";
              return (
                <td
                  key={dateStr}
                  className={`border-r last:border-r-0 p-1 align-top ${bg}`}
                  style={{ minHeight: "32px" }}
                >
                  <div className="flex flex-wrap gap-0.5">
                    {spotEmployees.map((emp) => {
                      const assigned = jobSites.some((s) =>
                        (assignmentIndex.get(`${s.id}__${dateStr}`) || []).some(
                          (a) => a.employee_id === emp.id
                        )
                      );
                      return (
                        <button
                          key={emp.id}
                          onClick={() => onCellTap(dateStr, spotEmployees[0]?.id ? "" : "", null)}
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold border transition-colors ${
                            assigned
                              ? "bg-gray-100 border-gray-300 text-gray-400"
                              : "bg-orange-100 border-orange-400 text-orange-900 active:bg-orange-200"
                          }`}
                          title={emp.name}
                        >
                          {oneChar(emp)}
                        </button>
                      );
                    })}
                  </div>
                </td>
              );
            })}
          </tr>
        )}

        {/* 現場追加行 */}
        <tr className="border-b bg-gray-50/50">
          <td
            className="sticky left-0 z-10 bg-gray-50 border-r p-1.5 align-middle"
            style={{ minWidth: `${LABEL_W}px` }}
          >
            <span className="text-[10px] text-gray-400">＋ 現場を追加</span>
          </td>
          {dates.map((dateStr) => (
            <td key={dateStr} className="border-r last:border-r-0 p-1 align-middle text-center">
              <button
                onClick={() => onAddSite(dateStr)}
                className="inline-flex items-center justify-center rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 active:bg-blue-50 transition-colors font-bold"
                style={{ width: "28px", height: "28px", fontSize: "18px", lineHeight: 1 }}
                title={`${dateStr}に現場を追加`}
              >
                +
              </button>
            </td>
          ))}
        </tr>

        {/* 現場行 */}
        {jobSites.map((site) => (
          <tr key={site.id} className="border-b hover:bg-gray-50/30">
            {/* 会社名（左固定） */}
            <td
              className="sticky left-0 z-10 bg-white border-r p-1.5 align-middle"
              style={{ minWidth: `${LABEL_W}px` }}
            >
              <div className="flex items-start gap-0.5">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-bold text-gray-800 leading-tight truncate">
                    {site.client_name || site.name}
                  </div>
                  {site.client_name && (
                    <div className="text-[10px] text-gray-400 leading-tight truncate">{site.name}</div>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onHideSite(site.id); }}
                  className="flex-shrink-0 p-0.5 rounded hover:bg-gray-100 active:bg-gray-200 text-gray-300 hover:text-gray-500"
                  title="この現場を閉じる"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </td>

            {/* 日付セル */}
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
                  className={`border-r last:border-r-0 p-1 align-top cursor-pointer active:bg-blue-50/40 transition-colors ${bg}`}
                  style={{ minWidth: `${CELL_W}px`, height: "64px" }}
                  onClick={() => onCellTap(dateStr, site.id, site)}
                >
                  {/* 現場名（入力あり=青字、なし=薄グレー） */}
                  <div className={`text-[11px] leading-tight truncate mb-0.5 ${
                    customSiteName
                      ? "text-blue-600 font-bold"
                      : "text-gray-300 font-normal"
                  }`}>
                    {customSiteName || "現場"}
                  </div>

                  {/* 従業員チップ */}
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

                  {/* 出発時間 + 車番 */}
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
      </tbody>
    </table>
  );
}

// ============================================================
// ボトムシート（iPad用ワンタッチ配置）
// ============================================================
function BottomSheet({
  cell,
  employees,
  assignedEmpIds,
  pendingEmpIds,
  label,
  onToggleEmployee,
  onSaveLabel,
  onClose,
}: {
  cell: SelectedCell;
  employees: Employee[];
  assignedEmpIds: Set<string>;
  pendingEmpIds: Set<string>;
  label: DailyLabel | null;
  onToggleEmployee: (empId: string) => Promise<void>;
  onSaveLabel: (siteId: string, date: string, fields: {
    site_name?: string;
    car_number?: string | null;
    departure_time?: string | null;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [siteName, setSiteName] = useState(label?.site_name ?? "");
  const [carNumber, setCarNumber] = useState(label?.car_number ?? "");
  const [departureTime, setDepartureTime] = useState(
    label?.departure_time ? label.departure_time.slice(0, 5) : "08:00"
  );
  const [saving, setSaving] = useState(false);

  // labelが変わったら初期値を更新
  useEffect(() => {
    setSiteName(label?.site_name ?? "");
    setCarNumber(label?.car_number ?? "");
    setDepartureTime(label?.departure_time ? label.departure_time.slice(0, 5) : "08:00");
  }, [label]);

  const d = new Date(cell.date + "T00:00:00+09:00");
  const dateLabel = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_NAMES[d.getDay()]})`;

  const spotEmployees = employees.filter((e) => e.is_spot);
  const regularEmployees = employees.filter((e) => !e.is_spot);

  async function handleSaveLabel() {
    if (!cell.siteId) return;
    setSaving(true);
    try {
      await onSaveLabel(cell.siteId, cell.date, {
        site_name: siteName,
        car_number: carNumber || null,
        departure_time: departureTime && departureTime !== "08:00" ? departureTime : null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* 背景オーバーレイ */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      {/* シート本体 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl"
        style={{ maxHeight: "80vh", overflowY: "auto" }}
      >
        {/* ハンドル */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 pb-2 border-b">
          <div>
            <span className="text-xs text-gray-400 mr-2">{dateLabel}</span>
            {cell.clientName && (
              <span className="text-sm font-bold text-gray-800">{cell.clientName}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {cell.siteId ? (
          <>
            {/* 現場入力フィールド */}
            <div className="px-4 pt-3 pb-2 grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="text-xs text-gray-400 block mb-1">現場名</label>
                <input
                  type="text"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  onBlur={handleSaveLabel}
                  placeholder={cell.siteName}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-blue-600 font-bold focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div className="col-span-1">
                <label className="text-xs text-gray-400 block mb-1">車番</label>
                <div className="flex flex-wrap gap-1">
                  {["1","2","3","4","5","6","7"].map((n) => (
                    <button
                      key={n}
                      onClick={async () => {
                        const next = carNumber === n ? "" : n;
                        setCarNumber(next);
                        await onSaveLabel(cell.siteId, cell.date, {
                          site_name: siteName,
                          car_number: next || null,
                          departure_time: departureTime && departureTime !== "08:00" ? departureTime : null,
                        });
                      }}
                      className={`inline-flex items-center justify-center rounded-full border-2 font-bold text-sm transition-colors active:scale-95 ${
                        carNumber === n
                          ? "bg-yellow-400 border-yellow-500 text-yellow-900"
                          : "bg-white border-gray-300 text-gray-600"
                      }`}
                      style={{ width: "36px", height: "36px" }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-1">
                <label className="text-xs text-gray-400 block mb-1">出発時間</label>
                <input
                  type="time"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  onBlur={handleSaveLabel}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
            </div>

            {/* 従業員ピッカー */}
            <div className="px-4 pb-4">
              <div className="text-xs text-gray-400 mb-2">従業員（タップで配置切替）</div>
              {spotEmployees.length > 0 && (
                <>
                  <div className="text-[10px] text-orange-400 font-bold mb-1">スポット</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {spotEmployees.map((emp) => {
                      const assigned = assignedEmpIds.has(emp.id);
                      const pending = pendingEmpIds.has(emp.id);
                      return (
                        <button
                          key={emp.id}
                          onClick={() => onToggleEmployee(emp.id)}
                          disabled={pending}
                          className={`relative flex flex-col items-center justify-center rounded-xl transition-all ${
                            pending
                              ? "opacity-50 cursor-not-allowed"
                              : "active:scale-95"
                          } ${
                            assigned
                              ? "bg-blue-500 border-2 border-blue-600 text-white shadow-md"
                              : "bg-orange-50 border-2 border-orange-300 text-orange-800"
                          }`}
                          style={{ width: "56px", height: "56px" }}
                        >
                          <span className="text-xl font-bold leading-none">{oneChar(emp)}</span>
                          <span className="text-[9px] leading-none mt-0.5 opacity-70 truncate w-full text-center px-1">
                            {emp.name.slice(0, 3)}
                          </span>
                          {assigned && !pending && (
                            <span className="absolute top-0.5 right-0.5">
                              <Check className="h-3 w-3 text-white" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="text-[10px] text-gray-400 font-bold mb-1">正社員・パート</div>
              <div className="flex flex-wrap gap-2">
                {regularEmployees.map((emp) => {
                  const assigned = assignedEmpIds.has(emp.id);
                  const pending = pendingEmpIds.has(emp.id);
                  return (
                    <button
                      key={emp.id}
                      onClick={() => onToggleEmployee(emp.id)}
                      disabled={pending}
                      className={`relative flex flex-col items-center justify-center rounded-xl transition-all ${
                        pending
                          ? "opacity-50 cursor-not-allowed"
                          : "active:scale-95"
                      } ${
                        assigned
                          ? "bg-blue-500 border-2 border-blue-600 text-white shadow-md"
                          : "bg-gray-50 border-2 border-gray-300 text-gray-700"
                      }`}
                      style={{ width: "56px", height: "56px" }}
                    >
                      <span className="text-xl font-bold leading-none">{oneChar(emp)}</span>
                      <span className="text-[9px] leading-none mt-0.5 opacity-70 truncate w-full text-center px-1">
                        {emp.name.slice(0, 3)}
                      </span>
                      {assigned && !pending && (
                        <span className="absolute top-0.5 right-0.5">
                          <Check className="h-3 w-3 text-white" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          /* スポット列をタップした場合 */
          <div className="px-4 py-4">
            <p className="text-sm text-gray-500">スポット配置は各現場セルをタップして割り当ててください。</p>
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================
// 現場追加ピッカー（日付を指定して現場を選ぶ）
// ============================================================
function SitePicker({
  date,
  jobSites,
  assignmentIndex,
  onSelect,
  onClose,
}: {
  date: string;
  jobSites: JobSite[];
  assignmentIndex: Map<string, Assignment[]>;
  onSelect: (site: JobSite) => void;
  onClose: () => void;
}) {
  const d = new Date(date + "T00:00:00+09:00");
  const dateLabel = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_NAMES[d.getDay()]})`;

  // この日すでに配置がある現場
  const activeSiteIds = new Set(
    jobSites
      .filter((s) => (assignmentIndex.get(`${s.id}__${date}`) || []).length > 0)
      .map((s) => s.id)
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl"
        style={{ maxHeight: "70vh", overflowY: "auto" }}
      >
        {/* ハンドル */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 pb-2 border-b">
          <div>
            <span className="text-xs text-gray-400 mr-2">{dateLabel}</span>
            <span className="text-sm font-bold text-gray-800">現場を選択</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* 現場一覧 */}
        <div className="px-4 py-3 grid grid-cols-2 gap-2">
          {jobSites.map((site) => {
            const isActive = activeSiteIds.has(site.id);
            return (
              <button
                key={site.id}
                onClick={() => onSelect(site)}
                className={`text-left p-3 rounded-xl border-2 transition-all active:scale-95 ${
                  isActive
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-gray-300 active:bg-gray-50"
                }`}
              >
                <div className="text-sm font-bold text-gray-800 leading-tight truncate">
                  {site.client_name || site.name}
                </div>
                {site.client_name && (
                  <div className="text-xs text-gray-400 leading-tight truncate">{site.name}</div>
                )}
                {isActive && (
                  <div className="text-xs text-blue-500 mt-0.5 font-medium">配置済み</div>
                )}
              </button>
            );
          })}
          {jobSites.length === 0 && (
            <p className="col-span-2 text-center text-gray-400 text-sm py-8">
              現場が登録されていません
            </p>
          )}
        </div>
      </div>
    </>
  );
}

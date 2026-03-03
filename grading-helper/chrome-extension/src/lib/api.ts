export interface Submission {
  id: string;
  title: string;
  status: string;
  grading_company_id: string;
  created_at: string;
  item_count: number;
}

export interface SubmissionItem {
  id: string;
  sort_order: number;
  set_code: string;
  card_number: string;
  name_ja: string | null;
  grading_name: string;
  declared_value: number | null;
  notes: string | null;
}

interface Settings {
  serverUrl: string;
  apiKey: string;
}

async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["serverUrl", "apiKey"], (result: Record<string, string>) => {
      resolve({
        serverUrl: result.serverUrl || "",
        apiKey: result.apiKey || "",
      });
    });
  });
}

async function apiFetch<T>(path: string): Promise<T> {
  const { serverUrl, apiKey } = await getSettings();

  if (!serverUrl || !apiKey) {
    throw new Error("サーバーURLとAPIキーを設定してください（オプション画面）");
  }

  const url = `${serverUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API Error: ${res.status}`);
  }

  return res.json();
}

export async function fetchSubmissions(): Promise<Submission[]> {
  const data = await apiFetch<{ submissions: Submission[] }>("/api/v1/submissions");
  return data.submissions;
}

export async function fetchSubmissionItems(submissionId: string): Promise<SubmissionItem[]> {
  const data = await apiFetch<{ items: SubmissionItem[] }>(
    `/api/v1/submissions/${submissionId}/items`
  );
  return data.items;
}

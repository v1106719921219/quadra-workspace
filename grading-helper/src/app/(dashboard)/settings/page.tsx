import { getGradingCompanies } from "@/actions/cards";
import { getApiKeys } from "@/actions/api-keys";
import { SettingsContent } from "./settings-content";

export default async function SettingsPage() {
  const [companies, apiKeys] = await Promise.all([
    getGradingCompanies(),
    getApiKeys(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">設定</h1>
      <SettingsContent companies={companies} apiKeys={apiKeys} />
    </div>
  );
}

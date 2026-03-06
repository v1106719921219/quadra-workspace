import { getTenantSettings, getOrganizationMembers } from "./actions";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [settings, members] = await Promise.all([
    getTenantSettings(),
    getOrganizationMembers(),
  ]);

  return (
    <SettingsClient
      settings={settings}
      members={members as never[]}
    />
  );
}

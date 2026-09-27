import { AdminShell } from "../AdminShell";
import { PiPowerPanel } from "@/app/components/infra/PiPowerPanel";
import { DgxSparkPowerPanel } from "@/app/components/infra/DgxSparkPowerPanel";

export default function InfrastructurePage() {
  return (
    <AdminShell title="Infrastructure" hint="Live power readings and DGX Spark power controls." active="infra">
      <PiPowerPanel />
      <DgxSparkPowerPanel />
    </AdminShell>
  );
}

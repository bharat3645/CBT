import { Construction } from "lucide-react";
import { Card } from "@cbt/ui";

/**
 * Route stub. The owning feature agent replaces the page body with its component from
 * `@/features/<feature>`; this placeholder just marks the mount point.
 */
export function FeatureStub({ title, feature, note }: { title: string; feature: string; note?: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <Card className="flex flex-col items-center gap-2 border-dashed p-10 text-center">
        <Construction className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">Mounts apps/web/src/features/{feature}</p>
        <p className="max-w-md text-xs text-muted-foreground">{note ?? "Not built yet. Replace this stub page with the feature component."}</p>
      </Card>
    </div>
  );
}

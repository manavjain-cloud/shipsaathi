import { Suspense } from "react";
import { Page, Spinner } from "@/components/ui";
import { ReportClient } from "./report-client";

export default function ReportPage() {
  return (
    <Page>
      <Suspense fallback={<div className="flex items-center gap-2 text-ink-3"><Spinner /> Loading report…</div>}>
        <ReportClient />
      </Suspense>
    </Page>
  );
}

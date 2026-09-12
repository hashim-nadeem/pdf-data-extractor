"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/lib/csv";

function save(name: string, mime: string, body: string) {
  // The BOM is what makes Excel read UTF-8; without it £ and accents mangle.
  const bom = mime.startsWith("text/csv") ? "﻿" : "";
  const url = URL.createObjectURL(new Blob([bom + body], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  // Safari needs the anchor in the document, and revoking synchronously can
  // cancel the download before it starts.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ExportBar({ data, name }: { data: unknown; name: string }) {
  const [notice, setNotice] = useState("");
  const copied = notice.startsWith("JSON copied");

  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur">
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            // Rejects on an insecure origin or a denied permission — say so
            // rather than appearing to succeed.
            await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            setNotice("JSON copied to the clipboard");
          } catch {
            setNotice("Could not copy — download the JSON instead");
          }
          setTimeout(() => setNotice(""), 2600);
        }}
      >
        {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
        Copy JSON
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => save(`${name}.json`, "application/json", JSON.stringify(data, null, 2))}
      >
        <Download aria-hidden="true" className="size-3.5" />
        Download JSON
      </Button>
      <Button variant="outline" size="sm" onClick={() => save(`${name}.csv`, "text/csv", toCsv(data))}>
        <Download aria-hidden="true" className="size-3.5" />
        Download CSV
      </Button>
      <p role="status" className="text-[13px] text-text-muted">
        {notice}
      </p>
    </div>
  );
}

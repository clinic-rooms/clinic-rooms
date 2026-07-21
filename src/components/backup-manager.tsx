"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Database, Download, Upload } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { downloadBackup, restoreBackup } from "@/actions/admin-backup";

export function BackupManager() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function doDownload() {
    startTransition(async () => {
      const res = await downloadBackup();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      const blob = new Blob([res.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("הגיבוי הורד");
    });
  }

  const [fileName, setFileName] = useState("");

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      if (
        !confirm(
          "שחזור גיבוי ימחק את כל הנתונים הנוכחיים ויחליף אותם בתוכן הקובץ.\n\n" +
            "פעולה בלתי הפיכה! מומלץ להוריד קודם גיבוי עדכני.\n" +
            "ייתכן שתצטרך/י להתחבר מחדש בסיום.\n\nלהמשיך?"
        )
      ) {
        if (fileRef.current) fileRef.current.value = "";
        setFileName("");
        return;
      }
      startTransition(async () => {
        const res = await restoreBackup(content);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("השחזור הושלם בהצלחה");
        if (fileRef.current) fileRef.current.value = "";
        setFileName("");
        router.refresh();
      });
    };
    reader.readAsText(file);
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Database size={16} className="text-primary" />
        <h2 className="font-bold">גיבוי ושחזור</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        הנתונים מגובים אוטומטית כל לילה. כאן אפשר להוריד גיבוי ידני בכל רגע, או לשחזר מקובץ גיבוי בשעת חירום.
      </p>

      <Button variant="outline" onClick={doDownload} disabled={pending}>
        <Download size={16} />
        הורדת גיבוי עכשיו
      </Button>

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
        <p className="mb-2 text-sm font-medium">שחזור מגיבוי</p>
        <p className="mb-2 text-xs text-muted-foreground">
          שחזור מוחק את כל הנתונים הנוכחיים ומחליף אותם בתוכן הקובץ. השתמשו רק בשעת חירום.
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
        <Button variant="destructive" onClick={() => fileRef.current?.click()} disabled={pending}>
          <Upload size={16} />
          בחירת קובץ גיבוי לשחזור
        </Button>
        {fileName && <p className="mt-1 text-xs text-muted-foreground">{fileName}</p>}
      </div>
    </Card>
  );
}

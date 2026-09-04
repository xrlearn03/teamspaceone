import { Download, FileText } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useFile } from "../../hooks/api";
import { Button } from "./button";

export function MessageAttachment({ fileId }: { fileId: string }) {
  const { data: file, isLoading, error } = useFile(fileId);

  return (
    <div className="mt-2 flex min-w-48 items-center gap-2 rounded-md border border-current/20 p-2">
      <FileText className="h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{isLoading ? "Loading attachment…" : file?.originalName ?? "Unavailable attachment"}</p>
        {file ? <p className="text-[10px] opacity-70">{Math.max(1, Math.round(file.size / 1024))} KB</p> : null}
        {error ? <p className="text-[10px] text-error">Unable to load file</p> : null}
      </div>
      <Button
        variant="ghost"
        size="icon"
        disabled={!file?.downloadUrl}
        onClick={() => { if (file?.downloadUrl) void openUrl(file.downloadUrl); }}
        aria-label={`Download ${file?.originalName ?? "attachment"}`}
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

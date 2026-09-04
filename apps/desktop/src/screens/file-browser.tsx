import { useRef, useState } from "react";
import {
  FileText,
  Grid,
  List,
  Search,
  Download,
  Trash2,
  Upload,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useDeleteFile, useFiles, useUploadFile } from "../hooks/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { cn } from "../lib/utils";

const filters = ["All", "PDF", "Images", "Design", "Docs", "Archives"];

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return d.toLocaleDateString();
}

function matchesFilter(file: { originalName: string; mimeType: string }, filter: string) {
  if (filter === "All") return true;
  const name = file.originalName.toLowerCase();
  const mime = file.mimeType.toLowerCase();
  switch (filter) {
    case "PDF":
      return mime.includes("pdf");
    case "Images":
      return mime.startsWith("image/");
    case "Design":
      return name.endsWith(".fig") || name.endsWith(".sketch") || mime.includes("x-figma");
    case "Docs":
      return (
        mime.includes("text") ||
        name.endsWith(".md") ||
        name.endsWith(".doc") ||
        name.endsWith(".docx") ||
        mime.includes("word")
      );
    case "Archives":
      return name.endsWith(".zip") || mime.includes("zip") || mime.includes("archive");
    default:
      return true;
  }
}

export function FileBrowserScreen() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [activeFilter, setActiveFilter] = useState("All");
  const [query, setQuery] = useState("");
  const { data: files, isLoading } = useFiles();
  const uploadFile = useUploadFile();
  const deleteFile = useDeleteFile();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = (files ?? []).filter((file) =>
    matchesFilter(file, activeFilter) && file.originalName.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFile.mutate(file);
    e.target.value = "";
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-text">Files</h1>
          <Badge variant="secondary">{filtered.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input placeholder="Search files" value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 w-56 pl-8 text-sm" />
          </div>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("grid")}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
          />
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploadFile.isPending}>
            <Upload className="mr-1.5 h-4 w-4" />
            Upload
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-2 border-b px-6 py-2">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setActiveFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              activeFilter === f
                ? "bg-primary-subtle text-primary"
                : "text-text-secondary hover:bg-surface-elevated",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-text-muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="No files" description="Upload a file to get started." />
        ) : viewMode === "list" ? (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-surface-elevated text-left text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Size</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Updated</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-surface-elevated/50">
                    <td className="flex items-center gap-2 px-4 py-3">
                      <FileText className="h-4 w-4 text-text-muted" />
                      <span className="text-text">{f.originalName}</span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatBytes(f.size)}</td>
                    <td className="px-4 py-3 text-text-secondary capitalize">{f.status}</td>
                    <td className="px-4 py-3 text-text-secondary">{formatRelative(f.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" disabled={!f.downloadUrl && !f.url} onClick={() => { const url = f.downloadUrl ?? f.url; if (url) void openUrl(url); }} aria-label={`Download ${f.originalName}`}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-error" disabled={deleteFile.isPending} onClick={() => deleteFile.mutate(f.id)} aria-label={`Delete ${f.originalName}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {filtered.map((f) => (
              <div
                key={f.id}
                className="flex flex-col gap-2 rounded-lg border bg-surface p-4 hover:border-primary/30"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-elevated text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <p className="truncate text-sm font-medium text-text">{f.originalName}</p>
                <p className="text-xs text-text-muted">{formatBytes(f.size)} · {f.status}</p>
                <div className="mt-auto flex gap-1">
                  <Button variant="ghost" size="sm" disabled={!f.downloadUrl && !f.url} onClick={() => { const url = f.downloadUrl ?? f.url; if (url) void openUrl(url); }}><Download className="mr-1 h-3.5 w-3.5" />Download</Button>
                  <Button variant="ghost" size="icon" className="text-error" onClick={() => deleteFile.mutate(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

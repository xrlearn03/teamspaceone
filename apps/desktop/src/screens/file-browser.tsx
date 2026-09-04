import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Grid,
  List,
  Search,
  Download,
  ExternalLink,
  Link,
  Trash2,
  Upload,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { FileRecord } from "../lib/api";
import { downloadFile, fetchFilePreview } from "../lib/api";
import { useCreateExternalShare, useDeleteFile, useFiles, useUploadFile } from "../hooks/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
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

function isImage(file: { mimeType: string }) {
  return file.mimeType.startsWith("image/");
}

function isVideo(file: { mimeType: string }) {
  return file.mimeType.startsWith("video/");
}

function getFileUrl(file: FileRecord) {
  return file.url ?? file.downloadUrl ?? null;
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

function useObjectUrl(load: (() => Promise<Blob>) | null, enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !load) {
      setUrl(null);
      setError(null);
      setLoading(false);
      return;
    }
    let objectUrl: string | null = null;
    let active = true;
    setLoading(true);
    setError(null);

    load()
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Failed to load file"); })
      .finally(() => { if (active) setLoading(false); });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enabled, load]);

  return { url, loading, error };
}

function FileThumbnail({ file, className, fallbackClassName }: { file: FileRecord; className?: string; fallbackClassName?: string }) {
  const load = useCallback(async () => {
    try {
      return await fetchFilePreview(file.id, "thumbnail");
    } catch {
      return downloadFile(file.id);
    }
  }, [file.id]);
  const { url, loading } = useObjectUrl(load, isImage(file));

  if (loading) {
    return <div className={cn("animate-pulse rounded bg-surface-elevated", className)} />;
  }

  if (url) {
    return <img src={url} alt={file.originalName} className={cn("rounded object-cover", className)} />;
  }

  return <FileText className={cn("text-text-muted", fallbackClassName ?? className)} />;
}

function FilePreview({ file }: { file: FileRecord }) {
  const loadImage = useCallback(async () => {
    try {
      return await fetchFilePreview(file.id, "preview");
    } catch {
      return downloadFile(file.id);
    }
  }, [file.id]);
  const { url: imageUrl, loading: imageLoading, error: imageError } = useObjectUrl(loadImage, isImage(file));

  const loadVideo = useCallback(() => downloadFile(file.id), [file.id]);
  const { url: videoUrl, loading: videoLoading, error: videoError } = useObjectUrl(loadVideo, isVideo(file));

  return (
    <div className="flex min-h-[16rem] items-center justify-center p-4 pt-0">
      {isImage(file) ? (
        imageLoading ? (
          <div className="h-32 w-32 animate-pulse rounded bg-surface-elevated" />
        ) : imageUrl ? (
          <img src={imageUrl} alt={file.originalName} className="max-h-[70vh] max-w-full rounded-md object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center text-error">
            <FileText className="h-16 w-16 text-text-muted" />
            <p className="text-sm">{imageError ?? "Unable to load image"}</p>
          </div>
        )
      ) : isVideo(file) ? (
        videoLoading ? (
          <div className="h-32 w-32 animate-pulse rounded bg-surface-elevated" />
        ) : videoUrl ? (
          <video src={videoUrl} controls className="max-h-[70vh] max-w-full rounded-md" />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center text-error">
            <FileText className="h-16 w-16 text-text-muted" />
            <p className="text-sm">{videoError ?? "Unable to load video"}</p>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <FileText className="h-16 w-16 text-text-muted" />
          <div>
            <p className="font-medium text-text">{file.originalName}</p>
            <p className="text-sm text-text-muted">{formatBytes(file.size)} · {file.mimeType}</p>
          </div>
          <Button disabled={!getFileUrl(file)} onClick={() => { const url = getFileUrl(file); if (url) void openUrl(url); }}>
            <ExternalLink className="mr-1.5 h-4 w-4" /> Open file
          </Button>
        </div>
      )}
    </div>
  );
}

export function FileBrowserScreen() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [activeFilter, setActiveFilter] = useState("All");
  const [query, setQuery] = useState("");
  const { data: files, isLoading } = useFiles();
  const uploadFile = useUploadFile();
  const deleteFile = useDeleteFile();
  const createShare = useCreateExternalShare();
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = (files ?? []).filter((file) =>
    matchesFilter(file, activeFilter) && file.originalName.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function share(fileId: string) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    createShare.mutate({ fileId, expiresAt }, { onSuccess: (result) => setShareToken(result.token) });
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFile.mutate(file, {
      onSuccess: (record) => {
        if (isImage(record) || isVideo(record)) {
          setPreviewFile(record);
        }
      },
    });
    e.target.value = "";
  }

  return (
    <>
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
                  <tr key={f.id} className="cursor-pointer border-b last:border-0 hover:bg-surface-elevated/50" onClick={() => setPreviewFile(f)}>
                    <td className="flex items-center gap-3 px-4 py-3">
                      <FileThumbnail file={f} className="h-8 w-8 shrink-0" />
                      <span className="text-text">{f.originalName}</span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatBytes(f.size)}</td>
                    <td className="px-4 py-3 text-text-secondary capitalize">{f.status}</td>
                    <td className="px-4 py-3 text-text-secondary">{formatRelative(f.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" disabled={!f.downloadUrl && !f.url} onClick={(e) => { e.stopPropagation(); const url = f.downloadUrl ?? f.url; if (url) void openUrl(url); }} aria-label={`Download ${f.originalName}`}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" disabled={createShare.isPending} onClick={(e) => { e.stopPropagation(); share(f.id); }} aria-label={`Share ${f.originalName}`}><Link className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-error" disabled={deleteFile.isPending} onClick={(e) => { e.stopPropagation(); deleteFile.mutate(f.id); }} aria-label={`Delete ${f.originalName}`}>
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
                className="cursor-pointer flex flex-col gap-2 rounded-lg border bg-surface p-4 hover:border-primary/30"
                onClick={() => setPreviewFile(f)}
              >
                <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-md bg-surface-elevated text-primary">
                  <FileThumbnail file={f} className="h-full w-full" fallbackClassName="h-10 w-10" />
                </div>
                <p className="truncate text-sm font-medium text-text">{f.originalName}</p>
                <p className="text-xs text-text-muted">{formatBytes(f.size)} · {f.status}</p>
                <div className="mt-auto flex gap-1">
                  <Button variant="ghost" size="sm" disabled={!f.downloadUrl && !f.url} onClick={(e) => { e.stopPropagation(); const url = f.downloadUrl ?? f.url; if (url) void openUrl(url); }}><Download className="mr-1 h-3.5 w-3.5" />Download</Button>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); share(f.id); }}><Link className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="text-error" onClick={(e) => { e.stopPropagation(); deleteFile.mutate(f.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    <Dialog open={Boolean(shareToken)} onOpenChange={(open) => { if (!open) setShareToken(null); }}>
      <DialogContent className="max-w-md p-0"><DialogHeader><DialogTitle>External share created</DialogTitle><DialogDescription>This token expires in seven days. Send it only to the intended recipient.</DialogDescription></DialogHeader><div className="space-y-3 px-4 pb-4"><Input readOnly value={shareToken ?? ""} /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => { if (shareToken) void navigator.clipboard.writeText(shareToken); }}>Copy token</Button><Button onClick={() => setShareToken(null)}>Done</Button></div></div></DialogContent>
    </Dialog>
    <Dialog open={Boolean(previewFile)} onOpenChange={(open) => { if (!open) setPreviewFile(null); }}>
      <DialogContent className="max-w-4xl top-1/2">
        {previewFile && (
          <>
            <DialogHeader>
              <DialogTitle>{previewFile.originalName}</DialogTitle>
              <DialogDescription>{formatBytes(previewFile.size)} · {previewFile.mimeType}</DialogDescription>
            </DialogHeader>
            <FilePreview file={previewFile} />
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

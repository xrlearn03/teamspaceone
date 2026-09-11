import { useCallback, useEffect, useRef, useState } from "react";
import {
  File,
  FileArchive,
  FileAudio,
  FileText,
  FileVideo,
  Grid,
  Image as ImageIcon,
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
import { Button } from "@teamspace-one/ui/button";
import { Input } from "@teamspace-one/ui/input";
import { Badge } from "@teamspace-one/ui/badge";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@teamspace-one/ui/dialog";
import { cn } from "../lib/utils";

const filters = ["All", "PDF", "Images", "Video", "Audio", "Design", "Docs", "Archives"];

type FileKind = "image" | "video" | "audio" | "document" | "archive" | "text" | "other";

function fileKind(file: { mimeType: string; originalName: string; metadata?: Record<string, unknown> | null }): FileKind {
  const kind = file.metadata?.kind;
  if (typeof kind === "string" && ["image", "video", "audio", "document", "archive", "text", "other"].includes(kind)) {
    return kind as FileKind;
  }
  const mime = file.mimeType.toLowerCase();
  const name = file.originalName.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "text/plain") return "text";
  if (mime.includes("pdf") || mime.includes("word") || mime.includes("officedocument") || mime.includes("opendocument") || mime.includes("rtf") || mime === "text/csv" || mime === "text/html" || mime === "text/markdown") return "document";
  if (/\.(zip|tar|tar\.gz|tgz|gz|7z|rar|bz2)$/.test(name) || mime.includes("zip") || mime.includes("tar") || mime.includes("compressed")) return "archive";
  if (mime.startsWith("text/")) return "text";
  return "other";
}

const KIND_ICONS: Record<FileKind, typeof FileText> = {
  image: ImageIcon,
  video: FileVideo,
  audio: FileAudio,
  document: FileText,
  archive: FileArchive,
  text: FileText,
  other: File,
};

function FileKindIcon({ file, className }: { file: FileRecord; className?: string }) {
  const Icon = KIND_ICONS[fileKind(file)];
  return <Icon className={cn("text-text-muted", className)} />;
}

function formatDuration(seconds: unknown): string | null {
  const value = typeof seconds === "number" ? seconds : Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  const total = Math.round(value);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

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
    case "Video":
      return mime.startsWith("video/");
    case "Audio":
      return mime.startsWith("audio/");
    case "Archives":
      return /\.(zip|tar|tar\.gz|tgz|gz|7z|rar|bz2)$/.test(name) || mime.includes("zip") || mime.includes("archive") || mime.includes("compressed");
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
  const hasVisualThumbnail = fileKind(file) === "image" || fileKind(file) === "video";
  const load = useCallback(async () => {
    try {
      return await fetchFilePreview(file.id, "thumbnail");
    } catch {
      return downloadFile(file.id);
    }
  }, [file.id]);
  const { url, loading } = useObjectUrl(load, hasVisualThumbnail);

  if (loading) {
    return <div className={cn("animate-pulse rounded bg-surface-elevated", className)} />;
  }

  if (url) {
    return <img src={url} alt={file.originalName} className={cn("rounded object-cover", className)} />;
  }

  return <FileKindIcon file={file} className={fallbackClassName ?? className} />;
}

function FileMetadataRows({ file }: { file: FileRecord }) {
  const metadata = file.metadata ?? {};
  const duration = formatDuration(metadata.durationSeconds);
  const dimensions =
    typeof metadata.width === "number" && typeof metadata.height === "number"
      ? `${metadata.width} × ${metadata.height}`
      : null;
  const entryCount = typeof metadata.archiveEntryCount === "number" ? metadata.archiveEntryCount : null;
  const rows: [string, string][] = [
    ["Type", file.mimeType],
    ["Size", formatBytes(file.size)],
    ["Status", file.status],
  ];
  if (duration) rows.push(["Duration", duration]);
  if (dimensions) rows.push(["Dimensions", dimensions]);
  if (typeof metadata.videoCodec === "string") rows.push(["Video codec", metadata.videoCodec]);
  if (typeof metadata.audioCodec === "string") rows.push(["Audio codec", metadata.audioCodec]);
  if (entryCount !== null) rows.push(["Archive contents", `${entryCount} file${entryCount === 1 ? "" : "s"}`]);
  if (metadata.textExtracted === true) rows.push(["Text", "Extracted for search"]);
  if (file.checksumSha256) rows.push(["SHA-256", file.checksumSha256]);
  return (
    <dl className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-left text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-text-muted">{label}</dt>
          <dd className="break-all text-text">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FilePreview({ file }: { file: FileRecord }) {
  const kind = fileKind(file);
  const loadImage = useCallback(async () => {
    try {
      return await fetchFilePreview(file.id, "preview");
    } catch {
      return downloadFile(file.id);
    }
  }, [file.id]);
  const { url: imageUrl, loading: imageLoading, error: imageError } = useObjectUrl(loadImage, kind === "image");

  const loadMedia = useCallback(() => downloadFile(file.id), [file.id]);
  const { url: videoUrl, loading: videoLoading, error: videoError } = useObjectUrl(loadMedia, kind === "video");
  const { url: audioUrl, loading: audioLoading, error: audioError } = useObjectUrl(loadMedia, kind === "audio");

  const textPreview = typeof file.metadata?.textPreview === "string" ? file.metadata.textPreview : null;
  const archiveEntries = Array.isArray(file.metadata?.archiveEntries)
    ? (file.metadata.archiveEntries as unknown[]).filter((e): e is string => typeof e === "string")
    : [];

  const mediaError = (message: string) => (
    <div className="flex flex-col items-center gap-3 text-center text-error">
      <FileKindIcon file={file} className="h-16 w-16" />
      <p className="text-sm">{message}</p>
    </div>
  );

  return (
    <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 p-4 pt-0">
      {kind === "image" && (
        imageLoading ? (
          <div className="h-32 w-32 animate-pulse rounded bg-surface-elevated" />
        ) : imageUrl ? (
          <img src={imageUrl} alt={file.originalName} className="max-h-[60vh] max-w-full rounded-md object-contain" />
        ) : mediaError(imageError ?? "Unable to load image")
      )}
      {kind === "video" && (
        videoLoading ? (
          <div className="h-32 w-32 animate-pulse rounded bg-surface-elevated" />
        ) : videoUrl ? (
          <video src={videoUrl} controls className="max-h-[60vh] max-w-full rounded-md" />
        ) : mediaError(videoError ?? "Unable to load video")
      )}
      {kind === "audio" && (
        audioLoading ? (
          <div className="h-16 w-64 animate-pulse rounded bg-surface-elevated" />
        ) : audioUrl ? (
          <audio src={audioUrl} controls className="w-full max-w-md" />
        ) : mediaError(audioError ?? "Unable to load audio")
      )}
      {kind !== "image" && kind !== "video" && kind !== "audio" && (
        <FileKindIcon file={file} className="h-16 w-16" />
      )}
      {textPreview && kind !== "text" ? (
        <pre className="max-h-48 w-full overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-elevated p-3 text-left text-xs text-text-secondary">
          {textPreview}
        </pre>
      ) : null}
      {textPreview && kind === "text" ? (
        <pre className="max-h-[50vh] w-full overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-elevated p-3 text-left text-xs text-text-secondary">
          {textPreview}
        </pre>
      ) : null}
      {archiveEntries.length > 0 ? (
        <ul className="max-h-48 w-full overflow-y-auto rounded-md bg-surface-elevated p-3 text-left text-xs text-text-secondary">
          {archiveEntries.map((entry) => (
            <li key={entry} className="truncate py-0.5">{entry}</li>
          ))}
          {typeof file.metadata?.archiveEntryCount === "number" && file.metadata.archiveEntryCount > archiveEntries.length ? (
            <li className="py-0.5 text-text-muted">…and {file.metadata.archiveEntryCount - archiveEntries.length} more</li>
          ) : null}
        </ul>
      ) : null}
      <div className="w-full max-w-md">
        <FileMetadataRows file={file} />
      </div>
      <Button disabled={!getFileUrl(file)} onClick={() => { const url = getFileUrl(file); if (url) void openUrl(url); }}>
        <ExternalLink className="mr-1.5 h-4 w-4" /> Open file
      </Button>
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
    uploadFile.mutate({ file }, {
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
      <header className="flex h-14 items-center justify-between border-b px-3 sm:px-6">
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

      <div className="flex items-center gap-2 border-b px-3 sm:px-6 py-2">
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
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
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
            </table></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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

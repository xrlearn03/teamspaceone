import { useState } from "react";
import {
  FileText,
  Grid,
  List,
  Search,
  Filter,
  Download,
  MoreHorizontal,
  Upload,
  Clock,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { cn } from "../lib/utils";

const files = [
  { id: "f1", name: "brand-guidelines-v3.pdf", size: "2.4 MB", owner: "Sarah", updated: "2h ago", type: "pdf" },
  { id: "f2", name: "homepage-wireframes.fig", size: "14 MB", owner: "James", updated: "5h ago", type: "fig" },
  { id: "f3", name: "client-assets.zip", size: "120 MB", owner: "Emily", updated: "Yesterday", type: "zip" },
  { id: "f4", name: "meeting-notes.md", size: "4 KB", owner: "Alex", updated: "Today", type: "doc" },
];

const filters = ["All", "PDF", "Images", "Design", "Docs", "Archives"];

export function FileBrowserScreen() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [activeFilter, setActiveFilter] = useState("All");

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-text">Files</h1>
          <Badge variant="secondary">{files.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input placeholder="Search files" className="h-8 w-56 pl-8 text-sm" />
          </div>
          <Button variant="ghost" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
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
          <Button size="sm">
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
        {files.length === 0 ? (
          <EmptyState icon={FileText} title="No files" description="Upload a file to get started." />
        ) : viewMode === "list" ? (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-surface-elevated text-left text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Size</th>
                  <th className="px-4 py-2 font-medium">Owner</th>
                  <th className="px-4 py-2 font-medium">Updated</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-surface-elevated/50">
                    <td className="flex items-center gap-2 px-4 py-3">
                      <FileText className="h-4 w-4 text-text-muted" />
                      <span className="text-text">{f.name}</span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{f.size}</td>
                    <td className="px-4 py-3 text-text-secondary">{f.owner}</td>
                    <td className="px-4 py-3 text-text-secondary">{f.updated}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Clock className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
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
            {files.map((f) => (
              <div
                key={f.id}
                className="flex flex-col gap-2 rounded-lg border bg-surface p-4 hover:border-primary/30"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-elevated text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <p className="truncate text-sm font-medium text-text">{f.name}</p>
                <p className="text-xs text-text-muted">{f.size} · {f.owner}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

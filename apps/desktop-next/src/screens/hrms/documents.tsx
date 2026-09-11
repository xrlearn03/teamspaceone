import { useRef, useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { uploadFile } from "@/lib/api";
import {
  useDeleteEmployeeDocument,
  useEmployeeDocuments,
  useMyEmployee,
  useUploadEmployeeDocument,
} from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@teamspace-one/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@teamspace-one/ui/card";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import {
  SectionError,
  SectionSkeleton,
  formatDate,
} from "./common";

const CATEGORIES = ["identity", "contract", "certificate", "payslip", "other"];

export function DocumentsSection() {
  const { can } = usePermissions();
  const me = useMyEmployee();
  const documents = useEmployeeDocuments(me.data?.id);
  const upload = useUploadEmployeeDocument();
  const remove = useDeleteEmployeeDocument();
  const fileInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("identity");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canUpload = can("hrms.document.upload") || can("hrms.document.view");
  const canDeleteAny = can("hrms.document.delete");

  async function handleFile(file: File) {
    if (!me.data?.id) return;
    setUploading(true);
    setUploadError(null);
    try {
      // Presign → PUT to storage → complete, returns the FileRecord id.
      const record = await uploadFile(file);
      await upload.mutateAsync({
        employeeId: me.data.id,
        fileId: record.id,
        category,
        name: file.name,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (me.isLoading || documents.isLoading) return <SectionSkeleton />;
  if (documents.isError) return <SectionError onRetry={() => documents.refetch()} />;
  if (!me.data) {
    return (
      <EmptyState
        icon={FileText}
        title="No employee record"
        description="Your employee profile hasn't been created yet."
      />
    );
  }

  const items = documents.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">My documents</h2>
        {canUpload ? (
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm text-text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Document category"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
            <Button size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1 h-4 w-4" />
              )}
              Upload
            </Button>
          </div>
        ) : null}
      </div>

      {uploadError ? <p className="text-xs text-error">{uploadError}</p> : null}

      <Card>
        <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents"
              description="Upload your first document using the button above."
            />
          ) : (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Uploaded</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-text">{d.name ?? d.fileId}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{d.category ?? "—"}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{formatDate(d.createdAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {canDeleteAny || d.uploadedBy === me.data?.userId ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete document"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(d.id)}
                        >
                          <Trash2 className="h-4 w-4 text-error" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useRef } from "react";
import { Upload, FileText, Loader2 } from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import { usePermissions } from "../../hooks/usePermissions";
import { useUploadCandidateResume } from "../../hooks/api";

export function ResumeUploadButton({
  candidateId,
  hasResume,
}: {
  candidateId: string;
  hasResume?: boolean;
}) {
  const { can } = usePermissions();
  const { mutate, isPending } = useUploadCandidateResume();
  const inputRef = useRef<HTMLInputElement>(null);

  if (!can("interview.candidate.edit")) return null;

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    mutate({ candidateId, file });
    e.target.value = "";
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : hasResume ? (
          <FileText className="h-3.5 w-3.5" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {isPending ? "Uploading" : hasResume ? "Resume" : "Upload"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={onChange}
      />
    </>
  );
}

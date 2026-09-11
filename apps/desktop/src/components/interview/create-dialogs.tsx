import { useState } from "react";
import { Briefcase, Plus, UserPlus, CalendarClock } from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@teamspace-one/ui/dialog";
import { Input } from "@teamspace-one/ui/input";
import { cn } from "../../lib/utils";
import type { Candidate, JobOpening } from "../../lib/api";
import {
  useCreateJobOpening,
  useCreateCandidate,
  useCreateInterviewSession,
} from "../../hooks/api";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border bg-surface px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-text-muted focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function CreateJobDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const { mutate, isPending } = useCreateJobOpening();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    mutate(
      {
        title: title.trim(),
        departmentName: departmentName.trim() || undefined,
        description: description.trim() || undefined,
        requirements: requirements.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle("");
          setDepartmentName("");
          setDescription("");
          setRequirements("");
          onCreated?.();
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="gap-1">
        <Plus className="h-3.5 w-3.5" />
        New job
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            New job opening
          </DialogTitle>
          <DialogDescription>Post a new position to the recruitment pipeline.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 p-4 pt-2">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Frontend Engineer" required />
          </Field>
          <Field label="Department">
            <Input value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="e.g. Engineering" />
          </Field>
          <Field label="Description">
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Role summary" />
          </Field>
          <Field label="Requirements">
            <TextArea value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Skills, experience, qualifications" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending || !title.trim()}>Create</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateCandidateDialog({
  jobs,
  onCreated,
}: {
  jobs: JobOpening[];
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [source, setSource] = useState("");
  const [jobOpeningId, setJobOpeningId] = useState("");
  const { mutate, isPending } = useCreateCandidate();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    mutate(
      {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        location: location.trim() || undefined,
        source: source.trim() || undefined,
        jobOpeningId: jobOpeningId || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
          setEmail("");
          setPhone("");
          setLocation("");
          setSource("");
          setJobOpeningId("");
          onCreated?.();
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="gap-1">
        <UserPlus className="h-3.5 w-3.5" />
        Add candidate
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Add candidate
          </DialogTitle>
          <DialogDescription>Add a new candidate and optionally link them to a job opening.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 p-4 pt-2">
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" required />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" required />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
          </Field>
          <Field label="Location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" />
          </Field>
          <Field label="Source">
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="LinkedIn, referral, apply" />
          </Field>
          <Field label="Apply to job (optional)">
            <select
              className="flex h-9 w-full rounded-md border bg-surface px-3 py-1 text-sm shadow-sm focus-visible:border-primary"
              value={jobOpeningId}
              onChange={(e) => setJobOpeningId(e.target.value)}
            >
              <option value="">—</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending || !name.trim() || !email.trim()}>Add</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateSessionDialog({
  candidates,
  jobs,
  onCreated,
}: {
  candidates: Candidate[];
  jobs: JobOpening[];
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [jobOpeningId, setJobOpeningId] = useState("");
  const [interviewType, setInterviewType] = useState("video");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const { mutate, isPending } = useCreateInterviewSession();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!candidateId) return;
    const payload: {
      candidateId: string;
      jobOpeningId?: string;
      interviewType?: string;
      scheduledAt?: string;
      durationMin?: number;
    } = {
      candidateId,
      interviewType,
      durationMin,
    };
    if (jobOpeningId) payload.jobOpeningId = jobOpeningId;
    if (scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString();
    mutate(payload, {
      onSuccess: () => {
        setOpen(false);
        setCandidateId("");
        setJobOpeningId("");
        setInterviewType("video");
        setScheduledAt("");
        setDurationMin(60);
        onCreated?.();
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="gap-1">
        <CalendarClock className="h-3.5 w-3.5" />
        Schedule
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Schedule interview
          </DialogTitle>
          <DialogDescription>Create a new interview session for a candidate.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 p-4 pt-2">
          <Field label="Candidate">
            <select
              className="flex h-9 w-full rounded-md border bg-surface px-3 py-1 text-sm shadow-sm focus-visible:border-primary"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              required
            >
              <option value="">—</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
          </Field>
          <Field label="Job opening (optional)">
            <select
              className="flex h-9 w-full rounded-md border bg-surface px-3 py-1 text-sm shadow-sm focus-visible:border-primary"
              value={jobOpeningId}
              onChange={(e) => setJobOpeningId(e.target.value)}
            >
              <option value="">—</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <Input value={interviewType} onChange={(e) => setInterviewType(e.target.value)} placeholder="video, phone, in-person" />
          </Field>
          <Field label="Scheduled at">
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </Field>
          <Field label="Duration (minutes)">
            <Input
              type="number"
              min={15}
              step={15}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending || !candidateId}>Schedule</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

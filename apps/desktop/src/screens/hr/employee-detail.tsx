import { useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Cake,
  CalendarDays,
  IdCard,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Star,
  User,
  Users,
} from "lucide-react";
import { useEmployee } from "../../hooks/api";
import { useUIStore } from "../../stores/ui";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { EmployeeFormDialog } from "../hrms/employees";
import { SectionError, SectionSkeleton, formatDate } from "../hrms/common";

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="flex items-center gap-2 text-sm text-text-secondary">
        <Icon className="h-4 w-4 text-text-muted" />
        {label}
      </span>
      <span className="text-right text-sm font-medium text-text">{value ?? "—"}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
      </div>
      <div className="divide-y divide-border px-5">{children}</div>
    </div>
  );
}

export function EmployeeDetailScreen() {
  const { activeEmployeeId, setActiveView } = useUIStore();
  const employee = useEmployee(activeEmployeeId ?? undefined);
  const [editOpen, setEditOpen] = useState(false);

  const e = employee.data;
  const name = e ? `${e.firstName} ${e.lastName}`.trim() : "";
  const role = e?.designationName ?? e?.designation?.title ?? e?.designation?.name ?? null;
  const dept = e?.departmentName ?? e?.department?.name ?? null;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setActiveView("employees")}
          className="flex items-center gap-2 text-sm font-medium text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Employee Details
        </button>
      </div>

      {employee.isLoading ? (
        <div className="mt-6">
          <SectionSkeleton rows={5} />
        </div>
      ) : employee.isError || !e ? (
        <div className="mt-6">
          <SectionError onRetry={() => employee.refetch()} message="Couldn't load this employee." />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-3">
          {/* Profile card */}
          <div className="flex flex-col gap-5">
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="h-20 bg-gradient-to-r from-primary to-mention" />
              <div className="flex flex-col items-center px-5 pb-5">
                <Avatar className="-mt-8 h-16 w-16 border-4 border-surface">
                  <AvatarFallback>
                    {name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="mt-2 flex items-center gap-1.5 text-base font-semibold text-text">
                  {name}
                  <BadgeCheck className="h-4 w-4 text-success" />
                </div>
                <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
                  {role && (
                    <span className="rounded bg-surface-elevated px-2 py-0.5 text-xs font-medium text-text-secondary">
                      • {role}
                    </span>
                  )}
                </div>
              </div>
              <div className="px-5">
                <InfoRow icon={IdCard} label="Employee ID" value={e.employeeNumber} />
                <InfoRow icon={Star} label="Team" value={dept} />
                <InfoRow icon={CalendarDays} label="Date Of Join" value={formatDate(e.joiningDate)} />
                <InfoRow
                  icon={Users}
                  label="Report Office"
                  value={
                    e.manager ? (
                      <span className="flex items-center gap-1.5">
                        <Avatar className="h-4 w-4">
                          <AvatarFallback className="text-[8px]">
                            {`${e.manager.firstName ?? ""} ${e.manager.lastName ?? ""}`.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        {`${e.manager.firstName ?? ""} ${e.manager.lastName ?? ""}`.trim() || "—"}
                      </span>
                    ) : null
                  }
                />
              </div>
              <div className="flex gap-3 p-5">
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-text text-sm font-medium text-surface"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Info
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("dm")}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-white hover:bg-primary-hover"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Message
                </button>
              </div>
            </div>

            <Section title="Basic information">
              <InfoRow icon={Phone} label="Phone" value={e.phone} />
              <InfoRow
                icon={Mail}
                label="Email"
                value={e.workEmail ? <span className="text-info">{e.workEmail}</span> : null}
              />
              <InfoRow icon={User} label="Status" value={e.status} />
              <InfoRow icon={Cake} label="Birthday" value={formatDate(e.dateOfBirth)} />
              <InfoRow icon={MapPin} label="Address" value={e.address} />
            </Section>

            <Section title="Employment">
              <InfoRow icon={IdCard} label="Type" value={e.employmentType?.replace(/_/g, " ")} />
              <InfoRow icon={CalendarDays} label="Joined" value={formatDate(e.joiningDate)} />
            </Section>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-5 xl:col-span-2">
            <div className="rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-5 py-3.5">
                <h2 className="text-sm font-semibold text-text">About Employee</h2>
              </div>
              <p className="px-5 py-4 text-sm leading-6 text-text-secondary">
                {e.firstName} {e.lastName} is a {role ?? "team member"}
                {dept ? ` in ${dept}` : ""}, employed as{" "}
                {e.employmentType?.replace(/_/g, " ") ?? "—"} since {formatDate(e.joiningDate)}.
              </p>
            </div>

            <Section title="Emergency Contact">
              <InfoRow icon={Phone} label="Name" value={e.emergencyContactName} />
              <InfoRow icon={Phone} label="Phone" value={e.emergencyContactPhone} />
            </Section>

            <div className="rounded-lg border border-dashed border-border bg-surface/50 p-5 text-xs text-text-muted">
              Bank, family, education and experience records are not stored in the employee
              profile yet — those fields don&apos;t exist in the HRMS employee model.
            </div>
          </div>
        </div>
      )}

      {e && <EmployeeFormDialog open={editOpen} onOpenChange={setEditOpen} employee={e} />}
    </div>
  );
}

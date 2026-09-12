import { useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Pencil,
  PlusCircle,
  Search,
  Trash2,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { cn } from "../lib/utils";

interface AssetRow {
  name: string;
  user: string;
  purchaseDate: string;
  warranty: string;
  warrantyEnd: string;
  status: "Active" | "Inactive";
}

const ASSETS: AssetRow[] = [
  { name: "Dell Laptop", user: "Anthony Lewis", purchaseDate: "12/09/2024", warranty: "12 months", warrantyEnd: "12/09/2024", status: "Active" },
  { name: "Canon Portable Printer", user: "Brian Villalobos", purchaseDate: "24/10/2024", warranty: "12 months", warrantyEnd: "24/10/2024", status: "Active" },
  { name: "Dell Laptop", user: "Sophie Headrick", purchaseDate: "18/02/2024", warranty: "12 months", warrantyEnd: "18/02/2024", status: "Active" },
  { name: "Dell Laptop", user: "Stephan Peralt", purchaseDate: "17/10/2024", warranty: "12 months", warrantyEnd: "17/10/2024", status: "Active" },
  { name: "Dell Laptop", user: "Thomas Bordelon", purchaseDate: "20/07/2024", warranty: "12 months", warrantyEnd: "20/07/2024", status: "Active" },
  { name: "Dell Laptop", user: "Doglas Martini", purchaseDate: "10/04/2024", warranty: "12 months", warrantyEnd: "10/04/2024", status: "Active" },
  { name: "Dell Laptop", user: "Cameron Drake", purchaseDate: "29/08/2024", warranty: "12 months", warrantyEnd: "29/08/2024", status: "Active" },
  { name: "Dell Laptop", user: "Harvey Smith", purchaseDate: "22/02/2024", warranty: "12 months", warrantyEnd: "22/02/2024", status: "Inactive" },
  { name: "Dell Laptop", user: "Michael Walker", purchaseDate: "03/11/2024", warranty: "12 months", warrantyEnd: "03/11/2024", status: "Active" },
  { name: "Dell Laptop", user: "Doris Crowley", purchaseDate: "17/12/2024", warranty: "12 months", warrantyEnd: "17/12/2024", status: "Active" },
];

function FilterDropdown({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-8 items-center gap-2 rounded-[5px] border border-[#e5e7eb] bg-white px-3 text-xs text-[#111827]"
    >
      {label}
      {children}
      <ChevronDown className="h-3.5 w-3.5 text-[#111827]" />
    </button>
  );
}

export function AssetsScreen() {
  const [page, setPage] = useState(4);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Assets</h1>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#6b7280]">
            <Home className="h-3.5 w-3.5" />
            <span>/</span>
            <span>Administration</span>
            <span>/</span>
            <span className="text-[#111827]">Assets</span>
          </div>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-[5px] bg-gradient-to-r from-[#ff6f28] to-[#ff5325] px-4 py-[7px] text-sm font-medium text-white"
        >
          <PlusCircle className="h-4 w-4" />
          Add New Asset
        </button>
      </div>

      <div className="mt-6 rounded-[5px] border border-[#e5e7eb] bg-white">
        <div className="flex items-center justify-between border-b border-[#e5e7eb] px-5 py-4">
          <h2 className="text-base font-semibold text-[#111827]">Assets List</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-8 items-center gap-2 rounded-[5px] border border-[#e5e7eb] bg-white px-3 text-xs text-[#111827]"
            >
              <Calendar className="h-3.5 w-3.5 text-[#111827]" />
              dd/mm/yyyy - dd/mm/yyyy
            </button>
            <FilterDropdown>Status</FilterDropdown>
            <FilterDropdown label="Sort By : ">Last 7 Days</FilterDropdown>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-[#6b7280]">
            <span>Row Per Page</span>
            <button
              type="button"
              className="flex h-7 items-center gap-1.5 rounded-[5px] border border-[#e5e7eb] bg-white px-2.5 text-xs text-[#111827]"
            >
              10
              <ChevronDown className="h-3 w-3" />
            </button>
            <span>Entries</span>
          </div>
          <div className="flex h-8 w-56 items-center gap-2 rounded-[5px] border border-[#e5e7eb] bg-white px-3">
            <Search className="h-3.5 w-3.5 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="Search"
              className="w-full bg-transparent text-xs text-[#111827] placeholder:text-[#9ca3af] focus:outline-none"
            />
          </div>
        </div>

        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-[#e5e7eb]">
              <th className="w-10 px-4 py-2.5">
                <input type="checkbox" className="h-4 w-4 rounded-[5px] border-[#e5e7eb]" />
              </th>
              <th className="px-4 py-2.5 font-semibold text-[#111827]">Asset Name</th>
              <th className="px-4 py-2.5 font-semibold text-[#111827]">Asset User</th>
              <th className="px-4 py-2.5 font-semibold text-[#111827]">
                Purchase Date <ChevronDown className="inline h-3 w-3" />
              </th>
              <th className="px-4 py-2.5 font-semibold text-[#111827]">Warranty</th>
              <th className="px-4 py-2.5 font-semibold text-[#111827]">
                Warranty End Date <ChevronDown className="inline h-3 w-3" />
              </th>
              <th className="px-4 py-2.5 font-semibold text-[#111827]">Status</th>
              <th className="w-24 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {ASSETS.map((asset, i) => (
              <tr key={i} className="border-t border-[#e5e7eb] bg-white">
                <td className="px-4 py-3">
                  <input type="checkbox" className="h-4 w-4 rounded-[5px] border-[#e5e7eb]" />
                </td>
                <td className="px-4 py-3 font-medium text-[#111827]">{asset.name}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">
                        {asset.user.split(" ").map((p) => p[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-[#111827]">{asset.user}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-[#6b7280]">{asset.purchaseDate}</td>
                <td className="px-4 py-3 text-[#6b7280]">{asset.warranty}</td>
                <td className="px-4 py-3 text-[#6b7280]">{asset.warrantyEnd}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-[5px] px-2 py-0.5 text-xs font-medium text-white",
                      asset.status === "Active" ? "bg-admin-success" : "bg-admin-danger",
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    {asset.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center justify-end gap-3">
                    <button type="button" className="text-[#6b7280] hover:text-[#111827]" aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="text-[#6b7280] hover:text-[#111827]" aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-[#e5e7eb] px-5 py-3">
          <span className="text-sm text-[#6b7280]">Showing 1 to 10 of 16 entries</span>
          <div className="flex items-center gap-1">
            <button type="button" className="flex h-7 w-7 items-center justify-center text-[#6b7280]" aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs",
                  page === n ? "bg-brand text-white" : "text-[#111827] hover:bg-[#f3f4f6]",
                )}
              >
                {n}
              </button>
            ))}
            <span className="px-1 text-xs text-[#6b7280]">…</span>
            <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full text-xs text-[#111827] hover:bg-[#f3f4f6]">
              15
            </button>
            <button type="button" className="flex h-7 w-7 items-center justify-center text-[#6b7280]" aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

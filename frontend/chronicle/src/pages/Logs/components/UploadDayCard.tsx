import { Link } from "react-router-dom";
import { Upload } from "lucide-react";
import type { UploadMeta } from "../utils/calendarUtils";
import { formatStorageBytes } from "@/utils/storage";

interface UploadDayCardProps {
  upload: UploadMeta;
}

export function UploadDayCard({ upload }: UploadDayCardProps) {
  return (
    <Link to={`/logs/${upload.id}`} className="block">
      <div className="relative h-10 rounded overflow-hidden group cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30">
        {/* Content */}
        <div className="relative z-10 h-full flex items-center justify-between px-2 gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Upload className="h-3 w-3 text-amber-500 flex-shrink-0" />
            <span className="text-[10px] text-amber-200 truncate">
              {upload.instanceCount} {upload.instanceCount === 1 ? "instance" : "instances"}
            </span>
          </div>
          <span className="text-[10px] text-amber-300/80 flex-shrink-0">
            {formatStorageBytes(upload.sizeBytes)}
          </span>
        </div>
      </div>
    </Link>
  );
}

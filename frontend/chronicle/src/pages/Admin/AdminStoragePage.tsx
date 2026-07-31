import { useState, useMemo } from "react";
import {
  useAdminUsers,
  useUserGrants,
  useUpsertUserGrant,
  useDeleteUserGrant,
  type User,
  type DataGrant,
} from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { bytesToMegabytes, formatStorageBytes, megabytesToBytes } from "@/utils/storage";
import {
  HardDrive,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Search,
  Gift,
  Loader2,
  X,
  Calendar,
  Clock,
} from "lucide-react";

const SOURCE_LABELS: Record<string, string> = {
  base: "Base Allocation",
  support: "Supporter Bonus",
  "alpha-tester": "Alpha Tester Reward",
  "beta-tester": "Beta Tester Reward",
  promotion: "Promotional Bonus",
  gift: "Gift",
  "discord-member": "Discord Server Member",
};

const PRESET_SOURCES = [
  { value: "base", label: "Base Allocation" },
  { value: "support", label: "Supporter Bonus" },
  { value: "alpha-tester", label: "Alpha Tester" },
  { value: "beta-tester", label: "Beta Tester" },
  { value: "promotion", label: "Promotion" },
  { value: "gift", label: "Gift" },
];

function formatSource(source: string): string {
  return (
    SOURCE_LABELS[source] ||
    source.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

interface AddGrantFormProps {
  userId: string;
  existingSources: string[];
  onClose: () => void;
}

const EXPIRATION_PRESETS = [
  { value: "", label: "Never expires" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "1y", label: "1 year" },
  { value: "custom", label: "Custom date..." },
];

function getExpirationDate(preset: string, customDate: string): string | undefined {
  if (!preset || preset === "") return undefined;
  if (preset === "custom") return customDate || undefined;
  
  const now = new Date();
  const match = preset.match(/^(\d+)([dy])$/);
  if (!match) return undefined;
  
  const [, amount, unit] = match;
  if (unit === "d") {
    now.setDate(now.getDate() + parseInt(amount, 10));
  } else if (unit === "y") {
    now.setFullYear(now.getFullYear() + parseInt(amount, 10));
  }
  return now.toISOString();
}

function AddGrantForm({ userId, existingSources, onClose }: AddGrantFormProps) {
  const [source, setSource] = useState("");
  const [customSource, setCustomSource] = useState("");
  const [storageMB, setStorageMB] = useState("500");
  const [description, setDescription] = useState("");
  const [expirationPreset, setExpirationPreset] = useState("");
  const [customExpiration, setCustomExpiration] = useState("");
  const upsertMutation = useUpsertUserGrant();

  const effectiveSource = source === "custom" ? customSource : source;
  const isDuplicate = existingSources.includes(effectiveSource);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveSource || isDuplicate) return;

    const expiresAt = getExpirationDate(expirationPreset, customExpiration);

    await upsertMutation.mutateAsync({
      userId,
      source: effectiveSource,
      storageBytes: megabytesToBytes(parseInt(storageMB, 10) || 0),
      description: description || undefined,
      expiresAt,
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-muted/50 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Add Storage Grant</h4>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Source</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full mt-1 px-2 py-1.5 text-sm bg-background border rounded"
          >
            <option value="">Select source...</option>
            {PRESET_SOURCES.filter((s) => !existingSources.includes(s.value)).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
            <option value="custom">Custom...</option>
          </select>
        </div>

        {source === "custom" && (
          <div>
            <label className="text-xs text-muted-foreground">Custom Source</label>
            <input
              type="text"
              value={customSource}
              onChange={(e) => setCustomSource(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
              placeholder="e.g., event-2024"
              className="w-full mt-1 px-2 py-1.5 text-sm bg-background border rounded"
            />
          </div>
        )}

        <div>
          <label className="text-xs text-muted-foreground">Storage (MB)</label>
          <input
            type="number"
            value={storageMB}
            onChange={(e) => setStorageMB(e.target.value)}
            min={0}
            className="w-full mt-1 px-2 py-1.5 text-sm bg-background border rounded"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Expiration</label>
          <select
            value={expirationPreset}
            onChange={(e) => setExpirationPreset(e.target.value)}
            className="w-full mt-1 px-2 py-1.5 text-sm bg-background border rounded"
          >
            {EXPIRATION_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {expirationPreset === "custom" && (
          <div>
            <label className="text-xs text-muted-foreground">Expiration Date</label>
            <input
              type="datetime-local"
              value={customExpiration}
              onChange={(e) => setCustomExpiration(e.target.value ? new Date(e.target.value).toISOString() : "")}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full mt-1 px-2 py-1.5 text-sm bg-background border rounded"
            />
          </div>
        )}

        <div className={source === "custom" || expirationPreset === "custom" ? "col-span-2" : ""}>
          <label className="text-xs text-muted-foreground">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Reason for grant..."
            className="w-full mt-1 px-2 py-1.5 text-sm bg-background border rounded"
          />
        </div>
      </div>

      {isDuplicate && (
        <p className="text-xs text-destructive">A grant with this source already exists.</p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!effectiveSource || isDuplicate || upsertMutation.isPending}
        >
          {upsertMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Plus className="h-4 w-4 mr-1" />
          )}
          Add Grant
        </Button>
      </div>
    </form>
  );
}

interface GrantRowProps {
  grant: DataGrant;
  userId: string;
  onEdit: () => void;
}

function formatExpirationDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return "Expired";
  if (diffDays === 0) return "Expires today";
  if (diffDays === 1) return "Expires tomorrow";
  if (diffDays <= 7) return `Expires in ${diffDays} days`;
  if (diffDays <= 30) return `Expires in ${Math.ceil(diffDays / 7)} weeks`;
  
  return `Expires ${date.toLocaleDateString()}`;
}

function GrantRow({ grant, userId }: GrantRowProps) {
  const [editing, setEditing] = useState(false);
  const [storageMB, setStorageMB] = useState(bytesToMegabytes(grant.storage_bytes).toString());
  const [expiresAt, setExpiresAt] = useState(grant.expires_at || "");
  const upsertMutation = useUpsertUserGrant();
  const deleteMutation = useDeleteUserGrant();

  const isExpired = grant.expires_at && new Date(grant.expires_at) < new Date();
  const isExpiringSoon = grant.expires_at && !isExpired && 
    new Date(grant.expires_at).getTime() - new Date().getTime() < 7 * 24 * 60 * 60 * 1000;

  const handleSave = async () => {
    await upsertMutation.mutateAsync({
      userId,
      source: grant.source,
      storageBytes: megabytesToBytes(parseInt(storageMB, 10) || 0),
      description: grant.description || undefined,
      expiresAt: expiresAt || undefined,
    });
    setEditing(false);
  };

  const handleDelete = async () => {
    if (grant.source === "base") {
      if (!confirm("Deleting the base grant will set storage to 0. Are you sure?")) return;
    }
    await deleteMutation.mutateAsync({ userId, source: grant.source });
  };

  const handleClearExpiration = async () => {
    await upsertMutation.mutateAsync({
      userId,
      source: grant.source,
      storageBytes: grant.storage_bytes,
      description: grant.description || undefined,
      expiresAt: undefined,
    });
  };

  return (
    <div className={`flex items-center gap-4 py-2 px-3 hover:bg-muted/30 rounded group ${isExpired ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{formatSource(grant.source)}</span>
          <span className="text-xs text-muted-foreground font-mono">({grant.source})</span>
          {grant.expires_at && (
            <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
              isExpired 
                ? "bg-destructive/15 text-destructive" 
                : isExpiringSoon 
                  ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                  : "bg-muted text-muted-foreground"
            }`}>
              <Clock className="h-3 w-3" />
              {formatExpirationDate(grant.expires_at)}
            </span>
          )}
        </div>
        {grant.description && (
          <p className="text-xs text-muted-foreground truncate">{grant.description}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {editing ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={storageMB}
                onChange={(e) => setStorageMB(e.target.value)}
                className="w-20 px-2 py-1 text-sm bg-background border rounded text-right"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
              <span className="text-xs text-muted-foreground">MB</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <input
                type="datetime-local"
                value={expiresAt ? new Date(expiresAt).toISOString().slice(0, 16) : ""}
                onChange={(e) => setExpiresAt(e.target.value ? new Date(e.target.value).toISOString() : "")}
                className="px-2 py-1 text-xs bg-background border rounded"
              />
              {expiresAt && (
                <button 
                  onClick={() => setExpiresAt("")}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSave}
                disabled={upsertMutation.isPending}
              >
                {upsertMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {grant.expires_at && !isExpired && (
              <button
                onClick={handleClearExpiration}
                className="text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                title="Remove expiration"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={() => setEditing(true)}
              className="text-sm font-medium hover:underline"
            >
              {formatStorageBytes(grant.storage_bytes)}
            </button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

interface UserGrantsRowProps {
  user: User;
}

function UserGrantsRow({ user }: UserGrantsRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const { data: grants, isLoading } = useUserGrants(user.id, { enabled: expanded });

  const percentage =
    user.max_storage_bytes > 0
      ? Math.min((user.consumed_storage_bytes / user.max_storage_bytes) * 100, 100)
      : 0;
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{user.username}</span>
            <span className="text-sm text-muted-foreground">{user.email}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 min-w-[200px]">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isAtLimit ? "bg-destructive" : isNearLimit ? "bg-yellow-500" : "bg-primary"
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
              <span>{formatStorageBytes(user.consumed_storage_bytes)}</span>
              <span>{formatStorageBytes(user.max_storage_bytes)}</span>
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pl-12">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading grants...
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  Storage Grants ({grants?.length || 0})
                </h4>
                {!showAddForm && (
                  <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Grant
                  </Button>
                )}
              </div>

              {showAddForm && (
                <AddGrantForm
                  userId={user.id}
                  existingSources={grants?.map((g) => g.source) || []}
                  onClose={() => setShowAddForm(false)}
                />
              )}

              {grants && grants.length > 0 ? (
                <div className="border rounded-lg divide-y">
                  {grants.map((grant) => (
                    <GrantRow
                      key={grant.id}
                      grant={grant}
                      userId={user.id}
                      onEdit={() => {}}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">
                  No grants found. Add a grant to allocate storage.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminStoragePage() {
  const { data: usersData, isLoading, error } = useAdminUsers();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = useMemo(() => {
    if (!usersData?.users) return [];
    if (!searchQuery.trim()) return usersData.users;

    const query = searchQuery.toLowerCase();
    return usersData.users.filter(
      (user) =>
        user.username.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
    );
  }, [usersData?.users, searchQuery]);

  // Sort by consumed storage descending
  const sortedUsers = useMemo(() => {
    return [...filteredUsers].sort((a, b) => b.consumed_storage_bytes - a.consumed_storage_bytes);
  }, [filteredUsers]);

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="p-6">
          <p className="text-destructive">Error loading users: {String(error)}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HardDrive className="h-6 w-6" />
          Storage Grants
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage storage allocations for users. Each user's total storage is the sum of their
          active grants.
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg"
          />
        </div>
      </div>

      {/* Users list */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sortedUsers.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            {searchQuery ? "No users match your search." : "No users found."}
          </div>
        ) : (
          sortedUsers.map((user) => <UserGrantsRow key={user.id} user={user} />)
        )}
      </Card>
    </div>
  );
}

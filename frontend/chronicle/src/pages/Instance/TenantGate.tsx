import { ExternalLink, ArrowRight } from "lucide-react";
import { useSiteConfig } from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import type { Instance } from "./InstancePage";

/** Chronicle square icon served from /public — rendered inside a circle clip. */
const CHRONICLE_LOGO = "/c/chronicle/ChronicleIconSquare.webp";

/**
 * Tenant gate truth table — decides what a user sees when viewing an instance
 * from a particular domain context.
 *
 * currentSlug = the tenant slug from the subdomain (null = primary domain)
 * instanceSlug = the tenant slug the instance belongs to (null = untenanted / legacy)
 *
 * | currentSlug | instanceSlug | include_in_all | Result                              |
 * |-------------|--------------|----------------|-------------------------------------|
 * | null        | null         | —              | ✅ Show page (primary + untenanted) |
 * | "A"         | "A"          | —              | ✅ Show page (same tenant)          |
 * | null        | "A"          | true           | ✅ Show page + info banner          |
 * | null        | "A"          | false          | 🚫 Block → link to A.domain        |
 * | "B"         | "A"          | —              | 🚫 Block → link to A.domain        |
 * | "A"         | null         | —              | 🚫 Block → link to primary domain  |
 * | "B"         | null         | —              | 🚫 Block → link to primary domain  |
 */
export function useTenantGate(instance: Instance | null): {
  /** Non-null when the page should be blocked entirely. */
  blocked: React.ReactNode | null;
  /** Non-null when the page should show a dismissible banner at the top. */
  banner: React.ReactNode | null;
} {
  const { data: siteConfig } = useSiteConfig();

  // No instance yet or site config still loading — allow page (will re-evaluate on load)
  if (!instance || !siteConfig) {
    return { blocked: null, banner: null };
  }

  const currentSlug = siteConfig?.tenant?.slug ?? null;
  const instanceSlug = instance.tenantSlug ?? null;
  const primaryDomain = siteConfig?.primary_domain;

  // Exact match: both on the same tenant (including both-null = primary viewing untenanted)
  if (currentSlug === instanceSlug) {
    return { blocked: null, banner: null };
  }

  const targetUrl = buildTargetUrl(instance, instanceSlug, primaryDomain);
  const instanceTenantName = instance.tenantName || instance.serverName || "another server";

  // Current tenant info
  const currentTenantName = siteConfig?.tenant?.name ?? "Chronicle";
  const currentTenantLogo = siteConfig?.tenant?.branding?.square_logo ?? CHRONICLE_LOGO;

  // Instance tenant info — use placeholder until tenants have logos
  // TODO: When tenant branding is available on the instance response, use it here.
  const instanceTenantLogo: string | null = null;

  // On primary domain viewing a tenanted instance
  if (currentSlug === null && instanceSlug !== null) {
    if (instance.tenantIncludeInAll) {
      // Show page with info banner
      return {
        blocked: null,
        banner: (
          <TenantBanner
            serverLabel={instanceTenantName}
            realmName={instance.realm}
            logoUrl={instanceTenantLogo}
            targetUrl={targetUrl}
          />
        ),
      };
    }

    // Not included in root — block
    return {
      blocked: (
        <BlockingDialog
          instanceName={instance.name}
          instanceTenantName={instanceTenantName}
          instanceTenantLogo={instanceTenantLogo}
          realmName={instance.realm}
          currentTenantName={currentTenantName}
          currentTenantLogo={currentTenantLogo}
          targetUrl={targetUrl}
        />
      ),
      banner: null,
    };
  }

  // On a tenant subdomain viewing a different tenant's instance (or untenanted)
  return {
    blocked: (
      <BlockingDialog
        instanceName={instance.name}
        instanceTenantName={instanceSlug ? instanceTenantName : "Chronicle"}
        instanceTenantLogo={instanceSlug ? instanceTenantLogo : CHRONICLE_LOGO}
        realmName={instance.realm}
        currentTenantName={currentTenantName}
        currentTenantLogo={currentTenantLogo}
        targetUrl={targetUrl}
      />
    ),
    banner: null,
  };
}

function buildTargetUrl(
  instance: Instance,
  instanceSlug: string | null,
  primaryDomain: string | undefined,
): string | null {
  if (!primaryDomain) return null;

  const path = instance.slug
    ? `/instances/${instance.slug}`
    : `/instances/${instance.id}`;

  if (instanceSlug) {
    return `https://${instanceSlug}.${primaryDomain}${path}`;
  }
  return `https://${primaryDomain}${path}`;
}

/** Extract the hostname from a full URL for display (e.g. "legacy.chronicleclassic.com"). */
function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function TenantBanner({
  serverLabel,
  realmName,
  logoUrl,
  targetUrl,
}: {
  serverLabel: string;
  realmName?: string;
  /** Logo URL for the instance's tenant, or null/undefined to show placeholder. */
  logoUrl?: string | null;
  targetUrl: string | null;
}) {
  return (
    <div className="bg-muted/50 border border-border rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-5 w-5 rounded-full shrink-0" />
      ) : (
        <PlaceholderLogo className="h-5 w-5 text-muted-foreground shrink-0" />
      )}
      <span>
        This log comes from <strong>{serverLabel}</strong>
        {realmName && <> on the realm <strong>{realmName}</strong></>}.
        {targetUrl && (
          <>
            {" "}
            <a
              href={targetUrl}
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Go there
              <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}
      </span>
    </div>
  );
}

/** Placeholder circle for tenants that don't have a logo yet. */
export function PlaceholderLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" opacity="0.4" />
      <circle cx="20" cy="20" r="8" fill="currentColor" opacity="0.15" />
    </svg>
  );
}

export interface BlockingDialogProps {
  /** Name of the instance (e.g. "Molten Core"). */
  instanceName?: string;
  /** Name of the tenant/server the instance was recorded on. */
  instanceTenantName: string;
  /** Logo URL for the instance's tenant, or null to show placeholder. */
  instanceTenantLogo: string | null;
  /** Realm name (e.g. "Nordanaar"). */
  realmName?: string;
  /** Name of the tenant the user is currently viewing from. */
  currentTenantName: string;
  /** Logo URL for the current tenant. */
  currentTenantLogo: string;
  /** URL to redirect the user to view the instance on the correct tenant. */
  targetUrl: string | null;
}

export function BlockingDialog({
  instanceName,
  instanceTenantName,
  instanceTenantLogo,
  realmName,
  currentTenantName,
  currentTenantLogo,
  targetUrl,
}: BlockingDialogProps) {
  const targetHostname = targetUrl ? hostnameFromUrl(targetUrl) : null;

  return (
    <div className="w-full px-4 py-6">
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-lg w-full p-8 space-y-4">
          {/* Tenant logos side by side */}
          <div className="flex items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <div className="h-12 w-12 rounded-full ring-1 ring-border flex items-center justify-center overflow-hidden">
                <img src={currentTenantLogo} alt={currentTenantName} className="h-10 w-10 object-contain" />
              </div>
              <span className="text-xs text-muted-foreground">You are here</span>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
            <div className="flex flex-col items-center gap-1.5">
              <div className="h-12 w-12 rounded-full ring-1 ring-border flex items-center justify-center overflow-hidden">
                {instanceTenantLogo ? (
                  <img src={instanceTenantLogo} alt={instanceTenantName} className="h-10 w-10 object-contain" />
                ) : (
                  <PlaceholderLogo className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <span className="text-xs text-muted-foreground">Recorded</span>
            </div>
          </div>

          {/* Message */}
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold">Different Server</h2>
            <p className="text-sm text-muted-foreground">
              {instanceName && <><strong>{instanceName}</strong> was recorded on </>}
              {!instanceName && <>This log was recorded on </>}
              <strong>{instanceTenantName}</strong>
              {realmName && <> on the realm <strong>{realmName}</strong></>}
              {" "}and can only be viewed there.
            </p>
            <p className="text-xs text-muted-foreground/60">
              You are currently on {currentTenantName}.
            </p>
          </div>

          {/* Action */}
          {targetUrl && (
            <div className="flex flex-col items-center gap-1">
              <a
                href={targetUrl}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Go to {instanceTenantName}
                <ExternalLink className="h-4 w-4" />
              </a>
              {targetHostname && (
                <span className="text-xs text-muted-foreground/50">{targetHostname}</span>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

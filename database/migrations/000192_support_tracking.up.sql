BEGIN;

CREATE TABLE support_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    public_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
    monthly_goal_cents BIGINT NOT NULL DEFAULT 0 CHECK (monthly_goal_cents >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO support_settings (id) VALUES (TRUE);

CREATE TABLE support_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN ('manual', 'patreon', 'github_sponsors', 'buy_me_a_coffee')),
    display_name TEXT NOT NULL CHECK (display_name <> ''),
    public_url TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE support_service_monthly_totals (
    service_id UUID NOT NULL REFERENCES support_services(id) ON DELETE CASCADE,
    month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
    received_cents BIGINT NOT NULL DEFAULT 0 CHECK (received_cents >= 0),
    recurring_cents BIGINT NOT NULL DEFAULT 0 CHECK (recurring_cents >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (service_id, month)
);

CREATE INDEX support_service_monthly_totals_month_idx
    ON support_service_monthly_totals (month);

COMMIT;

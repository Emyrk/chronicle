-- One row per model call. Cost is in OpenRouter credits (1 credit = 1 USD) times 1e9, so sums stay exact.
-- Context is copied from the thread so project totals survive deleted or cleared chats.
CREATE TABLE inference_usage (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES inference_runs(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    thread_id uuid REFERENCES inference_threads(id) ON DELETE SET NULL,
    -- The assistant message's id inside inference_messages.content, which is also its streamed messageId.
    message_key text,
    context_type text,
    context_id text,
    model text NOT NULL,
    generation_id text,
    prompt_tokens bigint NOT NULL DEFAULT 0,
    completion_tokens bigint NOT NULL DEFAULT 0,
    cached_tokens bigint NOT NULL DEFAULT 0,
    reasoning_tokens bigint NOT NULL DEFAULT 0,
    cost_nanos bigint,
    upstream_cost_nanos bigint,
    is_byok boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inference_usage_context_check CHECK ((context_type IS NULL) = (context_id IS NULL))
);

CREATE INDEX inference_usage_run_idx ON inference_usage USING btree (run_id);
CREATE INDEX inference_usage_thread_created_idx ON inference_usage USING btree (thread_id, created_at);
CREATE INDEX inference_usage_user_context_idx ON inference_usage USING btree (user_id, context_type, context_id);

-- A chat's total counts usage since it was last cleared with /clear.
ALTER TABLE inference_threads ADD COLUMN cleared_at timestamp with time zone;

-- Recreate the seven parse/time scoring tables retired by 000340. Existing
-- source and v1 performance tables remain untouched; historical scores are not
-- recovered by this DDL. Scoring workers must repopulate them from source data.
-- Table definitions, constraints, indexes and foreign keys follow the pre-000340
-- schema (the pre-retirement database schema replayed through migration 000339).
BEGIN;

--
-- Name: parse_score_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parse_score_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    policy_version smallint NOT NULL,
    query_version smallint NOT NULL,
    run_id uuid NOT NULL,
    encounter_name text NOT NULL,
    player_guid text NOT NULL,
    instance_id uuid NOT NULL,
    log_group_id uuid NOT NULL,
    difficulty_name text DEFAULT ''::text NOT NULL,
    max_players smallint DEFAULT 0 NOT NULL,
    player_class text NOT NULL,
    player_spec text NOT NULL,
    player_sub_spec text DEFAULT ''::text NOT NULL,
    killed_at timestamp with time zone NOT NULL,
    dps double precision NOT NULL,
    hps double precision DEFAULT 0 NOT NULL
);


--
-- Name: parse_score_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parse_score_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
    instance_id uuid NOT NULL,
    snapshot_id uuid,
    policy_version smallint DEFAULT 1 NOT NULL,
    query_version smallint DEFAULT 1 NOT NULL,
    lookback_days smallint DEFAULT 60 NOT NULL,
    source_count integer DEFAULT 0 NOT NULL,
    result_count integer DEFAULT 0 NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cutoff timestamp with time zone NOT NULL,
    window_start timestamp with time zone,
    cohort_mode text NOT NULL
);


--
-- Name: parse_score_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parse_score_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
    instance_id uuid NOT NULL,
    run_id uuid NOT NULL,
    snapshot_id uuid,
    log_group_id uuid,
    guild_id uuid,
    encounter_name text NOT NULL,
    player_guid text NOT NULL,
    player_name text DEFAULT ''::text NOT NULL,
    player_class text DEFAULT ''::text NOT NULL,
    player_spec text DEFAULT ''::text NOT NULL,
    player_role text DEFAULT ''::text NOT NULL,
    metric text NOT NULL,
    metric_value double precision NOT NULL,
    precise_score double precision NOT NULL,
    display_score smallint NOT NULL,
    rank integer NOT NULL,
    sample_size integer NOT NULL,
    status text DEFAULT 'ok'::text NOT NULL,
    instance_name text DEFAULT ''::text NOT NULL,
    difficulty_name text DEFAULT ''::text NOT NULL,
    max_players smallint DEFAULT 0 NOT NULL,
    killed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    player_sub_spec text DEFAULT ''::text NOT NULL,
    CONSTRAINT parse_score_results_metric_check CHECK ((metric = ANY (ARRAY['dps'::text, 'hps'::text])))
);


--
-- Name: time_parse_boss_kill_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_parse_boss_kill_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    policy_version smallint NOT NULL,
    query_version smallint NOT NULL,
    run_id uuid NOT NULL,
    encounter_name text NOT NULL,
    instance_id uuid NOT NULL,
    log_group_id uuid NOT NULL,
    instance_name text NOT NULL,
    difficulty_name text DEFAULT ''::text NOT NULL,
    max_players smallint DEFAULT 0 NOT NULL,
    duration_ms bigint NOT NULL,
    killed_at timestamp with time zone NOT NULL
);


--
-- Name: time_parse_boss_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_parse_boss_scores (
    time_parse_score_id uuid NOT NULL,
    encounter_id uuid NOT NULL,
    encounter_name text NOT NULL,
    duration_ms bigint NOT NULL,
    server_precise_score double precision NOT NULL,
    server_display_score smallint NOT NULL,
    server_rank integer NOT NULL,
    server_sample_size integer NOT NULL,
    server_status text NOT NULL,
    realm_precise_score double precision NOT NULL,
    realm_display_score smallint NOT NULL,
    realm_rank integer NOT NULL,
    realm_sample_size integer NOT NULL,
    realm_status text NOT NULL,
    guild_precise_score double precision,
    guild_display_score smallint,
    guild_rank integer,
    guild_sample_size integer,
    guild_status text,
    CONSTRAINT time_parse_boss_scores_check CHECK ((((guild_precise_score IS NULL) AND (guild_display_score IS NULL) AND (guild_rank IS NULL) AND (guild_sample_size IS NULL) AND (guild_status IS NULL)) OR ((guild_precise_score IS NOT NULL) AND (guild_display_score IS NOT NULL) AND (guild_rank IS NOT NULL) AND (guild_sample_size IS NOT NULL) AND (guild_status IS NOT NULL))))
);


--
-- Name: time_parse_clear_time_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_parse_clear_time_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    policy_version smallint NOT NULL,
    query_version smallint NOT NULL,
    run_id uuid NOT NULL,
    instance_id uuid NOT NULL,
    log_group_id uuid NOT NULL,
    instance_name text NOT NULL,
    difficulty_name text DEFAULT ''::text NOT NULL,
    max_players smallint DEFAULT 0 NOT NULL,
    duration_ms bigint NOT NULL,
    start_time timestamp with time zone NOT NULL
);


--
-- Name: time_parse_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_parse_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    instance_id uuid NOT NULL,
    run_id uuid NOT NULL,
    log_group_id uuid,
    realm_id uuid NOT NULL,
    guild_id uuid,
    clear_duration_ms bigint,
    clear_server_precise_score double precision,
    clear_server_display_score smallint,
    clear_server_rank integer,
    clear_server_sample_size integer,
    clear_server_status text,
    clear_realm_precise_score double precision,
    clear_realm_display_score smallint,
    clear_realm_rank integer,
    clear_realm_sample_size integer,
    clear_realm_status text,
    clear_guild_precise_score double precision,
    clear_guild_display_score smallint,
    clear_guild_rank integer,
    clear_guild_sample_size integer,
    clear_guild_status text,
    cutoff timestamp with time zone NOT NULL,
    window_start timestamp with time zone NOT NULL,
    lookback_days smallint NOT NULL,
    policy_version smallint NOT NULL,
    query_version smallint NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT time_parse_scores_check CHECK ((((clear_duration_ms IS NULL) AND (clear_server_precise_score IS NULL) AND (clear_server_display_score IS NULL) AND (clear_server_rank IS NULL) AND (clear_server_sample_size IS NULL) AND (clear_server_status IS NULL) AND (clear_realm_precise_score IS NULL) AND (clear_realm_display_score IS NULL) AND (clear_realm_rank IS NULL) AND (clear_realm_sample_size IS NULL) AND (clear_realm_status IS NULL) AND (clear_guild_precise_score IS NULL) AND (clear_guild_display_score IS NULL) AND (clear_guild_rank IS NULL) AND (clear_guild_sample_size IS NULL) AND (clear_guild_status IS NULL)) OR ((clear_duration_ms IS NOT NULL) AND (clear_server_precise_score IS NOT NULL) AND (clear_server_display_score IS NOT NULL) AND (clear_server_rank IS NOT NULL) AND (clear_server_sample_size IS NOT NULL) AND (clear_server_status IS NOT NULL) AND (clear_realm_precise_score IS NOT NULL) AND (clear_realm_display_score IS NOT NULL) AND (clear_realm_rank IS NOT NULL) AND (clear_realm_sample_size IS NOT NULL) AND (clear_realm_status IS NOT NULL) AND (((guild_id IS NULL) AND (clear_guild_precise_score IS NULL) AND (clear_guild_display_score IS NULL) AND (clear_guild_rank IS NULL) AND (clear_guild_sample_size IS NULL) AND (clear_guild_status IS NULL)) OR ((guild_id IS NOT NULL) AND (clear_guild_precise_score IS NOT NULL) AND (clear_guild_display_score IS NOT NULL) AND (clear_guild_rank IS NOT NULL) AND (clear_guild_sample_size IS NOT NULL) AND (clear_guild_status IS NOT NULL))))))
);


--
-- Name: parse_score_memberships parse_score_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parse_score_memberships
    ADD CONSTRAINT parse_score_memberships_pkey PRIMARY KEY (id);


--
-- Name: parse_score_memberships parse_score_memberships_tenant_id_policy_version_query_vers_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parse_score_memberships
    ADD CONSTRAINT parse_score_memberships_tenant_id_policy_version_query_vers_key UNIQUE (tenant_id, policy_version, query_version, run_id, encounter_name, player_guid);


--
-- Name: parse_score_receipts parse_score_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parse_score_receipts
    ADD CONSTRAINT parse_score_receipts_pkey PRIMARY KEY (id);


--
-- Name: parse_score_results parse_score_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parse_score_results
    ADD CONSTRAINT parse_score_results_pkey PRIMARY KEY (id);


--
-- Name: time_parse_boss_kill_memberships time_parse_boss_kill_membersh_tenant_id_policy_version_quer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_boss_kill_memberships
    ADD CONSTRAINT time_parse_boss_kill_membersh_tenant_id_policy_version_quer_key UNIQUE (tenant_id, policy_version, query_version, run_id, encounter_name);


--
-- Name: time_parse_boss_kill_memberships time_parse_boss_kill_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_boss_kill_memberships
    ADD CONSTRAINT time_parse_boss_kill_memberships_pkey PRIMARY KEY (id);


--
-- Name: time_parse_boss_scores time_parse_boss_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_boss_scores
    ADD CONSTRAINT time_parse_boss_scores_pkey PRIMARY KEY (time_parse_score_id, encounter_id);


--
-- Name: time_parse_clear_time_memberships time_parse_clear_time_members_tenant_id_policy_version_quer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_clear_time_memberships
    ADD CONSTRAINT time_parse_clear_time_members_tenant_id_policy_version_quer_key UNIQUE (tenant_id, policy_version, query_version, run_id);


--
-- Name: time_parse_clear_time_memberships time_parse_clear_time_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_clear_time_memberships
    ADD CONSTRAINT time_parse_clear_time_memberships_pkey PRIMARY KEY (id);


--
-- Name: time_parse_scores time_parse_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_scores
    ADD CONSTRAINT time_parse_scores_pkey PRIMARY KEY (id);


--
-- Name: time_parse_scores time_parse_scores_tenant_id_instance_id_lookback_days_polic_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_scores
    ADD CONSTRAINT time_parse_scores_tenant_id_instance_id_lookback_days_polic_key UNIQUE (tenant_id, instance_id, lookback_days, policy_version, query_version);


--
-- Name: idx_parse_score_memberships_cohort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parse_score_memberships_cohort ON public.parse_score_memberships USING btree (tenant_id, policy_version, query_version, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, killed_at);


--
-- Name: idx_parse_score_memberships_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parse_score_memberships_instance ON public.parse_score_memberships USING btree (instance_id);


--
-- Name: idx_parse_score_memberships_log_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parse_score_memberships_log_group ON public.parse_score_memberships USING btree (log_group_id);


--
-- Name: idx_parse_score_receipts_legacy_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_parse_score_receipts_legacy_contract ON public.parse_score_receipts USING btree (tenant_id, instance_id, snapshot_id, lookback_days, policy_version, query_version) WHERE (snapshot_id IS NOT NULL);


--
-- Name: idx_parse_score_receipts_window_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_parse_score_receipts_window_contract ON public.parse_score_receipts USING btree (tenant_id, instance_id, lookback_days, policy_version, query_version) WHERE (snapshot_id IS NULL);


--
-- Name: idx_parse_score_results_instance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parse_score_results_instance_id ON public.parse_score_results USING btree (instance_id);


--
-- Name: idx_parse_score_results_log_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parse_score_results_log_group_id ON public.parse_score_results USING btree (log_group_id) WHERE (log_group_id IS NOT NULL);


--
-- Name: idx_psr_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psr_dedup ON public.parse_score_results USING btree (run_id, encounter_name, player_guid, snapshot_id, metric);


--
-- Name: idx_psr_guild; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psr_guild ON public.parse_score_results USING btree (tenant_id, guild_id, metric, killed_at DESC NULLS LAST) WHERE (guild_id IS NOT NULL);


--
-- Name: idx_psr_instance_player_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psr_instance_player_latest ON public.parse_score_results USING btree (tenant_id, instance_id, player_guid, metric, encounter_name, created_at DESC, precise_score DESC) INCLUDE (display_score, status);


--
-- Name: idx_psr_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psr_player ON public.parse_score_results USING btree (tenant_id, player_guid, metric, killed_at DESC NULLS LAST);


--
-- Name: idx_psr_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psr_snapshot ON public.parse_score_results USING btree (snapshot_id);


--
-- Name: idx_psr_tenant_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psr_tenant_instance ON public.parse_score_results USING btree (tenant_id, instance_id);


--
-- Name: idx_psreceipt_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psreceipt_instance ON public.parse_score_receipts USING btree (instance_id);


--
-- Name: idx_psreceipt_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psreceipt_snapshot ON public.parse_score_receipts USING btree (snapshot_id);


--
-- Name: idx_psreceipt_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psreceipt_tenant ON public.parse_score_receipts USING btree (tenant_id);


--
-- Name: idx_time_parse_scores_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_parse_scores_contract ON public.time_parse_scores USING btree (tenant_id, instance_id, policy_version, query_version, lookback_days);


--
-- Name: idx_time_parse_scores_missing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_parse_scores_missing ON public.time_parse_scores USING btree (tenant_id, policy_version, query_version, lookback_days, instance_id);


--
-- Name: idx_tpbk_memberships_cohort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tpbk_memberships_cohort ON public.time_parse_boss_kill_memberships USING btree (tenant_id, policy_version, query_version, instance_name, encounter_name, difficulty_name, max_players, killed_at);


--
-- Name: idx_tpbk_memberships_log_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tpbk_memberships_log_group ON public.time_parse_boss_kill_memberships USING btree (log_group_id);


--
-- Name: idx_tpct_memberships_cohort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tpct_memberships_cohort ON public.time_parse_clear_time_memberships USING btree (tenant_id, policy_version, query_version, instance_name, difficulty_name, max_players, start_time);


--
-- Name: idx_tpct_memberships_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tpct_memberships_instance ON public.time_parse_clear_time_memberships USING btree (instance_id);


--
-- Name: idx_tpct_memberships_log_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tpct_memberships_log_group ON public.time_parse_clear_time_memberships USING btree (log_group_id);


--
-- Name: parse_score_memberships parse_score_memberships_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parse_score_memberships
    ADD CONSTRAINT parse_score_memberships_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.log_instances(id) ON DELETE CASCADE;


--
-- Name: parse_score_memberships parse_score_memberships_log_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parse_score_memberships
    ADD CONSTRAINT parse_score_memberships_log_group_id_fkey FOREIGN KEY (log_group_id) REFERENCES public.wow_log_groups(id) ON DELETE CASCADE;


--
-- Name: parse_score_receipts parse_score_receipts_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parse_score_receipts
    ADD CONSTRAINT parse_score_receipts_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.log_instances(id) ON DELETE CASCADE;


--
-- Name: parse_score_results parse_score_results_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parse_score_results
    ADD CONSTRAINT parse_score_results_guild_id_fkey FOREIGN KEY (guild_id) REFERENCES public.guilds(id) ON DELETE SET NULL;


--
-- Name: parse_score_results parse_score_results_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parse_score_results
    ADD CONSTRAINT parse_score_results_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.log_instances(id) ON DELETE CASCADE;


--
-- Name: parse_score_results parse_score_results_log_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parse_score_results
    ADD CONSTRAINT parse_score_results_log_group_id_fkey FOREIGN KEY (log_group_id) REFERENCES public.wow_log_groups(id) ON DELETE SET NULL;


--
-- Name: time_parse_boss_kill_memberships time_parse_boss_kill_memberships_log_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_boss_kill_memberships
    ADD CONSTRAINT time_parse_boss_kill_memberships_log_group_id_fkey FOREIGN KEY (log_group_id) REFERENCES public.wow_log_groups(id) ON DELETE CASCADE;


--
-- Name: time_parse_boss_scores time_parse_boss_scores_time_parse_score_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_boss_scores
    ADD CONSTRAINT time_parse_boss_scores_time_parse_score_id_fkey FOREIGN KEY (time_parse_score_id) REFERENCES public.time_parse_scores(id) ON DELETE CASCADE;


--
-- Name: time_parse_clear_time_memberships time_parse_clear_time_memberships_log_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_clear_time_memberships
    ADD CONSTRAINT time_parse_clear_time_memberships_log_group_id_fkey FOREIGN KEY (log_group_id) REFERENCES public.wow_log_groups(id) ON DELETE CASCADE;


--
-- Name: time_parse_scores time_parse_scores_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_scores
    ADD CONSTRAINT time_parse_scores_guild_id_fkey FOREIGN KEY (guild_id) REFERENCES public.guilds(id) ON DELETE SET NULL;


--
-- Name: time_parse_scores time_parse_scores_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_scores
    ADD CONSTRAINT time_parse_scores_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.log_instances(id) ON DELETE CASCADE;


--
-- Name: time_parse_scores time_parse_scores_log_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_scores
    ADD CONSTRAINT time_parse_scores_log_group_id_fkey FOREIGN KEY (log_group_id) REFERENCES public.wow_log_groups(id) ON DELETE SET NULL;


--
-- Name: time_parse_scores time_parse_scores_realm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_parse_scores
    ADD CONSTRAINT time_parse_scores_realm_id_fkey FOREIGN KEY (realm_id) REFERENCES public.wow_server_realms(id);

COMMIT;

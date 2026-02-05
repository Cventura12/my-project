-- ==========================================
-- Obligo Financial Aid Document Tracker
-- Database Schema for Supabase
-- ==========================================

-- 1. Student profiles
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Schools
create table if not exists schools (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  application_type text default 'undergraduate' check (application_type in ('undergraduate', 'graduate', 'transfer')),
  application_deadline date,
  financial_aid_deadline date,
  status text default 'tracking' check (status in ('tracking', 'applied', 'accepted', 'enrolled', 'declined')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table schools enable row level security;

create policy "Users can view own schools"
  on schools for select using (auth.uid() = user_id);

create policy "Users can insert own schools"
  on schools for insert with check (auth.uid() = user_id);

create policy "Users can update own schools"
  on schools for update using (auth.uid() = user_id);

create policy "Users can delete own schools"
  on schools for delete using (auth.uid() = user_id);

-- 3. Documents
-- ⚠️ NON-AUTHORITATIVE (PHASE 1 DOCTRINE)
-- `documents` is NOT the canonical representation of "things the student must do".
-- It is a legacy/UX artifact table and must not be used as a deadline/task ledger.
-- Deadlines must live in `obligations.deadline` only.
create table if not exists documents (
  id uuid default gen_random_uuid() primary key,
  school_id uuid references schools on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  type text default 'form' check (type in ('form', 'tax', 'transcript', 'letter', 'id', 'financial', 'other')),
  description text,
  deadline date,
  status text default 'not_started' check (status in ('not_started', 'in_progress', 'submitted', 'received', 'verified', 'issue')),
  submission_method text,
  submitted_at timestamptz,
  received_at timestamptz,
  file_url text,
  notes text,
  is_urgent boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table documents enable row level security;

create policy "Users can view own documents"
  on documents for select using (auth.uid() = user_id);

create policy "Users can insert own documents"
  on documents for insert with check (auth.uid() = user_id);

create policy "Users can update own documents"
  on documents for update using (auth.uid() = user_id);

create policy "Users can delete own documents"
  on documents for delete using (auth.uid() = user_id);

-- 4. Updated_at trigger function
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger schools_updated_at
  before update on schools
  for each row execute function update_updated_at();

create trigger documents_updated_at
  before update on documents
  for each row execute function update_updated_at();

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- ==========================================
-- 5. Email Connections (Gmail OAuth per user)
-- ==========================================
create table if not exists email_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null unique,
  provider text not null default 'gmail' check (provider in ('gmail', 'outlook')),
  access_token text not null,
  refresh_token text,
  token_expiry timestamptz,
  email_address text,
  last_scan_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table email_connections enable row level security;

create policy "Users can view own email connections"
  on email_connections for select using (auth.uid() = user_id);

create policy "Users can insert own email connections"
  on email_connections for insert with check (auth.uid() = user_id);

create policy "Users can update own email connections"
  on email_connections for update using (auth.uid() = user_id);

create policy "Users can delete own email connections"
  on email_connections for delete using (auth.uid() = user_id);

create trigger email_connections_updated_at
  before update on email_connections
  for each row execute function update_updated_at();

-- ==========================================
-- 6. Analyzed Emails (scanned + AI-analyzed)
-- ==========================================
-- ⚠️ NON-AUTHORITATIVE (PHASE 1 DOCTRINE)
-- `analyzed_emails` are SIGNALS ONLY. They are not first-class work items.
-- Any detected "deadline" or "requires_action" must be routed into `obligations`.
create table if not exists analyzed_emails (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  gmail_id text,
  subject text,
  sender text,
  received_at timestamptz,
  snippet text,
  source_link text,
  -- AI analysis fields
  requires_action boolean default false,
  summary text,
  action_needed text,
  deadline date,
  deadline_implied boolean default false,
  relevance text default 'low' check (relevance in ('high', 'medium', 'low', 'none')),
  category text check (category in ('financial_aid', 'deadline', 'document_request', 'status_update', 'general', null)),
  school_match text,
  -- Metadata
  is_read boolean default false,
  is_dismissed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table analyzed_emails enable row level security;

create policy "Users can view own analyzed emails"
  on analyzed_emails for select using (auth.uid() = user_id);

create policy "Users can insert own analyzed emails"
  on analyzed_emails for insert with check (auth.uid() = user_id);

create policy "Users can update own analyzed emails"
  on analyzed_emails for update using (auth.uid() = user_id);

create policy "Users can delete own analyzed emails"
  on analyzed_emails for delete using (auth.uid() = user_id);

-- Index for fast lookups by gmail_id (deduplication)
create index if not exists idx_analyzed_emails_gmail_id on analyzed_emails(user_id, gmail_id);

-- Index for querying actionable emails
create index if not exists idx_analyzed_emails_action on analyzed_emails(user_id, requires_action, is_dismissed);

create trigger analyzed_emails_updated_at
  before update on analyzed_emails
  for each row execute function update_updated_at();

-- Enable realtime for analyzed_emails so frontend gets live updates
alter publication supabase_realtime add table analyzed_emails;

-- ==========================================
-- 7. Follow-ups (Email drafts & approvals)
-- ==========================================
create table if not exists follow_ups (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  school_id uuid references schools on delete cascade not null,
  document_id uuid references documents on delete set null,
  follow_up_type text not null default 'email_draft' check (follow_up_type in ('email_draft', 'status_inquiry')),
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'sent', 'cancelled')),
  drafted_content text not null,
  edited_content text,
  subject text,
  recipient_email text,
  sent_at timestamptz,
  sent_message_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table follow_ups enable row level security;

create policy "Users can view own follow_ups"
  on follow_ups for select using (auth.uid() = user_id);

create policy "Users can insert own follow_ups"
  on follow_ups for insert with check (auth.uid() = user_id);

create policy "Users can update own follow_ups"
  on follow_ups for update using (auth.uid() = user_id);

create policy "Users can delete own follow_ups"
  on follow_ups for delete using (auth.uid() = user_id);

create index if not exists idx_follow_ups_pending on follow_ups(user_id, status) where status = 'pending_approval';

create trigger follow_ups_updated_at
  before update on follow_ups
  for each row execute function update_updated_at();

alter publication supabase_realtime add table follow_ups;

-- ==========================================
-- 8. Obligations (CANONICAL SOURCE OF TRUTH)
-- ==========================================
-- Obligo doctrine (Phase 1): There must be exactly ONE canonical representation
-- of "something the student must do" -> obligations.
--
-- This table is the ONLY authoritative place deadlines live.
-- Other tables may contain legacy deadline-like fields, but they are non-authoritative.
create table if not exists obligations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,

  -- Canonical obligation classification (strict allowed set)
  type text not null check (type in (
    'FAFSA',
    'APPLICATION_FEE',
    'APPLICATION_SUBMISSION',
    'HOUSING_DEPOSIT',
    'SCHOLARSHIP',
    'ENROLLMENT_DEPOSIT',
    'SCHOLARSHIP_ACCEPTANCE'
  )),

  -- Human readable
  title text not null,

  -- Where this obligation came from (minimal spine: email or manual only)
  source text not null check (source in ('email', 'manual')),
  -- email: gmail_id / outlook message id, manual: stable tag like "document:{uuid}" or "onboarding:{...}"
  source_ref text not null,

  -- Canonical deadline. Nullable if none is known.
  deadline timestamptz,

  -- Canonical status. Keep minimal; do not add workflow states yet.
  status text not null default 'pending' check (status in ('pending', 'submitted', 'verified', 'blocked', 'failed')),

  -- Whether verification requires proof. Proof storage is out of scope for Phase 1 spine.
  proof_required boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Phase 3 Step 4: Memory of consequence
  failed_at timestamptz,
  verified_at timestamptz,
  prior_failed_obligation_id uuid references obligations(id),
  constraint obligations_source_ref_unique unique (user_id, source, source_ref)
);

-- Phase 1 Step 4: submitted_at is required to detect "unverified after submission" states server-side.
-- This is NOT a workflow system; it's a minimal timestamp for controlled recovery drafts.
alter table obligations add column if not exists submitted_at timestamptz;
alter table obligations add column if not exists failed_at timestamptz;
alter table obligations add column if not exists verified_at timestamptz;
alter table obligations add column if not exists prior_failed_obligation_id uuid references obligations(id);

-- Phase 1 Step 3: remove legacy spine constraint if it exists (proof is now modeled explicitly).
alter table obligations drop constraint if exists obligations_verified_requires_proof;

alter table obligations enable row level security;

create policy "Users can view own obligations"
  on obligations for select using (auth.uid() = user_id);

create policy "Users can insert own obligations"
  on obligations for insert with check (auth.uid() = user_id);

create policy "Users can update own obligations"
  on obligations for update using (auth.uid() = user_id);

create policy "Users can delete own obligations"
  on obligations for delete using (auth.uid() = user_id);

create index if not exists idx_obligations_deadline on obligations(user_id, deadline);

create trigger obligations_updated_at
  before update on obligations
  for each row execute function update_updated_at();

-- Phase 1 Step 4: set submitted_at on transition into `submitted`.
create or replace function set_obligation_submitted_at()
returns trigger as $$
begin
  if new.status = 'submitted' then
    if tg_op = 'INSERT' then
      if new.submitted_at is null then
        new.submitted_at = now();
      end if;
    else
      if old.status is distinct from 'submitted' then
        new.submitted_at = now();
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists obligations_set_submitted_at on obligations;
create trigger obligations_set_submitted_at
  before insert or update on obligations
  for each row execute function set_obligation_submitted_at();

create index if not exists idx_obligations_submitted_at on obligations(user_id, submitted_at) where status = 'submitted';

-- Phase 3 Step 4: Irreversible terminal states (failed, verified)
create or replace function enforce_obligation_irreversible_states()
returns trigger as $$
begin
  if old.status in ('failed', 'verified') and new.status is distinct from old.status then
    raise exception 'Irreversible: status % cannot transition to %.', old.status, new.status;
  end if;

  -- Preserve failure record fields
  if old.status = 'failed' then
    if new.deadline is distinct from old.deadline then
      raise exception 'Irreversible: failed obligation deadline cannot change.';
    end if;
    if new.proof_required is distinct from old.proof_required then
      raise exception 'Irreversible: failed obligation proof state cannot change.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists obligations_enforce_irreversible on obligations;
create trigger obligations_enforce_irreversible
  before update on obligations
  for each row execute function enforce_obligation_irreversible_states();

-- Phase 3 Step 4: Terminal timestamps
create or replace function set_obligation_terminal_timestamps()
returns trigger as $$
begin
  if new.status = 'failed' then
    if old.status is distinct from 'failed' then
      new.failed_at = now();
    end if;
  end if;
  if new.status = 'verified' then
    if old.status is distinct from 'verified' then
      new.verified_at = now();
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists obligations_set_terminal_timestamps on obligations;
create trigger obligations_set_terminal_timestamps
  before update on obligations
  for each row execute function set_obligation_terminal_timestamps();

-- ==========================================
-- Phase 1 Step 4: Obligation-linked follow-up drafts (controlled automation)
-- ==========================================
-- Drafts are persisted as first-class objects in `follow_ups` and are ALWAYS human-approved before sending.
-- Guardrail: this system MUST NOT auto-send.
alter table follow_ups alter column school_id drop not null;
alter table follow_ups add column if not exists obligation_id uuid references obligations on delete cascade;

-- Extend allowed follow_up_type set for obligation recovery drafts.
alter table follow_ups drop constraint if exists follow_ups_follow_up_type_check;
alter table follow_ups add constraint follow_ups_follow_up_type_check
  check (follow_up_type in ('email_draft', 'status_inquiry', 'obligation_proof_missing'));

-- Drafts use status='draft' (Phase 1 Step 4). Existing flows may also use pending_approval.
alter table follow_ups drop constraint if exists follow_ups_status_check;
alter table follow_ups add constraint follow_ups_status_check
  check (status in ('draft', 'pending_approval', 'approved', 'sent', 'cancelled'));

create index if not exists idx_follow_ups_obligation_id on follow_ups(obligation_id);

-- Guardrail: only one active proof-missing draft per obligation (prevents auto-chaining).
create unique index if not exists uniq_follow_ups_obligation_proof_missing_active
  on follow_ups(user_id, obligation_id)
  where follow_up_type = 'obligation_proof_missing'
    and status in ('draft', 'pending_approval', 'approved');

-- ==========================================
-- 9. Obligation Proofs (append-only evidence)
-- ==========================================
-- Proofs are first-class evidence artifacts. They are append-only.
create table if not exists obligation_proofs (
  id uuid default gen_random_uuid() primary key,
  obligation_id uuid references obligations on delete cascade not null,
  type text not null check (type in ('receipt', 'confirmation_email', 'portal_screenshot', 'file_upload')),
  source_ref text not null,
  created_at timestamptz not null default now()
);

alter table obligation_proofs enable row level security;

create policy "Users can view own obligation proofs"
  on obligation_proofs for select using (
    exists (
      select 1 from obligations o
      where o.id = obligation_proofs.obligation_id
        and o.user_id = auth.uid()
    )
  );

create policy "Users can insert own obligation proofs"
  on obligation_proofs for insert with check (
    exists (
      select 1 from obligations o
      where o.id = obligation_proofs.obligation_id
        and o.user_id = auth.uid()
    )
  );

create index if not exists idx_obligation_proofs_obligation_id on obligation_proofs(obligation_id);

-- Proofs are append-only: block updates and deletes at the database level.
create or replace function prevent_obligation_proof_mutation()
returns trigger as $$
begin
  raise exception 'obligation_proofs are append-only';
end;
$$ language plpgsql;

drop trigger if exists obligation_proofs_no_update on obligation_proofs;
create trigger obligation_proofs_no_update
  before update on obligation_proofs
  for each row execute function prevent_obligation_proof_mutation();

drop trigger if exists obligation_proofs_no_delete on obligation_proofs;
create trigger obligation_proofs_no_delete
  before delete on obligation_proofs
  for each row execute function prevent_obligation_proof_mutation();

-- Enforce: proof_required obligations cannot be verified without at least one proof.
create or replace function enforce_obligation_proof_on_verification()
returns trigger as $$
declare
  has_proof boolean;
begin
  if new.status = 'verified' and new.proof_required = true then
    select exists(
      select 1 from obligation_proofs p
      where p.obligation_id = new.id
    ) into has_proof;

    if not has_proof then
      raise exception 'Cannot set obligation to verified: proof_required=true but no proofs exist';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists obligations_enforce_proof_on_verification on obligations;
create trigger obligations_enforce_proof_on_verification
  before insert or update on obligations
  for each row execute function enforce_obligation_proof_on_verification();

-- Minimal integrity: confirmation_email proofs must reference a real analyzed email gmail_id for the same user.
create or replace function validate_confirmation_email_proof()
returns trigger as $$
declare
  obligation_user_id uuid;
  email_exists boolean;
begin
  if new.type = 'confirmation_email' then
    select user_id into obligation_user_id from obligations where id = new.obligation_id;
    if obligation_user_id is null then
      raise exception 'Invalid obligation_id for proof';
    end if;

    select exists(
      select 1 from analyzed_emails e
      where e.user_id = obligation_user_id
        and e.gmail_id = new.source_ref
    ) into email_exists;

    if not email_exists then
      raise exception 'confirmation_email proof must reference an existing analyzed_emails.gmail_id';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists obligation_proofs_validate_confirmation_email on obligation_proofs;
create trigger obligation_proofs_validate_confirmation_email
  before insert on obligation_proofs
  for each row execute function validate_confirmation_email_proof();


-- ==========================================
-- 10. Phase 2 Step 1: Obligation Dependencies (hardcoded ordering constraints)
-- ==========================================
--
-- WHY DEPENDENCIES ARE HARDCODED:
-- The real world has ordering constraints that cannot be violated.
-- You cannot deposit for housing before being accepted.
-- You cannot submit an application before paying the fee.
-- These are FACTS, not predictions. There is no AI here.
--
-- WHY AI INFERENCE IS INTENTIONALLY AVOIDED:
-- AI would try to "discover" dependencies from data patterns.
-- That is wrong. A student who pays a fee after submitting (by mistake)
-- does not create a new valid ordering. The constraint is physical, not statistical.
--
-- WHY THIS IS SAFER THAN "SMART" AUTOMATION:
-- A hardcoded map can be audited in 30 seconds.
-- An inferred dependency graph requires explaining the model.
-- If there is doubt, block. That is the rule.

-- Extend obligation types to support dependency graph nodes.
-- New types: ACCEPTANCE, SCHOLARSHIP_DISBURSEMENT, ENROLLMENT, ENROLLMENT_DEPOSIT, SCHOLARSHIP_ACCEPTANCE
-- Existing types remain unchanged for backwards compatibility.
alter table obligations drop constraint if exists obligations_type_check;
alter table obligations add constraint obligations_type_check
  check (type in (
    'FAFSA',
    'APPLICATION_FEE',
    'APPLICATION_SUBMISSION',
    'HOUSING_DEPOSIT',
    'SCHOLARSHIP',
    'ACCEPTANCE',
    'SCHOLARSHIP_DISBURSEMENT',
    'ENROLLMENT',
    'ENROLLMENT_DEPOSIT',
    'SCHOLARSHIP_ACCEPTANCE'
  ));

-- Obligation dependencies: explicit edges between obligation instances.
-- These are NOT inferred. They are created from hardcoded rules or manually.
create table if not exists obligation_dependencies (
  id uuid default gen_random_uuid() primary key,
  obligation_id uuid references obligations on delete cascade not null,
  depends_on_obligation_id uuid references obligations on delete cascade not null,
  created_at timestamptz not null default now(),

  -- Prevent duplicate edges
  constraint obligation_dependencies_unique unique (obligation_id, depends_on_obligation_id),
  -- Prevent self-referencing
  constraint obligation_dependencies_no_self check (obligation_id != depends_on_obligation_id)
);

alter table obligation_dependencies enable row level security;

create policy "Users can view own obligation dependencies"
  on obligation_dependencies for select using (
    exists (
      select 1 from obligations o
      where o.id = obligation_dependencies.obligation_id
        and o.user_id = auth.uid()
    )
  );

create policy "Users can insert own obligation dependencies"
  on obligation_dependencies for insert with check (
    exists (
      select 1 from obligations o
      where o.id = obligation_dependencies.obligation_id
        and o.user_id = auth.uid()
    )
  );

create policy "Users can delete own obligation dependencies"
  on obligation_dependencies for delete using (
    exists (
      select 1 from obligations o
      where o.id = obligation_dependencies.obligation_id
        and o.user_id = auth.uid()
    )
  );

create index if not exists idx_obligation_deps_obligation_id
  on obligation_dependencies(obligation_id);
create index if not exists idx_obligation_deps_depends_on
  on obligation_dependencies(depends_on_obligation_id);

-- Database-level enforcement: prevent transitioning to submitted/verified
-- if any dependency is not verified. This is the safety net.
create or replace function enforce_obligation_dependencies()
returns trigger as $$
declare
  unmet_dep record;
begin
  -- Only check on transitions to submitted or verified
  if new.status in ('submitted', 'verified') then
    select d.depends_on_obligation_id, o.type, o.status
    into unmet_dep
    from obligation_dependencies d
    join obligations o on o.id = d.depends_on_obligation_id
    where d.obligation_id = new.id
      and o.status != 'verified'
    limit 1;

    if found then
      raise exception 'Blocked: obligation depends on % (type: %, status: %). Complete it first.',
        unmet_dep.depends_on_obligation_id, unmet_dep.type, unmet_dep.status;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists obligations_enforce_dependencies on obligations;
create trigger obligations_enforce_dependencies
  before update on obligations
  for each row execute function enforce_obligation_dependencies();


-- ==========================================
-- 11. Phase 2 Step 3: Obligation Overrides (audited exceptions)
-- ==========================================
--
-- WHY OVERRIDES EXIST:
-- The dependency system blocks dangerous transitions. That is correct.
-- But reality has edge cases: a school waives a fee, a deadline is extended,
-- a prerequisite is satisfied through an alternate path.
--
-- Overrides let a user bypass a specific dependency block.
-- They are NOT shortcuts. They are AUDITED EXCEPTIONS.
--
-- IMMUTABILITY RULE:
-- Overrides are append-only. No edits. No deletes.
-- Once an override is recorded, it cannot be erased.
-- The system remembers every exception that was made.
--
-- GUARDRAILS (ENFORCED AT EVERY LAYER):
-- - No bulk overrides. One dependency override per request.
-- - No auto-overrides. The system NEVER creates overrides on its own.
-- - No AI-suggested overrides. Override decisions are human-only.
-- - No "always allow" patterns. Each override is for one specific edge.
-- - User must provide a reason. Empty reasons are rejected.

create table if not exists obligation_overrides (
  id uuid default gen_random_uuid() primary key,

  -- The obligation that was blocked
  obligation_id uuid references obligations on delete cascade not null,

  -- The specific dependency that was overridden
  overridden_dependency_id uuid references obligations on delete cascade not null,

  -- Why the user chose to override. Required. Empty strings rejected.
  user_reason text not null check (length(trim(user_reason)) > 0),

  -- Immutable timestamp
  created_at timestamptz not null default now(),

  -- Prevent duplicate overrides on the same edge.
  -- One override per (obligation, dependency) pair is sufficient.
  constraint obligation_overrides_unique unique (obligation_id, overridden_dependency_id)
);

alter table obligation_overrides enable row level security;

-- Users can view their own overrides (via obligation ownership)
create policy "Users can view own obligation overrides"
  on obligation_overrides for select using (
    exists (
      select 1 from obligations o
      where o.id = obligation_overrides.obligation_id
        and o.user_id = auth.uid()
    )
  );

-- Users can insert overrides for their own obligations
create policy "Users can insert own obligation overrides"
  on obligation_overrides for insert with check (
    exists (
      select 1 from obligations o
      where o.id = obligation_overrides.obligation_id
        and o.user_id = auth.uid()
    )
  );

-- NO update policy. Overrides are immutable.
-- NO delete policy. Overrides are permanent.

create index if not exists idx_obligation_overrides_obligation_id
  on obligation_overrides(obligation_id);
create index if not exists idx_obligation_overrides_dependency_id
  on obligation_overrides(overridden_dependency_id);

-- Append-only enforcement: block updates and deletes at the database level.
-- Same pattern as obligation_proofs. If code tries to edit or remove an override,
-- the database itself prevents it. This is the deepest layer of protection.
create or replace function prevent_obligation_override_mutation()
returns trigger as $$
begin
  raise exception 'obligation_overrides are append-only. No edits. No deletes.';
end;
$$ language plpgsql;

drop trigger if exists obligation_overrides_no_update on obligation_overrides;
create trigger obligation_overrides_no_update
  before update on obligation_overrides
  for each row execute function prevent_obligation_override_mutation();

drop trigger if exists obligation_overrides_no_delete on obligation_overrides;
create trigger obligation_overrides_no_delete
  before delete on obligation_overrides
  for each row execute function prevent_obligation_override_mutation();

-- ==========================================
-- 12. Phase 2 Step 4: Stuck Detection (structural immobility)
-- ==========================================
--
-- WHY STUCK DETECTION EXISTS:
-- A system that blocks without explanation gets abandoned.
-- A system that explains deadlock becomes trusted.
--
-- WHAT "STUCK" MEANS:
-- An obligation is STUCK when:
--   1. status = pending OR blocked
--   2. All forward paths are blocked (deps unmet, proof missing, etc.)
--   3. No status change has occurred in STALE_DAYS (default: 5)
--
-- This is NOT inactivity. This is structural immobility.
--
-- STUCK STATE IS SYSTEM-DERIVED:
-- Users cannot set stuck = true. The system computes it.
-- The stuck detection endpoint evaluates and persists stuck state.
--
-- GUARDRAILS:
-- - No auto-un-sticking. Only a status change clears stuck.
-- - No auto-overrides. Stuck detection does not resolve blocks.
-- - No AI explanations. Only factual state descriptions.
-- - No hiding stuck state after override. Overrides don't clear stuck.

-- Track when status actually changed (not just any field update).
-- This is critical: the updated_at trigger fires on ANY update (including stuck field updates).
-- status_changed_at only changes when the actual status enum changes.
alter table obligations add column if not exists status_changed_at timestamptz default now();

create or replace function set_obligation_status_changed_at()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.status_changed_at = now();
  elsif new.status is distinct from old.status then
    new.status_changed_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists obligations_set_status_changed_at on obligations;
create trigger obligations_set_status_changed_at
  before insert or update on obligations
  for each row execute function set_obligation_status_changed_at();

-- Stuck state columns. System-derived. Not user-editable.
alter table obligations add column if not exists stuck boolean not null default false;
alter table obligations add column if not exists stuck_reason text check (stuck_reason is null or stuck_reason in (
  'unmet_dependency',
  'overridden_dependency',
  'missing_proof',
  'external_verification_pending',
  'hard_deadline_passed'
));
alter table obligations add column if not exists stuck_since timestamptz;

-- Index for querying stuck obligations
create index if not exists idx_obligations_stuck on obligations(user_id, stuck) where stuck = true;


-- ==========================================
-- 13. Phase 3 Step 1: Severity (deterministic consequence level)
-- ==========================================
--
-- WHY SEVERITY EXISTS:
-- Escalation (Phase 1 Step 5) drives BEHAVIORAL checks (blocking verification).
-- Severity drives VISUAL treatment (badges, row colors, stat cards).
-- Both are deterministic. Both are arithmetic. They serve different purposes.
--
-- SEVERITY IS NOT USER-EDITABLE.
-- The system derives severity from: deadline distance, stuck state, verification state.
-- If the facts change, severity changes. Users cannot override severity.
--
-- FIVE LEVELS (EXACT LIST):
-- normal, elevated, high, critical, failed
-- No others. No "medium." No "warning." No "info."
--
-- PERSISTENCE:
-- severity, severity_since, severity_reason are system-derived columns.
-- severity_reason is a single dominant cause string, not prose.
-- The stuck detection endpoint computes and persists severity alongside stuck state.

alter table obligations add column if not exists severity text not null default 'normal'
  check (severity in ('normal', 'elevated', 'high', 'critical', 'failed'));

alter table obligations add column if not exists severity_since timestamptz;

alter table obligations add column if not exists severity_reason text check (severity_reason is null or severity_reason in (
  'verified',
  'deadline_passed',
  'stuck_deadline_imminent',
  'deadline_imminent',
  'stuck_deadline_approaching',
  'deadline_approaching',
  'stuck_no_deadline_pressure',
  'no_pressure'
));

-- Index for querying obligations by severity (e.g., "show me all critical/failed")
create index if not exists idx_obligations_severity on obligations(user_id, severity)
  where severity in ('high', 'critical', 'failed');


-- ==========================================
-- 14. Phase 3 Step 4: Obligation History (append-only)
-- ==========================================
-- Records irreversible changes and severity evolution.
-- No deletes. No updates. Append-only audit.
create table if not exists obligation_history (
  id uuid default gen_random_uuid() primary key,
  obligation_id uuid references obligations(id) on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  event_type text not null check (event_type in ('status_change', 'severity_change', 'reattempt_created', 'propagation_unblocked')),
  prev_status text,
  new_status text,
  prev_severity text,
  new_severity text,
  reason text,
  actor_user_id uuid references auth.users,
  created_at timestamptz not null default now()
);

create index if not exists idx_obligation_history_obligation on obligation_history(obligation_id, created_at);

alter table obligation_history enable row level security;

create policy "Users can view own obligation history"
  on obligation_history for select using (auth.uid() = user_id);

create policy "Users can insert own obligation history"
  on obligation_history for insert with check (auth.uid() = user_id);

create or replace function log_obligation_status_change()
returns trigger as $$
begin
  if new.status is distinct from old.status then
    insert into obligation_history (
      obligation_id, user_id, event_type,
      prev_status, new_status, reason, actor_user_id
    ) values (
      new.id, new.user_id, 'status_change',
      old.status, new.status,
      case
        when new.status = 'failed' then 'deadline_passed'
        when new.status = 'verified' then 'verified'
        else null
      end,
      auth.uid()
    );
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function log_obligation_severity_change()
returns trigger as $$
begin
  if new.severity is distinct from old.severity then
    insert into obligation_history (
      obligation_id, user_id, event_type,
      prev_severity, new_severity, reason, actor_user_id
    ) values (
      new.id, new.user_id, 'severity_change',
      old.severity, new.severity, new.severity_reason, auth.uid()
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists obligations_log_status_change on obligations;
create trigger obligations_log_status_change
  after update on obligations
  for each row execute function log_obligation_status_change();

drop trigger if exists obligations_log_severity_change on obligations;
create trigger obligations_log_severity_change
  after update on obligations
  for each row execute function log_obligation_severity_change();


-- ==========================================
-- 15. Phase 4 Step 1: Obligation Steps (FAFSA + SCHOLARSHIP only)
-- ==========================================
create table if not exists obligation_steps (
  id uuid default gen_random_uuid() primary key,
  obligation_id uuid references obligations(id) on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  step_type text not null check (step_type in (
    'FAFSA_SUBMITTED',
    'FAFSA_PROCESSED',
    'SCHOOL_RECEIVED',
    'APPLICATION_SUBMITTED',
    'ACCEPTANCE_CONFIRMED'
  )),
  status text not null default 'pending' check (status in ('pending', 'completed', 'blocked')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_obligation_steps_obligation on obligation_steps(obligation_id, created_at);

alter table obligation_steps enable row level security;

create policy "Users can view own obligation steps"
  on obligation_steps for select using (auth.uid() = user_id);

create policy "Users can insert own obligation steps"
  on obligation_steps for insert with check (auth.uid() = user_id);

create policy "Users can update own obligation steps"
  on obligation_steps for update using (auth.uid() = user_id);

-- Create steps lazily on next write for FAFSA/SCHOLARSHIP only.
create or replace function ensure_obligation_steps()
returns trigger as $$
declare
  step_count int;
begin
  if new.type not in ('FAFSA', 'SCHOLARSHIP') then
    return new;
  end if;

  select count(*) into step_count
  from obligation_steps
  where obligation_id = new.id;

  if step_count = 0 then
    if new.type = 'FAFSA' then
      insert into obligation_steps (obligation_id, user_id, step_type, status)
      values
        (new.id, new.user_id, 'FAFSA_SUBMITTED', 'pending'),
        (new.id, new.user_id, 'FAFSA_PROCESSED', 'pending'),
        (new.id, new.user_id, 'SCHOOL_RECEIVED', 'pending');
    elsif new.type = 'SCHOLARSHIP' then
      insert into obligation_steps (obligation_id, user_id, step_type, status)
      values
        (new.id, new.user_id, 'APPLICATION_SUBMITTED', 'pending'),
        (new.id, new.user_id, 'ACCEPTANCE_CONFIRMED', 'pending');
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists obligations_ensure_steps on obligations;
create trigger obligations_ensure_steps
  after insert or update on obligations
  for each row execute function ensure_obligation_steps();

-- Enforce step order: only the next pending step can be completed.
create or replace function enforce_step_order()
returns trigger as $$
declare
  earliest_pending uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select id into earliest_pending
    from obligation_steps
    where obligation_id = new.obligation_id
      and status = 'pending'
    order by created_at asc
    limit 1;

    if earliest_pending is not null and earliest_pending != new.id then
      raise exception 'Out of order: complete the next pending step first.';
    end if;

    new.completed_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists obligation_steps_enforce_order on obligation_steps;
create trigger obligation_steps_enforce_order
  before update on obligation_steps
  for each row execute function enforce_step_order();

-- Block verification if any required steps remain incomplete.
create or replace function enforce_steps_before_verification()
returns trigger as $$
declare
  incomplete_count int;
begin
  if new.status = 'verified' and new.type in ('FAFSA', 'SCHOLARSHIP') then
    select count(*) into incomplete_count
    from obligation_steps
    where obligation_id = new.id
      and status != 'completed';

    if incomplete_count > 0 then
      raise exception 'Blocked: all required steps must be completed before verification.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists obligations_enforce_steps_verification on obligations;
create trigger obligations_enforce_steps_verification
  before update on obligations
  for each row execute function enforce_steps_before_verification();


-- Update the dependency enforcement trigger to respect overrides.
-- A dependency is "met" if EITHER:
--   (a) the dependency obligation has status = 'verified', OR
--   (b) an override exists for that specific (obligation, dependency) pair.
-- Overrides remove the hard block. They do NOT remove accountability.
create or replace function enforce_obligation_dependencies()
returns trigger as $$
declare
  unmet_dep record;
begin
  if new.status in ('submitted', 'verified') then
    select d.depends_on_obligation_id, o.type, o.status
    into unmet_dep
    from obligation_dependencies d
    join obligations o on o.id = d.depends_on_obligation_id
    where d.obligation_id = new.id
      and o.status != 'verified'
      -- Phase 2 Step 3: Exclude overridden dependencies from blocking
      and not exists (
        select 1 from obligation_overrides ov
        where ov.obligation_id = new.id
          and ov.overridden_dependency_id = d.depends_on_obligation_id
      )
    limit 1;

    if found then
      raise exception 'Blocked: obligation depends on % (type: %, status: %). Complete it first.',
        unmet_dep.depends_on_obligation_id, unmet_dep.type, unmet_dep.status;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;


-- ==========================================
-- 16. Phase 6: Non-Cooperative Inputs (minimal)
-- ==========================================
create table if not exists uploads (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  bucket text not null,
  path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists intake_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  source text not null check (source in ('portal_paste', 'screenshot', 'pdf')),
  raw_text text,
  upload_id uuid references uploads on delete set null,
  status text not null default 'pending' check (status in ('pending', 'extracted', 'confirmed', 'discarded', 'error')),
  created_at timestamptz not null default now()
);

create table if not exists intake_extractions (
  id uuid default gen_random_uuid() primary key,
  intake_item_id uuid references intake_items on delete cascade not null,
  obligation_type_candidate text,
  institution_candidate text,
  deadline_candidate text,
  confidence numeric,
  fields jsonb,
  created_at timestamptz not null default now()
);

alter table uploads enable row level security;
alter table intake_items enable row level security;
alter table intake_extractions enable row level security;

create policy "Users can view own uploads"
  on uploads for select using (auth.uid() = user_id);
create policy "Users can insert own uploads"
  on uploads for insert with check (auth.uid() = user_id);
create policy "Users can update own uploads"
  on uploads for update using (auth.uid() = user_id);

create policy "Users can view own intake items"
  on intake_items for select using (auth.uid() = user_id);
create policy "Users can insert own intake items"
  on intake_items for insert with check (auth.uid() = user_id);
create policy "Users can update own intake items"
  on intake_items for update using (auth.uid() = user_id);

create policy "Users can view own intake extractions"
  on intake_extractions for select using (
    exists (select 1 from intake_items i where i.id = intake_extractions.intake_item_id and i.user_id = auth.uid())
  );
create policy "Users can insert own intake extractions"
  on intake_extractions for insert with check (
    exists (select 1 from intake_items i where i.id = intake_extractions.intake_item_id and i.user_id = auth.uid())
  );

-- Storage buckets (proofs, intake)
insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', false)
on conflict do nothing;

insert into storage.buckets (id, name, public)
values ('intake', 'intake', false)
on conflict do nothing;

-- Storage policies: users can read/write under their own prefix
create policy "proofs_read_own"
  on storage.objects for select
  using (bucket_id = 'proofs' and auth.uid()::text = split_part(name, '/', 1));
create policy "proofs_write_own"
  on storage.objects for insert
  with check (bucket_id = 'proofs' and auth.uid()::text = split_part(name, '/', 1));
create policy "proofs_update_own"
  on storage.objects for update
  using (bucket_id = 'proofs' and auth.uid()::text = split_part(name, '/', 1));
create policy "proofs_delete_own"
  on storage.objects for delete
  using (bucket_id = 'proofs' and auth.uid()::text = split_part(name, '/', 1));

create policy "intake_read_own"
  on storage.objects for select
  using (bucket_id = 'intake' and auth.uid()::text = split_part(name, '/', 1));
create policy "intake_write_own"
  on storage.objects for insert
  with check (bucket_id = 'intake' and auth.uid()::text = split_part(name, '/', 1));
create policy "intake_update_own"
  on storage.objects for update
  using (bucket_id = 'intake' and auth.uid()::text = split_part(name, '/', 1));
create policy "intake_delete_own"
  on storage.objects for delete
  using (bucket_id = 'intake' and auth.uid()::text = split_part(name, '/', 1));

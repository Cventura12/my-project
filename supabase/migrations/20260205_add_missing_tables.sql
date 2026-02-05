-- Add missing tables referenced by the app: documents, analyzed_emails, obligations

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

create table if not exists analyzed_emails (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  gmail_id text,
  subject text,
  sender text,
  received_at timestamptz,
  snippet text,
  source_link text,
  requires_action boolean default false,
  summary text,
  action_needed text,
  deadline date,
  deadline_implied boolean default false,
  relevance text default 'low' check (relevance in ('high', 'medium', 'low', 'none')),
  category text check (category in ('financial_aid', 'deadline', 'document_request', 'status_update', 'general', null)),
  school_match text,
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

create index if not exists idx_analyzed_emails_gmail_id on analyzed_emails(user_id, gmail_id);
create index if not exists idx_analyzed_emails_action on analyzed_emails(user_id, requires_action, is_dismissed);

create table if not exists obligations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  type text not null check (type in (
    'FAFSA',
    'APPLICATION_FEE',
    'APPLICATION_SUBMISSION',
    'HOUSING_DEPOSIT',
    'SCHOLARSHIP',
    'ENROLLMENT_DEPOSIT',
    'SCHOLARSHIP_ACCEPTANCE'
  )),
  title text not null,
  source text not null check (source in ('email', 'manual')),
  source_ref text not null,
  deadline timestamptz,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'verified', 'blocked', 'failed')),
  proof_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  failed_at timestamptz,
  verified_at timestamptz,
  prior_failed_obligation_id uuid references obligations(id),
  constraint obligations_source_ref_unique unique (user_id, source, source_ref)
);

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

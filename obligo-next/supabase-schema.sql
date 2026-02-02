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

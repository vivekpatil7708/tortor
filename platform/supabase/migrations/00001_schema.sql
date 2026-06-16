-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Merchants
create table merchants (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  phone text unique not null,
  password_hash text not null,
  business_name text not null default '',
  business_logo_url text,
  brand_color_primary text not null default '#7bb86c',
  brand_color_secondary text not null default '#2c2c2c',
  brand_font text not null default 'Inter',
  button_style text not null default 'rounded',
  page_theme text not null default 'cream',
  custom_domain text,
  bg_image_url text,
  onboarding_complete boolean not null default false,
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- UPI IDs
create table upi_ids (
  id uuid primary key default uuid_generate_v4(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  vpa text not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique(merchant_id, vpa)
);

-- Payment Links
create table payment_links (
  id uuid primary key default uuid_generate_v4(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  upi_id text not null,
  title text not null,
  description text,
  amount numeric(10,2),
  amount_flexible boolean not null default false,
  min_amount numeric(10,2),
  max_amount numeric(10,2),
  button_text text,
  custom_fields jsonb not null default '[]'::jsonb,
  expiry_at timestamptz,
  max_uses integer,
  use_count integer not null default 0,
  redirect_url text,
  webhook_url text,
  slug text unique not null,
  status text not null default 'active' check (status in ('active','inactive','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Templates
create table templates (
  id uuid primary key default uuid_generate_v4(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Transactions
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  payment_link_id uuid references payment_links(id) on delete set null,
  txn_id text unique not null,
  upi_txn_id text,
  amount numeric(10,2) not null,
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_note text,
  custom_field_values jsonb not null default '{}'::jsonb,
  status text not null default 'initiated' check (status in ('initiated','pending','success','failed','refunded')),
  settlement_status text not null default 'pending' check (settlement_status in ('pending','processing','settled')),
  settlement_amount numeric(10,2),
  settlement_date timestamptz,
  payment_app text,
  payer_vpa text,
  upi_payment_ref text,
  error_message text,
  ip_address text,
  user_agent text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Webhook Logs
create table webhook_logs (
  id uuid primary key default uuid_generate_v4(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete cascade,
  url text not null,
  payload jsonb not null default '{}'::jsonb,
  response_code integer,
  response_body text,
  delivered_at timestamptz,
  next_retry_at timestamptz,
  retry_count integer not null default 0,
  status text not null default 'pending' check (status in ('pending','delivered','failed'))
);

-- API Keys
create table api_keys (
  id uuid primary key default uuid_generate_v4(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  name text not null,
  key_hash text not null,
  key_prefix text not null,
  scopes jsonb not null default '["read"]'::jsonb,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Merchant Settings
create table merchant_settings (
  merchant_id uuid primary key references merchants(id) on delete cascade,
  sms_enabled boolean not null default false,
  email_enabled boolean not null default false,
  auto_settlement boolean not null default true,
  settlement_frequency text not null default 'daily' check (settlement_frequency in ('daily','weekly','monthly')),
  notification_email text,
  notification_phone text,
  webhook_secret text,
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_payment_links_merchant on payment_links(merchant_id);
create index idx_payment_links_slug on payment_links(slug);
create index idx_transactions_merchant on transactions(merchant_id);
create index idx_transactions_link on transactions(payment_link_id);
create index idx_transactions_txn on transactions(txn_id);
create index idx_transactions_status on transactions(status);
create index idx_transactions_created on transactions(created_at desc);
create index idx_upi_ids_merchant on upi_ids(merchant_id);

-- Functions
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_merchants_updated_at
  before update on merchants for each row execute function update_updated_at();

create trigger update_payment_links_updated_at
  before update on payment_links for each row execute function update_updated_at();

create trigger update_transactions_updated_at
  before update on transactions for each row execute function update_updated_at();

-- Audit Logs
create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  merchant_id uuid references merchants(id) on delete set null,
  email text not null,
  action text not null check (action in ('signup','login','logout')),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

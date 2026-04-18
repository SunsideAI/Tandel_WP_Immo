-- Tandel Propstack Sync: Mapping- und Log-Tabellen
-- Projekt: ctucmljvatphzgnfhycu

create table if not exists public.sync_mappings (
    propstack_id       bigint primary key,
    wp_post_id         bigint not null,
    propstack_unit_id  text,
    last_synced_at     timestamptz not null default now()
);

create index if not exists sync_mappings_wp_post_id_idx
    on public.sync_mappings (wp_post_id);

create table if not exists public.sync_image_mappings (
    propstack_image_id     bigint primary key,
    wp_media_id            bigint not null,
    propstack_property_id  bigint not null,
    created_at             timestamptz not null default now()
);

create index if not exists sync_image_mappings_property_idx
    on public.sync_image_mappings (propstack_property_id);

create table if not exists public.sync_log (
    id             bigserial primary key,
    propstack_id   bigint,
    status         text not null check (status in ('success', 'failed')),
    error_message  text,
    created_at     timestamptz not null default now()
);

create index if not exists sync_log_created_at_idx
    on public.sync_log (created_at desc);

create index if not exists sync_log_status_created_at_idx
    on public.sync_log (status, created_at desc);

-- RLS: der Service nutzt den service_role Key und umgeht RLS.
-- Fuer direkte Reads aus einem Dashboard Views/Policies spaeter ergaenzen.
alter table public.sync_mappings enable row level security;
alter table public.sync_image_mappings enable row level security;
alter table public.sync_log enable row level security;

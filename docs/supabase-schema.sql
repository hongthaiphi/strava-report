-- Chạy file này trong Supabase SQL Editor

create table if not exists activities (
  id              bigserial primary key,
  strava_id       text unique not null,
  club_id         text not null,
  athlete_firstname text,
  athlete_lastname  text,
  type            text,
  distance        float default 0,
  moving_time     int   default 0,
  elapsed_time    int   default 0,
  total_elevation_gain float default 0,
  start_date      timestamptz,
  created_at      timestamptz default now()
);

create index if not exists idx_activities_club_id on activities(club_id);
create index if not exists idx_activities_start_date on activities(start_date desc);

create table if not exists sync_log (
  club_id   text primary key,
  synced_at timestamptz default now()
);

-- Row Level Security: cho phép anon key đọc/ghi (internal tool)
alter table activities enable row level security;
alter table sync_log enable row level security;

create policy "allow all" on activities for all using (true) with check (true);
create policy "allow all" on sync_log for all using (true) with check (true);

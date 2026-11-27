-- FGO × Supabase 資料表（Supabase 版 server.js 使用）
-- 使用方式：Supabase → SQL Editor → New query → 整份貼上 → Run（只需執行一次）
-- 設計：遊戲前端只連你的 Node 伺服器；Node 伺服器用 service_role key 讀寫資料庫（繞過 RLS）。
--       所以所有表都開 RLS 且「不建任何 policy」＝ 外部用 anon key 完全讀不到、寫不進去。
-- 帳號密碼交給 Supabase Auth（伺服器註冊時以 admin API 建立，username 放在 user_metadata）。

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null check (char_length(username) between 2 and 16),
  role        text not null default 'player' check (role in ('player','gm')),
  rating      int  not null default 1000,
  w int not null default 0, l int not null default 0, d int not null default 0,
  created_at  timestamptz not null default now()
);
create unique index profiles_username_lower on public.profiles (lower(username));   -- 帳號不分大小寫

-- 伺服器私有狀態：擁有的角色（選角驗證用）、每日榮譽統計
create table public.player_state (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  owned       jsonb,
  honor_day   text,
  honor_n     int not null default 0
);

create table public.saves (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  rev         int  not null default 0,
  updated_at  timestamptz not null default now(),
  blob        jsonb not null            -- 遊戲存檔 JSON（owned、wallet、tut …）
);

alter table public.profiles     enable row level security;
alter table public.player_state enable row level security;
alter table public.saves        enable row level security;
-- 故意不建立任何 policy：只有 service_role（你的 Node 伺服器）能存取。

-- 註冊後自動建立 profile（username 取自 user_metadata.username）
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 貨幣上限 999999：寫入存檔時把 wallet 每個欄位夾在 0～999999（對應 server.js 的 CURRENCY_CAP）
create or replace function public.clamp_wallet() returns trigger language plpgsql as $$
declare k text; v numeric; w jsonb;
begin
  if new.blob ? 'wallet' and jsonb_typeof(new.blob->'wallet') = 'object' then
    w := new.blob->'wallet';
    for k, v in select key, case when jsonb_typeof(value) = 'number' then (value #>> '{}')::numeric else 0 end
                from jsonb_each(w) loop
      w := jsonb_set(w, array[k], to_jsonb(least(999999, greatest(0, floor(v)))));
    end loop;
    new.blob := jsonb_set(new.blob, '{wallet}', w);
  end if;
  return new;
end $$;
create trigger saves_clamp_wallet before insert or update on public.saves
  for each row execute function public.clamp_wallet();

-- GM 帳號不用手動建：伺服器第一次啟動會依 GM_USER／GM_PASS 自動建立並設為 role='gm'。

-- Base de datos de la app de inventario (Supabase).
-- Cópialo completo en Supabase → SQL Editor → New query → Run. Se puede correr más de una vez.
--
-- Todos los datos de la app viven en una sola tabla: cada renglón es un registro de alguna
-- "tabla" de la app (rollos, recepciones, inspecciones, ...), guardado como JSON.

create table if not exists public.registros (
  tabla           text        not null,
  id              text        not null,
  data            jsonb       not null,
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid        default auth.uid(),
  primary key (tabla, id)
);

-- Quién y cuándo modificó cada registro (lo pone la base de datos, no el celular)
create or replace function public.registros_marcar_cambio()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;

drop trigger if exists registros_marcar_cambio on public.registros;
create trigger registros_marcar_cambio
  before insert or update on public.registros
  for each row execute function public.registros_marcar_cambio();

-- Seguridad: solo usuarios con sesión iniciada pueden ver o cambiar datos.
-- (Nadie puede entrar sin una cuenta creada por ti en Authentication → Users.)
alter table public.registros enable row level security;

drop policy if exists "leer con sesion" on public.registros;
drop policy if exists "agregar con sesion" on public.registros;
drop policy if exists "cambiar con sesion" on public.registros;
drop policy if exists "borrar con sesion" on public.registros;

create policy "leer con sesion"    on public.registros for select to authenticated using (true);
create policy "agregar con sesion" on public.registros for insert to authenticated with check (true);
create policy "cambiar con sesion" on public.registros for update to authenticated using (true) with check (true);
create policy "borrar con sesion"  on public.registros for delete to authenticated using (true);

-- Tiempo real: que los cambios de un celular aparezcan en los demás al instante
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'registros'
  ) then
    alter publication supabase_realtime add table public.registros;
  end if;
end $$;

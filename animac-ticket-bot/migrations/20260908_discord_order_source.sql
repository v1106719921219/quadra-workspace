BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discord_guild_id text;
COMMENT ON COLUMN public.orders.discord_guild_id IS 'Source Discord guild for immutable notification routing; null legacy ANIMAC dc orders use TCG_ANIMAC.';
CREATE OR REPLACE FUNCTION public.validate_discord_order_source() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.discord_guild_id IS NOT NULL AND (
    NEW.tenant_id <> 'a0000000-0000-0000-0000-000000000001'::uuid OR
    NEW.discord_guild_id NOT IN ('1491756246456336554','1546607425069518909')
  ) THEN RAISE EXCEPTION 'Invalid Discord order source'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.discord_guild_id IS DISTINCT FROM OLD.discord_guild_id THEN
    RAISE EXCEPTION 'Discord order source cannot change after creation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_discord_order_source ON public.orders;
CREATE TRIGGER validate_discord_order_source BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.validate_discord_order_source();
COMMIT;

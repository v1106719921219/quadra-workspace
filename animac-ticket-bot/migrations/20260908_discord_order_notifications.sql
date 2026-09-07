BEGIN;
CREATE TABLE IF NOT EXISTS public.discord_order_notifications (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  pending boolean NOT NULL DEFAULT true,
  message_id text,
  attempted_at timestamptz,
  locked_until timestamptz,
  lease_token uuid,
  available_after timestamptz NOT NULL DEFAULT now() + interval '2 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);
ALTER TABLE public.discord_order_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discord_order_notifications FROM anon, authenticated;
GRANT ALL ON public.discord_order_notifications TO service_role;
CREATE INDEX IF NOT EXISTS discord_order_notifications_pending ON public.discord_order_notifications(tenant_id, available_after) WHERE pending;
CREATE OR REPLACE FUNCTION public.queue_animac_order_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.tenant_id = 'a0000000-0000-0000-0000-000000000001'::uuid AND NEW.channel = 'dc' THEN
    INSERT INTO public.discord_order_notifications(order_id,tenant_id) VALUES(NEW.id,NEW.tenant_id) ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.discord_order_notifications SET version=version+1,pending=true,available_after=now()+interval '2 minutes' WHERE order_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.queue_animac_order_notification() FROM PUBLIC;
DROP TRIGGER IF EXISTS queue_animac_order_notification ON public.orders;
CREATE TRIGGER queue_animac_order_notification AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.queue_animac_order_notification();
CREATE OR REPLACE FUNCTION public.queue_animac_order_item_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    UPDATE public.discord_order_notifications SET version=version+1,pending=true,available_after=now()+interval '2 minutes' WHERE order_id=OLD.order_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    UPDATE public.discord_order_notifications SET version=version+1,pending=true,available_after=now()+interval '2 minutes' WHERE order_id=NEW.order_id;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.queue_animac_order_item_notification() FROM PUBLIC;
DROP TRIGGER IF EXISTS queue_animac_order_item_notification ON public.order_items;
CREATE TRIGGER queue_animac_order_item_notification AFTER INSERT OR UPDATE OR DELETE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.queue_animac_order_item_notification();
COMMIT;

-- ─── ADMIN PINGS ────────────────────────────────────────────────────────────
-- Fun/personal touch: the "My Foods" menu item isn't built yet, so instead of
-- a dead "coming soon" row, tapping it lets the user "ping the admin" (fake —
-- no actual notification is sent) and shows a shared global counter of how
-- many times everyone has done this. Single-row table acting as a global
-- counter, bumped atomically via an RPC function so concurrent taps from
-- different users can't race and lose an increment.

CREATE TABLE public.admin_pings (
  id         SMALLINT PRIMARY KEY DEFAULT 1,
  count      BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_pings_singleton CHECK (id = 1)
);

INSERT INTO public.admin_pings (id, count) VALUES (1, 0);

ALTER TABLE public.admin_pings ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read the running total.
CREATE POLICY "Authenticated users can read ping count"
  ON public.admin_pings FOR SELECT USING (auth.role() = 'authenticated');

-- No direct INSERT/UPDATE/DELETE policy — writes only happen through the
-- increment_admin_ping() function below, which runs as SECURITY DEFINER.

-- ─── FUNCTION: Atomically increment the ping counter and return the new total ─
CREATE OR REPLACE FUNCTION public.increment_admin_ping()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  UPDATE public.admin_pings
  SET count = count + 1, updated_at = NOW()
  WHERE id = 1
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;

-- Let any authenticated client call the function (RLS on the table still
-- blocks them from writing directly — this is the only door in).
GRANT EXECUTE ON FUNCTION public.increment_admin_ping() TO authenticated;

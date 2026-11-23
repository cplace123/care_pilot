-- Apply after the Stage 3 Prisma migrations on the approved Supabase demo.
-- Supabase may grant new functions to API roles by default. Keep import RPC private.
REVOKE ALL ON FUNCTION import_allowed(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION import_allowed(uuid,text) TO carepilot_app;

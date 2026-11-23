-- Preserve authentication history when an identity has no active memberships.
-- INSERT only: these records cannot be selected by any tenant session.
CREATE POLICY unscoped_auth_insert ON "ActivityEvent" FOR INSERT WITH CHECK (
 "organisationId" IS NULL AND "actorId"::text = current_setting('app.user_id',true)
 AND action IN ('auth.login','auth.logout')
);

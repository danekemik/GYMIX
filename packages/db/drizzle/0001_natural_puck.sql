ALTER TABLE "devices" ADD COLUMN "installation_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_codes" ADD COLUMN "pending_password_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_refresh_hash_uq" ON "auth_sessions" USING btree ("refresh_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_user_installation_uq" ON "devices" USING btree ("user_id","installation_id");
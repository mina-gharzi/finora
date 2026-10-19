CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_purpose_check" CHECK ("auth_tokens"."purpose" in ('email_verify', 'password_reset'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_valid_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_token_hash_idx" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_id_purpose_idx" ON "auth_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens" USING btree ("expires_at");--> statement-breakpoint
-- Compatibility backfill for accounts that predate email verification.
--
-- Rationale: every existing account was created through the only registration
-- flow the product has ever shipped, and each owner has been operating the
-- account since. Verification is being introduced to protect *future*
-- sign-ups from typo'd or unowned addresses; retroactively treating all
-- legacy accounts as unverified would lock every existing user out of
-- financial mutations on deploy, with no in-product way to verify an address
-- that may genuinely control the mailbox. They are therefore marked verified
-- as of their registration time. Accounts created after this migration are
-- NOT auto-verified: the column defaults to NULL for new inserts.
--
-- The statement is idempotent (only touches rows still NULL) and runs in the
-- same transaction as the rest of the migration.
UPDATE "users"
SET "email_verified_at" = "created_at"
WHERE "email_verified_at" IS NULL;
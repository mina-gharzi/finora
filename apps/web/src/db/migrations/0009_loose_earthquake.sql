CREATE TABLE "mobile_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mobile_idempotency_keys_key_check" CHECK (length("mobile_idempotency_keys"."key") between 8 and 128)
);
--> statement-breakpoint
ALTER TABLE "mobile_idempotency_keys" ADD CONSTRAINT "mobile_idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_idempotency_keys_user_key_idx" ON "mobile_idempotency_keys" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "mobile_idempotency_keys_expires_at_idx" ON "mobile_idempotency_keys" USING btree ("expires_at");
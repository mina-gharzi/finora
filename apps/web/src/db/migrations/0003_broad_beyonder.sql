ALTER TABLE "auth_tokens" DROP CONSTRAINT "auth_tokens_purpose_check";--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD COLUMN "target_email" text;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_target_email_check" CHECK (("auth_tokens"."purpose" = 'email_change') = ("auth_tokens"."target_email" is not null));--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_purpose_check" CHECK ("auth_tokens"."purpose" in ('email_verify', 'password_reset', 'email_change'));
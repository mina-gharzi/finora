DROP INDEX "transactions_user_id_idx";--> statement-breakpoint
DROP INDEX "transactions_occurred_on_idx";--> statement-breakpoint
CREATE INDEX "transactions_user_id_occurred_on_created_at_idx" ON "transactions" USING btree ("user_id","occurred_on" DESC NULLS LAST,"created_at" DESC NULLS LAST);
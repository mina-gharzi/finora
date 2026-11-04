CREATE TABLE "recurring_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"frequency" text NOT NULL,
	"day_of_month" integer,
	"weekday" integer,
	"start_on" date NOT NULL,
	"end_on" date,
	"generated_through" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_transactions_type_check" CHECK ("recurring_transactions"."type" in ('income', 'expense')),
	CONSTRAINT "recurring_transactions_amount_check" CHECK ("recurring_transactions"."amount" > 0),
	CONSTRAINT "recurring_transactions_frequency_check" CHECK ("recurring_transactions"."frequency" in ('weekly', 'monthly')),
	CONSTRAINT "recurring_transactions_day_of_month_check" CHECK (("recurring_transactions"."frequency" = 'monthly') = ("recurring_transactions"."day_of_month" is not null) and ("recurring_transactions"."day_of_month" is null or ("recurring_transactions"."day_of_month" between 1 and 31))),
	CONSTRAINT "recurring_transactions_weekday_check" CHECK (("recurring_transactions"."frequency" = 'weekly') = ("recurring_transactions"."weekday" is not null) and ("recurring_transactions"."weekday" is null or ("recurring_transactions"."weekday" between 0 and 6))),
	CONSTRAINT "recurring_transactions_end_on_check" CHECK ("recurring_transactions"."end_on" is null or "recurring_transactions"."end_on" >= "recurring_transactions"."start_on")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_transactions_user_id_active_idx" ON "recurring_transactions" USING btree ("user_id","active");--> statement-breakpoint
CREATE INDEX "recurring_transactions_account_id_idx" ON "recurring_transactions" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_id_recurring_transactions_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_recurring_id_occurred_on_idx" ON "transactions" USING btree ("recurring_id","occurred_on");
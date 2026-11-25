CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"status" text NOT NULL,
	"marked_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"student_user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"correct" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"student_user_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_feedback" ADD CONSTRAINT "teacher_feedback_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_uq" ON "attendance_records" USING btree ("batch_id","student_user_id","on_date");
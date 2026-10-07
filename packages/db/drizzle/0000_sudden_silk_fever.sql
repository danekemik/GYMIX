CREATE TYPE "public"."exercise_confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."email_code_purpose" AS ENUM('signup', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."exercise_involvement" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."equipment_requirement" AS ENUM('required', 'optional');--> statement-breakpoint
CREATE TYPE "public"."exercise_muscle_role" AS ENUM('primary', 'secondary');--> statement-breakpoint
CREATE TYPE "public"."session_exercise_status" AS ENUM('pending', 'active', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."workout_session_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TABLE "anatomical_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	CONSTRAINT "anatomical_tags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"refresh_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "body_weight_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"measured_at" date NOT NULL,
	"value" numeric(5, 2) NOT NULL,
	"unit" text DEFAULT 'kg' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"purpose" "email_code_purpose" NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	CONSTRAINT "equipment_canonical_name_unique" UNIQUE("canonical_name")
);
--> statement-breakpoint
CREATE TABLE "equipment_aliases" (
	"alias" text NOT NULL,
	"equipment_id" uuid NOT NULL,
	CONSTRAINT "equipment_aliases_alias_equipment_id_pk" PRIMARY KEY("alias","equipment_id")
);
--> statement-breakpoint
CREATE TABLE "exercise_anatomical_tags" (
	"exercise_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "exercise_anatomical_tags_exercise_id_tag_id_pk" PRIMARY KEY("exercise_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "exercise_equipment" (
	"exercise_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"requirement" "equipment_requirement" DEFAULT 'required' NOT NULL,
	CONSTRAINT "exercise_equipment_exercise_id_equipment_id_pk" PRIMARY KEY("exercise_id","equipment_id")
);
--> statement-breakpoint
CREATE TABLE "exercise_movement_patterns" (
	"exercise_id" uuid NOT NULL,
	"movement_pattern_id" uuid NOT NULL,
	CONSTRAINT "exercise_movement_patterns_exercise_id_movement_pattern_id_pk" PRIMARY KEY("exercise_id","movement_pattern_id")
);
--> statement-breakpoint
CREATE TABLE "exercise_muscles" (
	"exercise_id" uuid NOT NULL,
	"muscle_group_id" uuid NOT NULL,
	"role" "exercise_muscle_role" NOT NULL,
	"position" integer NOT NULL,
	"involvement" "exercise_involvement",
	"confidence" "exercise_confidence",
	CONSTRAINT "exercise_muscles_exercise_id_muscle_group_id_role_pk" PRIMARY KEY("exercise_id","muscle_group_id","role")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name_ru" text NOT NULL,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"record_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_canonical_name_ru_unique" UNIQUE("canonical_name_ru")
);
--> statement-breakpoint
CREATE TABLE "movement_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	CONSTRAINT "movement_patterns_canonical_name_unique" UNIQUE("canonical_name")
);
--> statement-breakpoint
CREATE TABLE "muscle_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_order" integer NOT NULL,
	CONSTRAINT "muscle_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "session_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid,
	"exercise_name_snapshot" text NOT NULL,
	"position" integer NOT NULL,
	"status" "session_exercise_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_intervals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_exercise_id" uuid NOT NULL,
	"set_number" integer NOT NULL,
	"weight" numeric(6, 2),
	"reps" integer,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"session_id" uuid,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"slot_key" text NOT NULL,
	"position" integer NOT NULL,
	"default_sets" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_excluded_exercises" (
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_excluded_exercises_user_id_exercise_id_pk" PRIMARY KEY("user_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workout_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"structure" jsonb NOT NULL,
	"seed" text NOT NULL,
	"algorithm_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_template_id" uuid,
	"type_id" uuid NOT NULL,
	"volume_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" "workout_session_status" DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owning_device_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type_id" uuid NOT NULL,
	"volume_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_order" integer NOT NULL,
	CONSTRAINT "workout_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "workout_volumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_order" integer NOT NULL,
	CONSTRAINT "workout_volumes_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_weight_entries" ADD CONSTRAINT "body_weight_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_aliases" ADD CONSTRAINT "equipment_aliases_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_anatomical_tags" ADD CONSTRAINT "exercise_anatomical_tags_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_anatomical_tags" ADD CONSTRAINT "exercise_anatomical_tags_tag_id_anatomical_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."anatomical_tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_equipment" ADD CONSTRAINT "exercise_equipment_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_equipment" ADD CONSTRAINT "exercise_equipment_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_movement_patterns" ADD CONSTRAINT "exercise_movement_patterns_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_movement_patterns" ADD CONSTRAINT "exercise_movement_patterns_movement_pattern_id_movement_patterns_id_fk" FOREIGN KEY ("movement_pattern_id") REFERENCES "public"."movement_patterns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscles" ADD CONSTRAINT "exercise_muscles_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscles" ADD CONSTRAINT "exercise_muscles_muscle_group_id_muscle_groups_id_fk" FOREIGN KEY ("muscle_group_id") REFERENCES "public"."muscle_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_intervals" ADD CONSTRAINT "session_intervals_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_sets" ADD CONSTRAINT "session_sets_session_exercise_id_session_exercises_id_fk" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."session_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_excluded_exercises" ADD CONSTRAINT "user_excluded_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_excluded_exercises" ADD CONSTRAINT "user_excluded_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_generations" ADD CONSTRAINT "workout_generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_source_template_id_workout_templates_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_type_id_workout_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."workout_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_volume_id_workout_volumes_id_fk" FOREIGN KEY ("volume_id") REFERENCES "public"."workout_volumes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_owning_device_id_devices_id_fk" FOREIGN KEY ("owning_device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_type_id_workout_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."workout_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_volume_id_workout_volumes_id_fk" FOREIGN KEY ("volume_id") REFERENCES "public"."workout_volumes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "body_weight_entries_user_date_idx" ON "body_weight_entries" USING btree ("user_id","measured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "body_weight_entries_user_day_uq" ON "body_weight_entries" USING btree ("user_id","measured_at");--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_codes_email_purpose_idx" ON "email_codes" USING btree ("email","purpose");--> statement-breakpoint
CREATE INDEX "exercise_equipment_equipment_idx" ON "exercise_equipment" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "exercise_patterns_pattern_idx" ON "exercise_movement_patterns" USING btree ("movement_pattern_id");--> statement-breakpoint
CREATE INDEX "exercise_muscles_group_idx" ON "exercise_muscles" USING btree ("muscle_group_id");--> statement-breakpoint
CREATE INDEX "exercises_active_idx" ON "exercises" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "session_exercises_session_idx" ON "session_exercises" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_exercises_session_position_uq" ON "session_exercises" USING btree ("session_id","position");--> statement-breakpoint
CREATE INDEX "session_intervals_session_idx" ON "session_intervals" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_intervals_open_uq" ON "session_intervals" USING btree ("session_id") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "session_sets_exercise_number_uq" ON "session_sets" USING btree ("session_exercise_id","set_number");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_operations_user_operation_uq" ON "sync_operations" USING btree ("user_id","operation_id");--> statement-breakpoint
CREATE INDEX "sync_operations_session_idx" ON "sync_operations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "template_exercises_template_idx" ON "template_exercises" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_exercises_template_position_uq" ON "template_exercises" USING btree ("template_id","position");--> statement-breakpoint
CREATE INDEX "user_excluded_exercises_exercise_idx" ON "user_excluded_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "users_deleted_idx" ON "users" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "workout_generations_user_idx" ON "workout_generations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workout_sessions_user_status_idx" ON "workout_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "workout_sessions_owning_device_idx" ON "workout_sessions" USING btree ("owning_device_id");--> statement-breakpoint
CREATE INDEX "workout_templates_user_idx" ON "workout_templates" USING btree ("user_id");
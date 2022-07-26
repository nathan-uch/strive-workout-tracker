set client_min_messages to warning;

-- DANGER: this is NOT how to do it in the real world.
-- `drop schema` INSTANTLY ERASES EVERYTHING.
drop schema "public" cascade;

create schema "public";

CREATE TABLE "public"."users" (
	"userId" serial NOT NULL UNIQUE,
	"username" TEXT NOT NULL UNIQUE,
	"hashedPassword" TEXT NOT NULL,
	"createdAt" timestamptz(6) NOT NULL DEFAULT now(),
	CONSTRAINT "users_pk" PRIMARY KEY ("userId")
) WITH (
  OIDS=FALSE
);



CREATE TABLE "public"."workouts" (
	"workoutId" serial NOT NULL UNIQUE,
	"userId" serial NOT NULL,
  "completedAt" timestamptz(6) DEFAULT NULL,
  "workoutName" text,
	CONSTRAINT "workouts_pk" PRIMARY KEY ("workoutId")
) WITH (
  OIDS=FALSE
);



CREATE TABLE "public"."exercises" (
	"exerciseId" serial NOT NULL UNIQUE,
	"name" TEXT NOT NULL,
	"muscleGroup" TEXT NOT NULL,
	"equipment" TEXT,
	CONSTRAINT "exercises_pk" PRIMARY KEY ("exerciseId")
) WITH (
  OIDS=FALSE
);



CREATE TABLE "public"."sets" (
	"workoutId" serial NOT NULL,
	"exerciseId" serial NOT NULL,
	"setOrder" int NOT NULL,
	"reps" int,
	"weight" numeric
) WITH (
  OIDS=FALSE
);




ALTER TABLE "workouts" ADD CONSTRAINT "workouts_fk0" FOREIGN KEY ("userId") REFERENCES "users"("userId");


ALTER TABLE "sets" ADD CONSTRAINT "sets_fk0" FOREIGN KEY ("workoutId") REFERENCES "workouts"("workoutId");
ALTER TABLE "sets" ADD CONSTRAINT "sets_fk1" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("exerciseId");

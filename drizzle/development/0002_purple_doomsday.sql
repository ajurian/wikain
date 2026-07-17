CREATE TABLE "placement_marks" (
	"user_id" text NOT NULL,
	"sense_id" text NOT NULL,
	CONSTRAINT "placement_marks_user_id_sense_id_pk" PRIMARY KEY("user_id","sense_id")
);

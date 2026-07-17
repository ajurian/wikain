CREATE TABLE "verdict_memos" (
	"user_id" text NOT NULL,
	"memo_key" text NOT NULL,
	"model_version" text NOT NULL,
	"rubric_version" text NOT NULL,
	"verdict" jsonb NOT NULL,
	CONSTRAINT "verdict_memos_user_id_memo_key_pk" PRIMARY KEY("user_id","memo_key")
);

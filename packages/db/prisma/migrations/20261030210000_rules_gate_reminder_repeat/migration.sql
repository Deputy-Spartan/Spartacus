ALTER TABLE "RulesGateSettings" ADD COLUMN "reminderRepeatEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RulesGateSettings" ADD COLUMN "reminderRepeatWeekday" INTEGER;
ALTER TABLE "RulesGateSettings" ADD COLUMN "reminderRepeatHour" INTEGER;

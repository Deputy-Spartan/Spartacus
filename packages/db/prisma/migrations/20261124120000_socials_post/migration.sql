-- The socials post in Discord (Streaming › Socials).
ALTER TABLE "SocialsOverlay" ADD COLUMN "postChannelId" TEXT,
ADD COLUMN "postStyle" TEXT NOT NULL DEFAULT 'embed',
ADD COLUMN "postTitle" TEXT,
ADD COLUMN "postText" TEXT,
ADD COLUMN "postMessageId" TEXT,
ADD COLUMN "postedChannelId" TEXT;

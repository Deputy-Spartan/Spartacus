// Quote of the Day and Question of the Day. The two are separate feeds with
// their own channel, schedule, message and list, sharing one module switch.
export const DAILY_POST_KINDS = ["QUOTE", "QUESTION"] as const;
export type DailyPostKind = (typeof DAILY_POST_KINDS)[number];

export const DAILY_POST_LABELS: Record<DailyPostKind, string> = {
  QUOTE: "Quote of the Day",
  QUESTION: "Question of the Day",
};

export interface DailyPostItem {
  text: string;
  author?: string | null;
}

// The shape the Embed Creator saves, so a daily post is built and sent the
// same way as a saved embed.
export interface DailyPostMessage {
  content?: string;
  embeds?: Array<Record<string, unknown>>;
  components?: Array<Record<string, unknown>>;
}

export function dailyPostTokens(kind: DailyPostKind): Array<{ token: string; description: string }> {
  const main =
    kind === "QUOTE"
      ? [
          { token: "{quote}", description: "Today's quote" },
          { token: "{author}", description: "Who said it, or Unknown when no one is listed" },
        ]
      : [{ token: "{question}", description: "Today's question" }];
  return [
    ...main,
    { token: "{date}", description: "Today's date, like November 10, 2026" },
    { token: "{number}", description: "How many have been posted, counting this one" },
    { token: "{server}", description: "Your server's name" },
  ];
}

// What posts until someone designs their own message.
export function defaultDailyPostMessage(kind: DailyPostKind): DailyPostMessage {
  if (kind === "QUOTE") {
    return {
      content: "",
      embeds: [
        {
          id: "default-quote",
          title: "💬 Quote of the Day",
          description: "> {quote}\n\n— **{author}**",
          color: "#00E5FF",
          footerText: "Quote #{number} · {date}",
          fields: [],
        },
      ],
      components: [],
    };
  }
  return {
    content: "",
    embeds: [
      {
        id: "default-question",
        title: "❓ Question of the Day",
        description: "**{question}**\n\nDrop your answer below 👇",
        color: "#B14BFF",
        footerText: "Question #{number} · {date}",
        fields: [],
      },
    ],
    components: [],
  };
}

export function dailyPostTokenValues(
  kind: DailyPostKind,
  item: DailyPostItem,
  extra: { date: string; number: number; server: string }
): Record<string, string> {
  return {
    "{quote}": item.text,
    "{question}": item.text,
    "{author}": item.author?.trim() || "Unknown",
    "{date}": extra.date,
    "{number}": String(extra.number),
    "{server}": extra.server,
  };
}

export interface ZonedClock {
  date: string; // YYYY-MM-DD on a clock in that zone
  minutes: number; // minutes since that zone's midnight
  weekday: number; // 0 = Sunday .. 6 = Saturday
  longDate: string; // November 10, 2026
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The date and time on a wall clock in `zone`. An unknown zone reads as UTC.
export function zonedClock(zone: string, at: Date = new Date()): ZonedClock {
  let timeZone = zone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    timeZone = "UTC";
  }
  const parts: Record<string, string> = {};
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  for (const p of formatter.formatToParts(at)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: Math.max(0, WEEKDAYS.indexOf(parts.weekday)),
    longDate: new Intl.DateTimeFormat("en-US", { timeZone, month: "long", day: "numeric", year: "numeric" }).format(at),
  };
}

// "09:30" to 570. Anything unreadable falls back to 9:00 AM.
export function parsePostTime(postTime: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(postTime ?? "");
  if (!match) return 9 * 60;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return 9 * 60;
  return hours * 60 + minutes;
}

// Built-in lists, so a feed has something to post before anyone adds their own.
export const BUILT_IN_QUOTES: DailyPostItem[] = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Whether you think you can, or you think you can't, you're right.", author: "Henry Ford" },
  { text: "The best way to predict the future is to invent it.", author: "Alan Kay" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Will Durant" },
  { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
  { text: "The only thing we have to fear is fear itself.", author: "Franklin D. Roosevelt" },
  { text: "That which does not kill us makes us stronger.", author: "Friedrich Nietzsche" },
  { text: "He who has a why to live can bear almost any how.", author: "Friedrich Nietzsche" },
  { text: "Float like a butterfly, sting like a bee.", author: "Muhammad Ali" },
  { text: "The unexamined life is not worth living.", author: "Socrates" },
  { text: "Not all those who wander are lost.", author: "J.R.R. Tolkien" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Fall seven times, stand up eight.", author: "Japanese proverb" },
  { text: "Imagination is more important than knowledge.", author: "Albert Einstein" },
  { text: "Well done is better than well said.", author: "Benjamin Franklin" },
  { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
  { text: "What we do in life echoes in eternity.", author: "Maximus, Gladiator" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "The impediment to action advances action. What stands in the way becomes the way.", author: "Marcus Aurelius" },
  { text: "Waste no more time arguing about what a good man should be. Be one.", author: "Marcus Aurelius" },
  { text: "We suffer more often in imagination than in reality.", author: "Seneca" },
  { text: "Luck is what happens when preparation meets opportunity.", author: "Seneca" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese proverb" },
  { text: "A smooth sea never made a skilled sailor.", author: "Proverb" },
  { text: "Do or do not. There is no try.", author: "Yoda" },
  { text: "It's not whether you get knocked down, it's whether you get up.", author: "Vince Lombardi" },
  { text: "Champions keep playing until they get it right.", author: "Billie Jean King" },
  { text: "I can accept failure, everyone fails at something. But I can't accept not trying.", author: "Michael Jordan" },
];

export const BUILT_IN_QUESTIONS: DailyPostItem[] = [
  { text: "What game have you put the most hours into, and was it worth it?" },
  { text: "What's a small thing that instantly makes your day better?" },
  { text: "If you could master one skill overnight, what would it be?" },
  { text: "What's the best piece of advice you've ever been given?" },
  { text: "What's a movie or show you can rewatch forever?" },
  { text: "What was the first game you ever fell in love with?" },
  { text: "If you could live in any fictional world, which one would you pick?" },
  { text: "What's your go-to comfort food?" },
  { text: "What's something you changed your mind about recently?" },
  { text: "What song have you had on repeat lately?" },
  { text: "What's the most underrated game you've ever played?" },
  { text: "Early bird or night owl, and has it always been that way?" },
  { text: "What's a hobby you'd pick up if you had more free time?" },
  { text: "What's the best trip you've ever taken?" },
  { text: "If you could have dinner with anyone, living or not, who would it be?" },
  { text: "What's one thing on your bucket list?" },
  { text: "What's a hill you're willing to die on?" },
  { text: "What's the hardest boss or level you've ever beaten?" },
  { text: "What's a skill you have that most people here don't know about?" },
  { text: "If you won the lottery tomorrow, what's the first thing you'd buy?" },
  { text: "What's your favorite way to spend a day off?" },
  { text: "Which game has the best soundtrack of all time?" },
  { text: "What's something you're looking forward to this month?" },
  { text: "What's the best thing you've bought for under $50?" },
  { text: "If you could add one feature to this server, what would it be?" },
  { text: "What's a food you hated as a kid but love now?" },
  { text: "What's your most used emoji?" },
  { text: "Controller or mouse and keyboard, and why?" },
  { text: "What's the last thing that made you laugh out loud?" },
  { text: "What would your perfect weekend look like?" },
  { text: "What's a game you wish you could play again for the first time?" },
  { text: "What's one goal you're working toward right now?" },
  { text: "Which superpower would you choose, and what's the first thing you'd do with it?" },
  { text: "What's the best teammate you've ever had like?" },
  { text: "What's a tradition you'd love to start?" },
  { text: "Coffee, tea, energy drinks or none of the above?" },
  { text: "What's a book, show or game that changed how you see things?" },
  { text: "What's the most clutch moment you've ever pulled off?" },
  { text: "What's something you're proud of that you don't get to talk about much?" },
  { text: "If you could instantly visit anywhere right now, where would you go?" },
];

export function builtInDailyPosts(kind: DailyPostKind): DailyPostItem[] {
  return kind === "QUOTE" ? BUILT_IN_QUOTES : BUILT_IN_QUESTIONS;
}

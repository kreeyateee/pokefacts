/** Name shown in the app, the browser tab, and the README. */
export const APP_NAME = "Pokefacts";

/** Public site. Open Graph tags need this absolute address. */
export const PUBLIC_SITE_ORIGIN = "https://pokefacts.online";

/** One-off tip jar. Donations are optional. The app stays free. */
export const DONATE_URL = "https://buymeacoffee.com/kreeyate";

/** The server-costs goal shown above the footer. Set up the same goal on the Buy Me a Coffee page. */
export const SUPPORT_GOAL = "$200";

/** Public source. People clone this and run it on their own computer. */
/** The build this page came from (the commit), or "dev". Set in next.config.ts. */
export const APP_BUILD = process.env.NEXT_PUBLIC_POKEFACTS_BUILD || "dev";

export const SOURCE_URL = "https://github.com/kreeyateee/pokefacts";

/** Feedback opens a new GitHub issue. GitHub asks the visitor to sign in first. */
export const FEEDBACK_URL = `${SOURCE_URL}/issues/new`;

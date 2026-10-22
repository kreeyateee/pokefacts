import config from "./local-origin.json";

/** The address a home computer opens. Yoto login returns to this origin. */
export const LOCAL_PORT = config.port;
export const LOCAL_APP_ORIGIN = config.origin;
export const YOTO_REDIRECT_URI = config.redirectUri;

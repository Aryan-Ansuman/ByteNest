export const AUTH_COOKIE_NAME = "bytenest_auth";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function setAuthPresenceCookie() {
    if (typeof document === "undefined") return;
    document.cookie = `${AUTH_COOKIE_NAME}=1; Path=/; Max-Age=${AUTH_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function clearAuthPresenceCookie() {
    if (typeof document === "undefined") return;
    document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

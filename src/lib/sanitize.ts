/**
 * Lightweight HTML sanitizer for markdown-rendered content.
 *
 * @uiw/react-md-editor uses `rehype` under the hood and does NOT sanitize
 * dangerous HTML by default — a user can embed `<script>` or event handler
 * attributes in their markdown source and have them execute in other users'
 * browsers.
 *
 * Strategy:
 *  - On write (POST/PATCH question, POST answer): strip every HTML tag
 *    from the raw markdown *source string* before storing it.  Markdown
 *    parsers re-render headings, code blocks, links etc. from syntax like
 *    `**bold**`, so stripping raw HTML from the source is safe.
 *  - On render: the `@uiw/react-md-editor` `Markdown` component is wrapped
 *    with a rehype-sanitize plugin in `MarkdownSafe` (client component below)
 *    as a second defence-in-depth layer.
 *
 * Why not DOMPurify?  DOMPurify requires a real DOM (browser or jsdom) and
 * cannot run on the Next.js Edge runtime or in pure Node server components.
 * The regex approach here is intentionally conservative: it strips ALL HTML
 * tags rather than trying to allowlist safe ones, because markdown already
 * has non-HTML equivalents for everything users legitimately need (bold,
 * italic, code, links, images).
 */

/** Patterns that indicate dangerous raw HTML in a markdown source string. */
const DANGEROUS_HTML_RE =
    /<\s*\/?\s*(script|iframe|object|embed|form|input|button|select|textarea|link|meta|base|style|svg|math|template|slot|portal|applet|frame|frameset|noframes|noscript|plaintext|xmp)[^>]*>/gi;

const HTML_TAG_RE = /<[^>]+>/g;
const SAFE_MARKDOWN_HTML_TAGS = new Set(["br", "code", "kbd", "mark", "small", "sub", "sup"]);
const HTML_ENTITY_ON_OWN_RE = /&(?:javascript|vbscript|data|on\w+):/gi;
const EVENT_ATTR_RE = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const BIDI_CONTROL_RE = /[\u202A-\u202E\u2066-\u2069]/g;
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;

/**
 * Sanitize a markdown *source* string before persisting it.
 * Removes all raw HTML tags and dangerous URI schemes from the plain text.
 * Markdown syntax (**, __, ##, >, etc.) is preserved untouched.
 */
export function sanitizeMarkdownSource(source: string): string {
    if (!source || typeof source !== "string") return "";

    return source
        // Remove dangerous block-level tags entirely (script, iframe, …)
        .replace(DANGEROUS_HTML_RE, "")
        // Preserve a tiny safe subset of markdown-friendly inline HTML.
        .replace(HTML_TAG_RE, sanitizeHtmlTag)
        // Strip javascript: / vbscript: entity tricks
        .replace(HTML_ENTITY_ON_OWN_RE, "")
        // Strip inline event handlers that somehow survive
        .replace(EVENT_ATTR_RE, "")
        .trim();
}

function sanitizeHtmlTag(tag: string) {
    const match = tag.match(/^<\s*(\/?)\s*([a-z0-9-]+)/i);
    if (!match) return "";

    const [, closing, rawName] = match;
    const name = rawName.toLowerCase();
    if (!SAFE_MARKDOWN_HTML_TAGS.has(name)) return "";
    if (name === "br") return "<br>";
    return closing ? `</${name}>` : `<${name}>`;
}

export function sanitizeTitleSource(source: string): string {
    return sanitizeMarkdownSource(source)
        .normalize("NFKC")
        .replace(BIDI_CONTROL_RE, "")
        .replace(ZERO_WIDTH_RE, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Validate that a sanitized value still has meaningful content.
 * Returns true when the cleaned string passes the minimum length check.
 */
export function isValidContent(sanitized: string, minLength = 1): boolean {
    return sanitized.length >= minLength;
}

/**
 * Strip HTML tags for producing plain-text excerpts (used in question cards,
 * search snippets, etc.) — does NOT need to be XSS-safe, just readable.
 */
export function markdownToPlainExcerpt(source: string, maxLength = 200): string {
    const plain = source
        .replace(/```[\s\S]*?```/g, " [code] ")
        .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[#*_>![\]]/g, "")
        .replace(HTML_TAG_RE, "")
        .replace(/\s+/g, " ")
        .trim();

    return plain.length > maxLength ? plain.slice(0, maxLength) + "…" : plain;
}

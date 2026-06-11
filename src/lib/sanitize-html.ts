/**
 * DOMPurify wrapper — ported from web/lib/sanitize-html.ts (SESSION A4).
 * Browser-only: uses `dompurify` (not isomorphic) since the add-in has no SSR.
 * CUSTODY: all rendered email/LLM HTML must pass through sanitizeHtml() before
 * dangerouslySetInnerHTML. Never bypass. (OVERVIEW §2.4)
 */
import DOMPurify from "dompurify";

let _hookRegistered = false;
function ensureHook(): void {
	if (_hookRegistered) return;
	DOMPurify.addHook("afterSanitizeAttributes", (node) => {
		if (!(node instanceof Element)) return;
		if (node.tagName === "A" && node.getAttribute("target")) {
			node.setAttribute("rel", "noopener noreferrer");
		}
		// Block external img src — only data: URIs allowed (prevents tracking pixels and
		// FERPA-violating external loads from FERPA-controlled email content).
		if (node.tagName === "IMG") {
			const src = node.getAttribute("src") ?? "";
			if (!src.startsWith("data:image/")) node.removeAttribute("src");
		}
	});
	_hookRegistered = true;
}

const ALLOWED_TAGS = [
	"p",
	"br",
	"b",
	"i",
	"em",
	"strong",
	"u",
	"s",
	"span",
	"div",
	"blockquote",
	"pre",
	"code",
	"ul",
	"ol",
	"li",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"a",
	"img",
	"table",
	"thead",
	"tbody",
	"tr",
	"th",
	"td",
	"hr",
	"sup",
	"sub",
	"small",
	"mark",
];

const ALLOWED_ATTR = [
	"href",
	"src",
	"alt",
	"title",
	"class",
	"target",
	"rel",
	"width",
	"height",
];

export function sanitizeHtml(dirty: string): string {
	ensureHook();
	return DOMPurify.sanitize(dirty, {
		ALLOWED_TAGS,
		ALLOWED_ATTR,
		ALLOW_DATA_ATTR: false,
		ADD_ATTR: ["target"],
		FORBID_TAGS: [
			"style",
			"script",
			"iframe",
			"form",
			"input",
			"button",
			"object",
			"embed",
		],
		FORBID_ATTR: [
			"style",
			"onerror",
			"onload",
			"onclick",
			"onmouseover",
			"onfocus",
		],
		FORCE_BODY: true,
	}) as string;
}

export function sanitizeText(dirty: string): string {
	return DOMPurify.sanitize(dirty, {
		ALLOWED_TAGS: [],
		ALLOWED_ATTR: [],
	}) as string;
}

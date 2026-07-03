const CACHE = "hl2-shell-v2";

const PRECACHE = [
	"./",
	"hl2_launcher.html",
	"hl2_launcher.js",
	"hl2_launcher.wasm",
	"manifest.webmanifest",
	"assets/icon-192.png",
	"assets/icon-512.png",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(PRECACHE);
			await self.skipWaiting();
		})(),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await self.clients.claim();
		})(),
	);
});
function withCoiHeaders(resp) {
	if (!resp) return resp;
	const headers = new Headers(resp.headers);
	headers.set("Cross-Origin-Opener-Policy", "same-origin");
	headers.set("Cross-Origin-Embedder-Policy", "require-corp");
	headers.set("Cross-Origin-Resource-Policy", "cross-origin");
	return new Response(resp.body, {
		status: resp.status,
		statusText: resp.statusText,
		headers,
	});
}

self.addEventListener("fetch", (event) => {
	const req = event.request;
	const url = new URL(req.url);
	if (req.method !== "GET" || url.origin !== self.location.origin) return;

	const path = url.pathname;

	if (path.includes("/chunks/") && path.endsWith(".data")) {
		event.respondWith(
			fetch(req)
				.then(withCoiHeaders)
				.catch(() => new Response("offline", { status: 503 })),
		);
		return;
	}

	if (path.endsWith("/chunks/manifest.json")) {
		event.respondWith(
			(async () => {
				try {
					const resp = await fetch(req);
					const cache = await caches.open(CACHE);
					cache.put(req, resp.clone());
					return withCoiHeaders(resp);
				} catch (e) {
					const cached = await caches.match(req);
					return withCoiHeaders(
						cached ||
							new Response("{}", {
								headers: { "content-type": "application/json" },
							}),
					);
				}
			})(),
		);
		return;
	}

	// HTML document: network-first so page/launcher edits show immediately when online;
	// the precached copy is only the offline fallback.
	if (req.mode === "navigate" || path.endsWith(".html")) {
		event.respondWith(
			(async () => {
				try {
					const resp = await fetch(req);
					const cache = await caches.open(CACHE);
					cache.put(req, resp.clone());
					return withCoiHeaders(resp);
				} catch (e) {
					const cached = await caches.match(req);
					return withCoiHeaders(cached || new Response("offline", { status: 503 }));
				}
			})(),
		);
		return;
	}

	// App-shell binaries (js/wasm/.so/assets): cache-first, runtime-cache on miss.
	event.respondWith(
		(async () => {
			const cached = await caches.match(req);
			if (cached) return withCoiHeaders(cached);
			try {
				const resp = await fetch(req);
				if (resp.ok && resp.type === "basic") {
					const cache = await caches.open(CACHE);
					cache.put(req, resp.clone());
				}
				return withCoiHeaders(resp);
			} catch (e) {
				return new Response("offline", { status: 503 });
			}
		})(),
	);
});

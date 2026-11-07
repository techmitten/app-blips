// Relays an upstream provider response back to the client.
//
// fetch() has already decoded the upstream body, so its content-encoding and
// content-length no longer describe what is relayed. Passing them on makes the
// browser try to gunzip plain text ("Failed to fetch"). Nothing else of the
// provider's belongs on this app's origin either: its cookies, CORS grants
// and hop-by-hop headers are for the provider's own site. Only the headers
// the renderer reads pass. Streaming responses pass straight through, so the
// SSE stream reaches the renderer unmodified.

const RELAYED_HEADERS = ['content-type', 'cache-control', 'retry-after', 'x-request-id'];
const RELAYED_PREFIXES = ['x-ratelimit-'];

const relayHeaders = (headers) => {
  const out = new Headers();
  headers.forEach((value, name) => {
    const key = name.toLowerCase();
    if (RELAYED_HEADERS.includes(key) || RELAYED_PREFIXES.some((prefix) => key.startsWith(prefix))) out.set(name, value);
  });
  return out;
};

export const relayUpstream = (upstreamResponse) => new Response(upstreamResponse.body, {
  status: upstreamResponse.status,
  headers: relayHeaders(upstreamResponse.headers),
});

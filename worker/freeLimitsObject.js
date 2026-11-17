// The one Durable Object that holds the Free option's counts for the whole
// site (worker/freeLimitsStore.js does the work). The Worker reaches it by
// RPC: begin / end around each Free AI request, allowUnsplash per photo search.
import { DurableObject } from 'cloudflare:workers';
import { createFreeLimitsStore } from './freeLimitsStore.js';

export class FreeLimits extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = createFreeLimitsStore(env, ctx.storage);
  }

  begin(visitor, messageId) {
    return this.store.begin(String(visitor || ''), String(messageId || ''));
  }

  end(ticket, visitor, tokens) {
    return this.store.end(ticket, String(visitor || ''), Number(tokens) || 0);
  }

  allowUnsplash(visitor) {
    return this.store.allowUnsplash(String(visitor || ''));
  }
}

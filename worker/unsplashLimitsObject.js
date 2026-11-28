// The one Durable Object that holds the per-visitor Unsplash search counts for
// the whole site (worker/unsplashLimitsStore.js does the work). The Worker
// reaches it by RPC: allow() per photo search.
import { DurableObject } from 'cloudflare:workers';
import { createUnsplashLimitsStore } from './unsplashLimitsStore.js';

export class UnsplashLimits extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = createUnsplashLimitsStore(ctx.storage);
  }

  allow(visitor) {
    return this.store.allow(String(visitor || ''));
  }
}

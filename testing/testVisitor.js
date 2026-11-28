// Who a request comes from (electron/server/visitor.js), for the per-visitor
// Unsplash search limits.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientIp, visitorKey } from '../electron/server/visitor.js';

test('the visitor is the address that reached the platform, not what the visitor wrote', () => {
  // Direct to the platform: its edge appends the real address; internal hops are private.
  assert.equal(clientIp('203.0.113.7', '10.0.0.5'), '203.0.113.7');
  assert.equal(clientIp('1.2.3.4, 203.0.113.7, 10.1.2.3', '10.0.0.5'), '203.0.113.7');
  // Through Cloudflare: the entry before Cloudflare's address is the visitor.
  assert.equal(clientIp('6.6.6.6, 198.51.100.9, 172.70.1.1', '10.0.0.5'), '198.51.100.9');
  // No proxy at all: the socket's peer.
  assert.equal(clientIp('', '::ffff:198.51.100.20'), '198.51.100.20');
  assert.equal(clientIp('garbage, 203.0.113.7:4431', '10.0.0.5'), '203.0.113.7');
});

test('IPv6 visitors are counted per /64', () => {
  assert.equal(visitorKey('2001:db8:1:2:aaaa::1'), visitorKey('2001:db8:1:2:bbbb::9'));
  assert.notEqual(visitorKey('2001:db8:1:2::1'), visitorKey('2001:db8:1:3::1'));
  assert.equal(visitorKey('203.0.113.7'), '203.0.113.7');
});

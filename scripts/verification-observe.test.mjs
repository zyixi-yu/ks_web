import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTail, statusHealth } from './verification-observe.mjs';

const timestamp = '2026-10-18T01:00:00.000Z';
test('only safe metadata survives a raw request envelope', () => {
  const input = {
    event: { request: { url: 'https://example.com/?token=secret', headers: { Authorization: 'secret' }, body: '123456' } },
    exceptions: [{ message: 'secret' }],
    logs: [{ message: ['verify_code.write.ok', { at_utc: timestamp, ray: '0123456789abcdef-HKG', colo: 'HKG', country: 'CN', created_at: 1792285200, ttl: 180, sms_len: 42, code: '123456', sms: 'secret', token: 'secret' }] }],
  };
  assert.deepEqual(sanitizeTail(input, timestamp), [{ event: 'verify_code.write.ok', received_at: timestamp, at_utc: timestamp, ray: '0123456789abcdef-HKG', colo: 'HKG', country: 'CN', created_at: 1792285200, ttl: 180, sms_len: 42 }]);
  assert.doesNotMatch(JSON.stringify(sanitizeTail(input)), /secret|123456"|Authorization/);
});
test('known events with separately encoded console arguments are accepted', () => {
  const data = { method: 'GET', path: '/api/verify-code/read', status: 401, duration_ms: 1 };
  assert.deepEqual(sanitizeTail({ logs: [{ message: ['verify_code.request', JSON.stringify(data)] }] }, timestamp), [{ event: 'verify_code.request', received_at: timestamp, ...data }]);
});
test('untrusted values cannot smuggle raw strings into safe fields', () => {
  const data = { at_utc: 'secret', ray: 'secret', colo: 'secret', country: 'secret', method: 'secret', path: '/api/verify-code/read?token=secret', status: 'secret', ttl: Infinity };
  assert.deepEqual(sanitizeTail({ logs: [{ message: ['verify_code.read.ok', data] }] }, timestamp), [{ event: 'verify_code.read.ok', received_at: timestamp }]);
});
test('malformed and unknown events are ignored', () => {
  for (const frame of [null, {}, { logs: 'secret' }, { logs: [null, { message: ['verify_code.raw', { code: '123456' }] }, { message: ['verify_code.read.ok', '{broken'] }, { message: ['verify_code.read.ok', []] }] }]) assert.deepEqual(sanitizeTail(frame), []);
});
test('a live process without recent heartbeats and pongs is unhealthy', () => {
  const base = { phase: 'connected', heartbeat_at: timestamp, connected_at: timestamp };
  const time = Date.parse(timestamp);
  assert.equal(statusHealth(base, time + 20_000), true);
  assert.equal(statusHealth(base, time + 46_000), false);
  assert.equal(statusHealth({ ...base, heartbeat_at: new Date(time + 50_000).toISOString() }, time + 60_000), false);
  assert.equal(statusHealth({ ...base, phase: 'reconnecting' }, time), false);
  assert.equal(statusHealth({}, time), false);
});

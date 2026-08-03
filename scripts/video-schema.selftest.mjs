#!/usr/bin/env node
// Offline self-test for the schema/invariants (no network, no API key).
//   node scripts/video-schema.selftest.mjs
// Proves the third_party_embed => attribution invariant THROWS, plus the
// duration parser and attribution builder behave. Exits non-zero on any failure.

import assert from 'node:assert/strict';
import {
  assertVideoRecord,
  assertCatalog,
  validateAttribution,
  iso8601DurationToSec,
  buildAttribution,
  VideoSchemaError,
  SOURCES,
  SOURCE_BY_CHANNEL,
} from './video-schema.mjs';

let pass = 0;
const ok = (name, fn) => {
  fn();
  pass += 1;
  console.log(`PASS  ${name}`);
};
const throws = (name, fn) =>
  ok(name, () => assert.throws(fn, VideoSchemaError));

const now = '2026-08-03T00:00:00.000Z';
const ownedRec = {
  provider: 'youtube', videoId: 'aaaaaaaaaaa', channelId: 'UC8zo7jvEtFzX6LBvg-JapdQ',
  source: 'owned', attribution: null, durationSec: 12, embeddable: true,
  privacyStatus: 'public', lastVerifiedAt: now,
};
const thirdRec = {
  provider: 'youtube', videoId: 'bbbbbbbbbbb', channelId: 'UCCgLoMYIyP0U56dEhEL1wXQ',
  source: 'third_party_embed',
  attribution: {
    creatorName: 'Chloe Ting',
    channelUrl: 'https://www.youtube.com/channel/UCCgLoMYIyP0U56dEhEL1wXQ',
    videoUrl: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
    videoTitle: 'Abs Workout',
  },
  durationSec: 600, embeddable: true, privacyStatus: 'public', lastVerifiedAt: now,
};

// --- valid records pass ---
ok('owned record with attribution=null is valid', () => assertVideoRecord(ownedRec));
ok('third_party record with attribution is valid', () => assertVideoRecord(thirdRec));
ok('catalog of valid records passes', () => assertCatalog([ownedRec, thirdRec]));

// --- THE invariant throws ---
throws('third_party_embed + attribution=null THROWS (the invariant)', () =>
  assertVideoRecord({ ...thirdRec, attribution: null }));
throws('catalog surfaces the offending record', () =>
  assertCatalog([ownedRec, { ...thirdRec, attribution: null }]));

// --- attribution shape ---
throws('attribution missing videoTitle throws', () =>
  validateAttribution({ creatorName: 'X', channelUrl: 'https://www.youtube.com/channel/x', videoUrl: 'https://www.youtube.com/watch?v=x' }));
throws('non-canonical videoUrl throws', () =>
  validateAttribution({ creatorName: 'X', channelUrl: 'https://www.youtube.com/channel/x', videoUrl: 'https://youtu.be/x', videoTitle: 'T' }));
ok('attribution=null is allowed', () => validateAttribution(null));

// --- field guards ---
throws('bad provider throws', () => assertVideoRecord({ ...ownedRec, provider: 'vimeo' }));
throws('bad source throws', () => assertVideoRecord({ ...ownedRec, source: 'stolen' }));
throws('negative duration throws', () => assertVideoRecord({ ...ownedRec, durationSec: -1 }));
throws('endSec <= startSec throws', () => assertVideoRecord({ ...thirdRec, startSec: 30, endSec: 30 }));
ok('valid start/end range passes', () => assertVideoRecord({ ...thirdRec, startSec: 10, endSec: 40 }));

// --- duration parser ---
ok('PT30S -> 30', () => assert.equal(iso8601DurationToSec('PT30S'), 30));
ok('PT1M5S -> 65', () => assert.equal(iso8601DurationToSec('PT1M5S'), 65));
ok('PT1H2M3S -> 3723', () => assert.equal(iso8601DurationToSec('PT1H2M3S'), 3723));
ok('garbage -> NaN', () => assert.ok(Number.isNaN(iso8601DurationToSec('nope'))));

// --- buildAttribution ---
ok('owned -> null attribution', () =>
  assert.equal(buildAttribution(SOURCE_BY_CHANNEL['UC8zo7jvEtFzX6LBvg-JapdQ'], { title: 'x' }, 'v1'), null));
ok('roxanne carries legal entity', () => {
  const a = buildAttribution(SOURCE_BY_CHANNEL['UCYz_Au_UTbenuIeQBFHnu3g'], { title: 'Kettlebell Flow' }, 'v2');
  assert.equal(a.creatorLegalEntity, 'ROX HEALTH GROUP PTY LTD');
  assert.equal(a.videoUrl, 'https://www.youtube.com/watch?v=v2');
});
ok('SOURCES has the 3 verified channels', () => assert.equal(SOURCES.length, 3));

console.log(`\n===== ${pass} checks passed =====`);

#!/usr/bin/env node
// Offline self-test for the master-library schema (no network, no key).
//   node scripts/exercise-schema.selftest.mjs
import assert from 'node:assert/strict';
import {
  slugify, assertExerciseVideo, assertExercise, assertLibrary,
  assertProgramExercise, validateAttribution, isPublishable, VideoSchemaError,
} from './exercise-schema.mjs';

let pass = 0;
const ok = (n, fn) => { fn(); pass++; console.log(`PASS  ${n}`); };
const throws = (n, fn) => ok(n, () => assert.throws(fn, VideoSchemaError));

const now = '2026-08-03T00:00:00.000Z';
const thirdVideo = {
  provider: 'youtube', videoId: 'sSESeQAir2M', source: 'third_party_embed',
  attribution: {
    creatorName: 'Well+Good',
    channelUrl: 'https://www.youtube.com/channel/xxxx',
    videoUrl: 'https://www.youtube.com/watch?v=sSESeQAir2M',
    videoTitle: 'Kettlebell Swing',
  },
  embeddable: false, verifiedByCoach: false, lastVerifiedAt: now,
};

// slugify — must produce the TUGAS-3 slugs
ok('slugify Kettlebell Swing', () => assert.equal(slugify('Kettlebell Swing'), 'kettlebell-swing'));
ok('slugify Box Step-Up', () => assert.equal(slugify('Box Step-Up'), 'box-step-up'));
ok('slugify Kettlebell Clean and Press', () => assert.equal(slugify('Kettlebell Clean and Press'), 'kettlebell-clean-and-press'));
ok("slugify Child's Pose keeps distinct", () => {
  assert.equal(slugify("Child's Pose"), 'childs-pose');
  assert.notEqual(slugify("Child's Pose"), slugify('Child Pose'));
});

// video validation + THE invariant
ok('valid third_party video passes', () => assertExerciseVideo(thirdVideo));
throws('third_party + attribution=null THROWS (the invariant)', () =>
  assertExerciseVideo({ ...thirdVideo, attribution: null }));
ok('owned video may have null attribution', () =>
  assertExerciseVideo({ provider: 'youtube', videoId: 'own1', source: 'owned', attribution: null, embeddable: true, verifiedByCoach: true, lastVerifiedAt: now }));
throws('missing verifiedByCoach throws', () => {
  const { verifiedByCoach, ...rest } = thirdVideo; return assertExerciseVideo(rest);
});
throws('non-canonical videoUrl throws', () =>
  validateAttribution({ creatorName: 'X', channelUrl: 'https://y', videoUrl: 'https://youtu.be/x', videoTitle: 'T' }));

// exercise + library
ok('exercise with video:null is valid', () => assertExercise({ id: 'plank-to-push-up', name: 'Plank to Push-Up', equipment: 'Tanpa alat', video: null }));
ok('exercise with third_party video valid', () => assertExercise({ id: 'kettlebell-swing', name: 'Kettlebell Swing', equipment: 'Kettlebell', video: thirdVideo }));
throws('library with duplicate slug throws', () => assertLibrary([
  { id: 'a', name: 'A', equipment: 'x', video: null },
  { id: 'a', name: 'A2', equipment: 'x', video: null },
]));
ok('clean library passes', () => assertLibrary([
  { id: 'a', name: 'A', equipment: 'x', video: null },
  { id: 'b', name: 'B', equipment: 'x', video: thirdVideo },
]));

// seed lifecycle: attribution present but creatorName/title empty pre-oEmbed is VALID...
const seedVideo = {
  provider: 'youtube', videoId: 'zJVbXefebRI', source: 'third_party_embed',
  attribution: { creatorName: '', channelUrl: '', videoUrl: 'https://www.youtube.com/watch?v=zJVbXefebRI', videoTitle: '' },
  embeddable: false, verifiedByCoach: false, lastVerifiedAt: now,
};
ok('seed video (empty creatorName, attribution non-null) is schema-valid', () => assertExerciseVideo(seedVideo));
throws('but attribution.videoUrl must still be canonical', () =>
  assertExerciseVideo({ ...seedVideo, attribution: { ...seedVideo.attribution, videoUrl: 'https://youtu.be/x' } }));

// ...but NOT publishable until embeddable + verified + real creator
ok('seed video is NOT publishable', () => assert.equal(isPublishable(seedVideo), false));
ok('third_party publishable only when embeddable+verified+creator', () =>
  assert.equal(isPublishable({ ...thirdVideo, embeddable: true, verifiedByCoach: true }), true));
ok('third_party w/o creator IS publishable when it has a source link', () =>
  assert.equal(isPublishable({ ...seedVideo, embeddable: true, verifiedByCoach: true }), true));
ok('third_party without any videoUrl is NOT publishable', () =>
  assert.equal(isPublishable({ ...seedVideo, embeddable: true, verifiedByCoach: true, attribution: { creatorName: '', channelUrl: '', videoUrl: '', videoTitle: '' } }), false));
ok('owned needs no attribution to publish', () =>
  assert.equal(isPublishable({ provider: 'youtube', videoId: 'o1', source: 'owned', attribution: null, embeddable: true, verifiedByCoach: true, lastVerifiedAt: now }), true));
ok('null video not publishable', () => assert.equal(isPublishable(null), false));

// program exercise
ok('valid ProgramExercise passes', () => assertProgramExercise({ exerciseId: 'kettlebell-swing', section: 'main', order: 3, durationSec: 40 }));
throws('bad section throws', () => assertProgramExercise({ exerciseId: 'x', section: 'finisher', order: 1 }));

console.log(`\n===== ${pass} checks passed =====`);

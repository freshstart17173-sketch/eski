/* Does the loudness meter actually measure loudness?

   A normaliser that is wrong is worse than none: it applies a confident gain
   in the wrong direction and every clip on the site ends up mismatched in a
   new way. So this checks the implementation against the published EBU Tech
   3341 conformance cases, which is the same bar a broadcast meter is held to.

   measureBuffer() only ever touches sampleRate, numberOfChannels, length,
   duration and getChannelData(), so an AudioBuffer can be faked here and the
   whole thing runs in node with no browser and no audio files. */
require('../loudness.js');
const L = globalThis.eskiLoudness;

let bad = 0;
const near = (got, want, tol, what) => {
  const ok = got != null && Math.abs(got - want) <= tol;
  console.log((ok ? '  ok  ' : '  FAIL  ') + what +
    `  (got ${got == null ? 'null' : got.toFixed(2)}, want ${want} ±${tol})`);
  if (!ok) bad++;
};
const is = (cond, what, extra = '') => {
  console.log((cond ? '  ok  ' : '  FAIL  ') + what + (cond ? '' : '  << ' + extra));
  if (!cond) bad++;
};

/* an AudioBuffer, as much of one as the meter reads */
function buffer(chans, rate, seconds, fill) {
  const len = Math.round(rate * seconds);
  const data = chans.map(() => new Float32Array(len));
  chans.forEach((_, ch) => fill(data[ch], ch, rate, len));
  return {
    sampleRate: rate, numberOfChannels: chans.length, length: len,
    duration: seconds, getChannelData: i => data[i]
  };
}
/* dBFS for a sine is defined against a full-scale sine, so peak amplitude A
   is exactly 20log10(A) dBFS — no root-two anywhere. */
const amp = db => Math.pow(10, db / 20);
const sine = (freq, db) => (out, _ch, rate, len) => {
  const a = amp(db);
  for (let i = 0; i < len; i++) out[i] = a * Math.sin(2 * Math.PI * freq * i / rate);
};

console.log('EBU Tech 3341 conformance');
/* cases 1 and 2: a 1kHz sine at a known level must read that level back.
   the spec allows ±0.1 LU; anything outside that is a broken filter or a
   broken gate rather than a rounding difference. */
near(L.measureBuffer(buffer([0, 0], 48000, 20, sine(1000, -23))).lufs,
  -23.0, 0.1, 'stereo 1kHz sine at -23 dBFS reads -23 LUFS');
near(L.measureBuffer(buffer([0, 0], 48000, 20, sine(1000, -33))).lufs,
  -33.0, 0.1, 'stereo 1kHz sine at -33 dBFS reads -33 LUFS');

/* THE FILTERS ARE RE-DERIVED PER SAMPLE RATE rather than resampling to 48k,
   so a rate the spec never published coefficients for has to land in the same
   place. 44.1k is what most browsers hand back from a microphone. */
near(L.measureBuffer(buffer([0, 0], 44100, 20, sine(1000, -23))).lufs,
  -23.0, 0.15, '44.1kHz measures the same as 48kHz');
near(L.measureBuffer(buffer([0, 0], 32000, 20, sine(1000, -23))).lufs,
  -23.0, 0.2, '32kHz measures the same as 48kHz');

/* MONO IS A DELIBERATE DEVIATION FROM BS.1770 and the one place this
   implementation knowingly departs from the spec, so it gets its own check.
   The spec sums channel powers and would read a mono file 3 LU quieter. But
   the browser upmixes mono to both speakers on playback, putting that 3dB
   back — so measuring it the spec's way and normalising would leave every
   mono take 3dB hot, and a laptop voice recording is almost always mono. */
near(L.measureBuffer(buffer([0], 48000, 20, sine(1000, -23))).lufs,
  -23.0, 0.1, 'mono is measured as the dual-mono it will be played as');

console.log('K-weighting actually weights');
/* the shelf lifts treble, so identical amplitudes at 1kHz and 10kHz must NOT
   measure identically. if they do, the filter is a no-op and every
   measurement is really just RMS. */
const at1k  = L.measureBuffer(buffer([0, 0], 48000, 10, sine(1000,  -23))).lufs;
const at10k = L.measureBuffer(buffer([0, 0], 48000, 10, sine(10000, -23))).lufs;
is(at10k > at1k + 0.5, 'treble measures louder than midrange at equal amplitude',
  `1k ${at1k.toFixed(2)} vs 10k ${at10k.toFixed(2)}`);
/* and the high-pass kills subsonic content rather than letting a DC-ish
   rumble dominate the measurement */
const at20 = L.measureBuffer(buffer([0, 0], 48000, 10, sine(20, -23))).lufs;
is(at20 < at1k - 10, '20Hz is heavily discounted by the high-pass',
  `20Hz ${at20.toFixed(2)} vs 1k ${at1k.toFixed(2)}`);

console.log('the gates');
/* THE RELATIVE GATE IS WHAT MAKES DIALOGUE MEASURABLE. A take with pauses in
   it must measure the same as one without, or every voice actor who leaves
   air around their lines gets boosted for it. */
const solid = L.measureBuffer(buffer([0, 0], 48000, 20, sine(1000, -23))).lufs;
const gappy = L.measureBuffer(buffer([0, 0], 48000, 40, (out, _c, rate, len) => {
  const a = amp(-23);
  for (let i = 0; i < len; i++) {                 // 2s on, 2s off
    const chunk = Math.floor(i / (rate * 2));
    out[i] = (chunk % 2) ? 0 : a * Math.sin(2 * Math.PI * 1000 * i / rate);
  }
})).lufs;
/* WHY 1.0 AND NOT 0.1. Ungated, a 50% duty cycle would read a full 3 LU
   down. The gate recovers about 2.4 of that; what is left is the blocks that
   STRADDLE a transition — 400ms windows that are part speech and part
   silence, landing within 10 LU of the mean and so passing the relative gate
   legitimately. A real broadcast meter does the same thing. Demanding exact
   equality here would mean breaking the gate to pass the test. */
near(gappy, solid, 1.0, 'silence between lines barely moves the measurement');
is(Math.abs(gappy - solid) > 0.05,
  'and the gate is not simply discarding every quiet block either',
  `${gappy.toFixed(2)} vs ${solid.toFixed(2)}`);

/* silence has no loudness, and saying so is the correct answer. the failure
   this prevents is handing a silent clip the maximum boost. */
const quiet = L.measureBuffer(buffer([0, 0], 48000, 5, out => out.fill(0)));
is(quiet.lufs === null, 'pure silence measures null rather than -Infinity');
is(L.gainFor(quiet.lufs, 'vo', 0) === 0, 'and gets no gain rather than +12dB');

console.log('the gain that gets stored');
/* a quiet take is boosted toward the target... */
is(L.gainFor(-30, 'vo', amp(-20)) > 0, 'a quiet take is boosted');
/* ...but never past what the headroom allows. this is the guard that stops a
   confident normaliser from clipping somebody's recording. */
const hot = L.gainFor(-40, 'vo', 0.98);   // peaks at nearly full scale already
is(hot <= 0.2, 'a boost never exceeds the peak headroom', String(hot));
is(L.gainFor(-6, 'soundtrack', 0.5) < 0, 'an over-loud bed is pulled down');
/* the reader clamps to [-24,+12], so a stored gain outside that would promise
   something playback does not do */
is(L.gainFor(-90, 'vo', 0.0001) <= 12 && L.gainFor(0, 'vo', 1) >= -24,
  'the stored gain stays inside the range the reader honours');

/* the targets are the whole reason ducking can wait: a bed placed 6 LU under
   speech does not need to be pulled down dynamically most of the time. */
is(L.TARGETS.soundtrack < L.TARGETS.vo,
  'a score targets quieter than speech, which is what stands in for ducking');
is(L.TARGETS.sfx < L.TARGETS.vo && L.TARGETS.sfx > L.TARGETS.soundtrack,
  'effects sit between the two');

console.log('one gain for a whole part');
/* THE POINT: a performance keeps its dynamics. Three takes twenty dB apart
   must get ONE correction between them, not three that flatten them level. */
const takes = [
  { lufs: -30, peak: amp(-24), duration: 3 },   // a whisper
  { lufs: -18, peak: amp(-12), duration: 3 },   // normal
  { lufs: -10, peak: amp(-4),  duration: 3 }    // a shout
];
const whole = L.combine(takes);
is(whole.lufs > -18 && whole.lufs < -10,
  'the aggregate is energy weighted, so the loud take dominates',
  String(whole.lufs));
is(whole.peak === amp(-4), 'and the headroom is the loudest peak in the part');
/* one gain, applied to all three, leaves them exactly as far apart as they
   were — which is the whole reason this is not done per clip */
const g = L.gainFor(whole.lufs, 'vo', whole.peak);
const after = takes.map(t => t.lufs + g);
near(after[1] - after[0], 12, 0.001, 'the whisper stays 12 LU under the normal take');
near(after[2] - after[1], 8,  0.001, 'and the shout stays 8 LU above it');

/* duration weighting: a long quiet bed should not be outvoted by a one-second
   sting just because they are two entries in a list */
const weighted = L.combine([
  { lufs: -30, peak: 0.1, duration: 60 },
  { lufs: -10, peak: 0.5, duration: 1 }
]);
is(weighted.lufs < -20, 'a 60s quiet bed outweighs a 1s loud sting',
  String(weighted.lufs));

is(L.combine([]).lufs === null, 'an empty part has no loudness');
is(L.combine([{ lufs: null, duration: 5 }]).lufs === null,
  'and unmeasurable clips do not invent one');

console.log(bad ? `\n${bad} FAILURES` : '\nloudness: all checks passed');
process.exit(bad ? 1 : 0);

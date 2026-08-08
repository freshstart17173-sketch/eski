/* eski — loudness, measured the way broadcast measures it.

   WHY THIS EXISTS. Every clip on this site is recorded by a different person
   in a different room on different equipment. One voice actor peaks at -1dBFS
   into a condenser, the next records on a laptop mic at -20, and a composer
   masters a bed to modern loudness-war levels. Stacked in the reader, the
   quiet one is inaudible under the loud one and the reader rides the volume
   slider all the way through the comic. Peak normalisation does NOT fix this:
   a whisper and a shout can have identical peaks and be twenty dB apart in
   perceived loudness.

   So loudness is measured, not amplitude — ITU-R BS.1770-4, the algorithm
   behind EBU R128 and every streaming service's normalisation. In one
   paragraph:

     1. K-WEIGHT the signal: a high shelf that lifts treble ~4dB, then a
        high-pass at ~38Hz. Together they approximate how a head and ear
        actually respond, which is why they weight what people HEAR rather
        than what a meter sees.
     2. Take the mean square over 400ms blocks overlapping by 75%.
     3. GATE. Drop blocks below an absolute -70 LUFS (silence should not drag
        the average down), then compute the mean of what is left and drop
        everything more than 10 LU below THAT (so a quiet passage does not
        count against a piece that is mostly loud). The relative gate is the
        step that makes a dialogue clip with pauses in it measure the same as
        one without.
     4. What remains, in LUFS, is the integrated loudness.

   The result goes on the track as `lufs`, and `gain_db` becomes the
   difference between it and a target. Storing BOTH matters: the measurement
   is a fact about the audio and never changes, while the target is a mix
   decision that might, and keeping them apart means retargeting the whole
   library is one UPDATE rather than re-downloading and re-analysing every
   clip.

   Loaded as a classic script; exposes window.eskiLoudness.  */
(function (global) {
  'use strict';

  /* THE TARGETS, and they are the reason ducking can wait.

     Dynamic ducking — pulling the music down whenever a voice is present —
     is the usual answer to "the score buries the dialogue". It is also
     fiddly, needs a sidechain and a release curve, and goes wrong audibly
     when it mistimes. A large part of what it is for is fixed by simply
     placing the layers at sensible fixed loudnesses relative to each other,
     because the problem is mostly that they arrived at random ones.

     -16 LUFS for speech is the podcast convention and what Apple and Spotify
     target for spoken word. The score sits 6 LU under it, which is roughly
     the film convention for a bed under dialogue, and effects sit between:
     they need to be present without competing with a line. */
  var TARGETS = {
    vo:         -16,
    line:       -16,
    sfx:        -18,
    soundtrack: -22
  };
  var DEFAULT_TARGET = -18;

  /* the reader clamps to this range, so measuring a gain outside it and
     storing it anyway would promise something playback cannot deliver */
  var MIN_DB = -24, MAX_DB = 12;

  var BLOCK_S = 0.400;          // BS.1770 block length
  var OVERLAP = 0.75;           // 75%, so a new block every 100ms
  var ABS_GATE = -70;           // LUFS
  var REL_GATE = -10;           // LU below the ungated mean

  /* ---------------- K-weighting ----------------
     The spec publishes coefficients at 48kHz only. Rather than resample
     everything to 48k — which costs time and quality on a long bed — the two
     filters are re-derived at whatever rate the file actually decoded to.

     THE PARAMETERS ARE NOT THE ONES PRINTED IN THE SPEC, and that is on
     purpose. BS.1770 describes its shelf as centred at 1681.97Hz; that is the
     shelf's MIDPOINT, not the corner frequency an RBJ biquad takes, and
     feeding it to the cookbook formula produces a filter 0.26dB light at 1kHz
     — which shows up as every measurement reading 0.25 LU low. The values
     below were fitted against the spec's own published 48kHz coefficients and
     reproduce them to 1e-4 (shelf) and 1e-7 (high-pass). tests/loudness.js
     checks the result, not the coefficients, against the EBU conformance
     cases, so a future edit here that breaks the match will fail loudly.

     The high-pass keeps b = [1,-2,1] UNNORMALISED while a is normalised,
     which is exactly how the spec writes it and is worth +0.043dB of
     passband gain. Dividing b by a0 as well — the reflex when writing an RBJ
     filter — silently loses that. */
  var SHELF = { f0: 1500.0, G: 4.0, Q: Math.SQRT1_2 };
  var HPF   = { f0: 38.11, Q: 0.5 };

  function shelfCoeffs(rate) {
    var A  = Math.pow(10, SHELF.G / 40);
    var w0 = 2 * Math.PI * SHELF.f0 / rate;
    var cw = Math.cos(w0), sw = Math.sin(w0);
    var a  = sw / (2 * SHELF.Q);
    var sq = 2 * Math.sqrt(A) * a;

    var b0 =      A * ((A + 1) + (A - 1) * cw + sq);
    var b1 = -2 * A * ((A - 1) + (A + 1) * cw);
    var b2 =      A * ((A + 1) + (A - 1) * cw - sq);
    var a0 =           (A + 1) - (A - 1) * cw + sq;
    var a1 =      2 * ((A - 1) - (A + 1) * cw);
    var a2 =           (A + 1) - (A - 1) * cw - sq;
    return { b: [b0 / a0, b1 / a0, b2 / a0], a: [1, a1 / a0, a2 / a0] };
  }

  function hpfCoeffs(rate) {
    var w0 = 2 * Math.PI * HPF.f0 / rate;
    var cw = Math.cos(w0), sw = Math.sin(w0);
    var a  = sw / (2 * HPF.Q);
    var a0 = 1 + a;
    // b stays [1,-2,1]; only a is normalised. see the note above.
    return { b: [1, -2, 1], a: [1, (-2 * cw) / a0, (1 - a) / a0] };
  }

  /* a direct-form-II transposed biquad, in place. done in plain JS rather
     than with IIRFilterNode because an OfflineAudioContext render is
     asynchronous, allocates a second copy of the whole buffer, and for a
     three-minute bed is slower than this loop. */
  function biquad(samples, c) {
    var b0 = c.b[0], b1 = c.b[1], b2 = c.b[2], a1 = c.a[1], a2 = c.a[2];
    var z1 = 0, z2 = 0;
    for (var i = 0; i < samples.length; i++) {
      var x = samples[i];
      var y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      samples[i] = y;
    }
  }

  /* BS.1770 channel weights. Stereo and mono are all this site has ever
     seen, but a 5.1 upload should not silently measure wrong: the surrounds
     carry +1.5dB, and anything past six channels is not something to guess
     at, so it is weighted 1 and left alone.

     MONO IS DELIBERATELY NOT BS.1770. The spec sums channel powers, so a mono
     file measures 3 LU quieter than the same signal duplicated to two
     channels — correct, because two speakers really are louder than one. But
     nothing here ever plays a mono file as one channel: an <audio> element
     and Web Audio both upmix mono by copying it to both outputs, which puts
     that 3dB straight back. Measuring the file as it sits on disk and then
     normalising would therefore leave every mono recording 3dB hot, and
     almost every voice take somebody records into a laptop is mono.

     So a single channel is weighted as the dual-mono it will be played as.
     This is a deviation from the standard and it is the right one: what is
     being normalised is how loud the clip will SOUND in this reader, not what
     a compliance meter would print for the file. */
  function channelWeight(index, count) {
    if (count === 1) return 2;
    if (count === 2) return 1;
    if (count >= 5 && (index === 4 || index === 5)) return 1.41;
    return 1;
  }

  /* ---------------- the measurement ----------------
     Takes a decoded AudioBuffer. Returns { lufs, peak, duration } — or lufs
     null when there is nothing to measure, which is a real answer and not a
     failure: a clip of pure silence has no loudness, and pretending it does
     would hand it a +24dB gain. */
  function measureBuffer(buf) {
    var rate = buf.sampleRate;
    var chans = buf.numberOfChannels;
    var shelf = shelfCoeffs(rate), hpf = hpfCoeffs(rate);

    var blockLen = Math.round(BLOCK_S * rate);
    var hop = Math.round(blockLen * (1 - OVERLAP));
    if (!blockLen || !hop || buf.length < blockLen)
      return { lufs: null, peak: peakOf(buf), duration: buf.duration,
               why: 'shorter than one 400ms block' };

    /* per channel: copy, K-weight, then accumulate each block's mean square
       weighted by that channel's coefficient. one pass, one array per
       channel, so a long bed does not hold every block of every channel. */
    var blocks = Math.floor((buf.length - blockLen) / hop) + 1;
    var power = new Float64Array(blocks);
    var peak = 0;

    for (var ch = 0; ch < chans; ch++) {
      var src = buf.getChannelData(ch);
      for (var p = 0; p < src.length; p++) {
        var av = src[p] < 0 ? -src[p] : src[p];
        if (av > peak) peak = av;
      }
      var work = new Float32Array(src);       // filtering is destructive
      biquad(work, shelf);
      biquad(work, hpf);

      var G = channelWeight(ch, chans);
      for (var b = 0; b < blocks; b++) {
        var start = b * hop, sum = 0;
        for (var i = start; i < start + blockLen; i++) sum += work[i] * work[i];
        power[b] += G * (sum / blockLen);
      }
    }

    /* absolute gate first, then the relative gate against what survived it */
    var loud = [];
    for (var k = 0; k < blocks; k++) {
      if (power[k] <= 0) continue;
      var l = -0.691 + 10 * Math.log10(power[k]);
      if (l > ABS_GATE) loud.push({ l: l, p: power[k] });
    }
    if (!loud.length)
      return { lufs: null, peak: peak, duration: buf.duration,
               why: 'nothing above the -70 LUFS absolute gate' };

    var mean = 0;
    for (var m = 0; m < loud.length; m++) mean += loud[m].p;
    mean /= loud.length;
    var relative = -0.691 + 10 * Math.log10(mean) + REL_GATE;

    var kept = 0, sum2 = 0;
    for (var n = 0; n < loud.length; n++)
      if (loud[n].l > relative) { sum2 += loud[n].p; kept++; }
    if (!kept)
      return { lufs: null, peak: peak, duration: buf.duration,
               why: 'nothing survived the relative gate' };

    return {
      lufs: -0.691 + 10 * Math.log10(sum2 / kept),
      peak: peak,
      duration: buf.duration
    };
  }

  function peakOf(buf) {
    var peak = 0;
    for (var ch = 0; ch < buf.numberOfChannels; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < d.length; i++) {
        var a = d[i] < 0 ? -d[i] : d[i];
        if (a > peak) peak = a;
      }
    }
    return peak;
  }

  /* WHAT GAIN TO STORE.

     target - measured is the whole calculation, with two guards on it.

     The clamp is the reader's own range, so a stored gain always means what
     playback will do. The peak guard is the one that matters: a clip already
     mastered to -6 LUFS asked to reach -16 needs -10dB and that is fine, but
     a very quiet clip can ask for +18dB, and applying that to something whose
     peak is already -2dBFS clips it audibly. So the boost never exceeds what
     the headroom allows, leaving 1dB of it. A clip that cannot reach the
     target is left quieter than the target rather than distorted — a quiet
     take is a fixable problem and a clipped one is not. */
  function gainFor(lufs, kind, peak) {
    if (lufs == null || !isFinite(lufs)) return 0;
    var target = TARGETS[kind] != null ? TARGETS[kind] : DEFAULT_TARGET;
    var db = target - lufs;
    if (peak > 0) {
      var headroom = -1 - 20 * Math.log10(peak);   // dB before it hits -1dBFS
      if (db > headroom) db = headroom;
    }
    if (db < MIN_DB) db = MIN_DB;
    if (db > MAX_DB) db = MAX_DB;
    return Math.round(db * 10) / 10;
  }

  /* the whole job, from a Blob or File, in one call. decoding is the
     expensive half and is shared, so a caller never decodes twice. */
  async function analyse(blob, kind, ctx) {
    var own = false;
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return { lufs: null, gainDb: 0, why: 'no web audio in this browser' };
      ctx = new AC();
      own = true;
    }
    try {
      var bytes = await blob.arrayBuffer();
      var buf = await ctx.decodeAudioData(bytes);
      var m = measureBuffer(buf);
      return {
        lufs: m.lufs == null ? null : Math.round(m.lufs * 10) / 10,
        peak: m.peak,
        duration: m.duration,
        gainDb: gainFor(m.lufs, kind, m.peak),
        target: TARGETS[kind] != null ? TARGETS[kind] : DEFAULT_TARGET,
        why: m.why || null
      };
    } catch (e) {
      /* A FILE THAT WILL NOT DECODE IS STILL A FILE THE READER MIGHT PLAY —
         browsers differ on what they will decode versus what they will play
         through an <audio> element. So this never throws: it reports no
         measurement and a gain of zero, and the upload carries on. */
      return { lufs: null, gainDb: 0, why: (e && e.message) || String(e) };
    } finally {
      if (own && ctx.close) ctx.close();
    }
  }

  /* ---------------- one gain for a whole part ----------------
     NORMALISING EACH CLIP SEPARATELY WOULD FLATTEN THE ACTING OUT OF IT.

     A voice actor's forty takes are one performance. A whisper is quiet
     BECAUSE it is a whisper, and a shout is loud on purpose; measuring each
     take and pulling each to -16 LUFS makes them identical and throws away
     the only thing the performance was doing. The same is true of a score
     (a quiet cue under a loud one is the composer's decision) and of effects
     (a distant siren against a gunshot).

     What actually needs fixing is not the range WITHIN one person's work but
     the offset BETWEEN two people's. So the whole part is measured as if it
     were one continuous piece and gets ONE correction, which moves everybody
     onto the same scale and leaves every relative level inside a part exactly
     as its author set it. This is the same distinction streaming services
     draw between track and album normalisation, and a part is an album.

     The aggregate is energy weighted by duration, which is what measuring the
     concatenation would give: a four-second line counts four times a
     one-second one rather than equally. */
  function combine(list) {
    var power = 0, secs = 0, peak = 0;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || m.lufs == null || !isFinite(m.lufs)) continue;
      var d = m.duration > 0 ? m.duration : 1;
      power += Math.pow(10, (m.lufs + 0.691) / 10) * d;
      secs += d;
      if (m.peak > peak) peak = m.peak;
    }
    if (!secs || power <= 0) return { lufs: null, peak: peak, duration: secs };
    return {
      lufs: -0.691 + 10 * Math.log10(power / secs),
      peak: peak,
      duration: secs
    };
  }

  global.eskiLoudness = {
    analyse: analyse,
    combine: combine,
    measureBuffer: measureBuffer,
    gainFor: gainFor,
    TARGETS: TARGETS,
    /* "-16.2 LUFS · +3.1 dB" — said in full, because a contributor who can
       see the number can act on it, and "quiet" cannot be acted on. */
    describe: function (r) {
      if (!r || r.lufs == null) return 'not measured';
      var g = r.gainDb;
      return r.lufs.toFixed(1) + ' LUFS' +
        (g ? ' · ' + (g > 0 ? '+' : '') + g.toFixed(1) + ' dB' : ' · at target');
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

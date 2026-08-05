/* ============================================================
   one chapter, shared by all three studios.
   what the author writes here is what the composer and the
   performer see: characters, dialogue, and — new — sound effects.
   ============================================================ */

const COMIC = {
  title:'the second dark',
  by:'okonkwo & lai',
  chapter:'chapter 1',
  pageCount:24,
  art:'../../covers/second-dark.jpg'
};
/* the mockups stand one image in for every page; the real pages come out of
   the .eski the same way the reader loads them. */
COMIC.pages = Array.from({length:COMIC.pageCount}, (_, i) => ({n:i + 1, src:COMIC.art}));

/* ---------- roles. four kinds of sound, four hues, one legend ----------
   used identically in every studio: a dialogue line, its voiceover clip and
   its lane are the same colour on three different pages. */
const ROLE = {
  voice:{label:'voice',  icon:'mic',   light:'#B4762A', dark:'#E0A94A'},
  score:{label:'score',  icon:'music', light:'#4F7A64', dark:'#7FB09A'},
  bed:  {label:'bed',    icon:'waves', light:'#3F6F8E', dark:'#6FA8C9'},
  sfx:  {label:'effects',icon:'zap',   light:'#6E58A0', dark:'#A98FD6'}
};
const roleColor = k => {
  const r = ROLE[k] || ROLE.score;
  return document.documentElement.dataset.theme === 'dark' ? r.dark : r.light;
};

/* characters carry their own colour so a performer can find their lines in a
   page of everyone else's. six swatches, assigned in order. */
const CAST_COLORS = ['#B4762A','#3F6F8E','#6E58A0','#4F7A64','#A6483C','#7A6A2E'];

const CAST = [
  {id:'gwen', name:'gwen', kind:'lead',
   desc:'The one who agreed to count. Keeps the village’s tally of the night, and is the last to admit the number is wrong.',
   voice:'Village accent, careful with numbers. Starts level and unravels quietly. Never shouts; the fear arrives as precision.'},
  {id:'mother', name:'the mother', kind:'supporting',
   desc:'Gwen’s mother, who has lived through this before and will not say so.',
   voice:'Speaks in proverbs and means every one as a threat. Low, slow, no warmth in the vowels.'},
  {id:'narration', name:'narration', kind:'narration',
   desc:'A folklorist reading her own field notes back, thirty years too late to help.',
   voice:'Dry, academic, faintly guilty. Reads the horror as though it were a footnote.'},
  {id:'elder', name:'the elder', kind:'supporting',
   desc:'Keeps the lamp oil and the old rule about the door.',
   voice:'Thin, patient, and completely certain. Rarely finishes a sentence.'}
];
CAST.forEach((c, i) => c.color = CAST_COLORS[i % CAST_COLORS.length]);
const castById = id => CAST.find(c => c.id === id);

/* ---------- the script. two kinds of entry. ----------
   dialogue  — a character says a line, with a direction for how
   sfx       — a sound in the art, lettered or not, for the composer to fill */
const SCRIPT = [
  {id:'s1', p:1, kind:'dialogue', c:'narration', dir:'flat, reading aloud',
   t:'The village agreed to one night without light. They had done it before, and nothing had come of it.'},
  {id:'s2', p:1, kind:'sfx', letter:'', t:'wind against the shutters, continuous'},
  {id:'s3', p:1, kind:'dialogue', c:'gwen', dir:'', t:'Forty-one. That’s everyone.'},
  {id:'s4', p:1, kind:'dialogue', c:'mother', dir:'not looking up', t:'Count again.'},

  {id:'s5', p:2, kind:'sfx', letter:'KRAK', t:'a branch giving way somewhere past the fence'},
  {id:'s6', p:2, kind:'dialogue', c:'gwen', dir:'worried', t:'Forty-two.'},
  {id:'s7', p:2, kind:'dialogue', c:'narration', dir:'',
   t:'She counted a third time, and got forty-one, and did not say so.'},
  {id:'s8', p:2, kind:'dialogue', c:'elder', dir:'from the doorway', t:'Nobody opens it. That’s the rule, that’s all.'},

  {id:'s9', p:3, kind:'sfx', letter:'THMP', t:'one knock, low on the door'},
  {id:'s10', p:3, kind:'dialogue', c:'mother', dir:'sad',
   t:'It isn’t your fault. It was always going to be one of you.'},
  {id:'s11', p:3, kind:'dialogue', c:'gwen', dir:'choking', t:'Mam—'},
  {id:'s12', p:3, kind:'sfx', letter:'', t:'the lamp going out; everything after this is room tone'},

  {id:'s13', p:4, kind:'dialogue', c:'narration', dir:'',
   t:'There is a moment before the door opens when the whole village is still forty-one.'},
  {id:'s14', p:4, kind:'dialogue', c:'gwen', dir:'whispered', t:'Don’t.'},
  {id:'s15', p:4, kind:'sfx', letter:'CLK', t:'the latch'}
];

const linesOn = p => SCRIPT.filter(l => l.p === p);
const dialogueOn = p => linesOn(p).filter(l => l.kind === 'dialogue');
const sfxOn = p => linesOn(p).filter(l => l.kind === 'sfx');
const forChar = id => SCRIPT.filter(l => l.kind === 'dialogue' && l.c === id);

/* ---------- the score. layers stack; clips own page ranges. ---------- */
const LAYERS = [
  {id:'L1', name:'rain', kind:'bed', volume:45, muted:false, clips:[
    {id:'c1', name:'rain, continuous', from:1, to:24, loop:true, gain:-6, dur:'4:12'}
  ]},
  {id:'L2', name:'score', kind:'score', volume:100, muted:false, clips:[
    {id:'c2', name:'one night without light', from:1, to:6, loop:true, gain:0, dur:'6:40'},
    {id:'c3', name:'the counting', from:7, to:13, loop:true, gain:-2, dur:'3:58'},
    {id:'c4', name:'forty-two', from:16, to:24, loop:false, gain:0, dur:'5:02'}
  ]},
  {id:'L3', name:'room tone', kind:'bed', volume:30, muted:false, clips:[
    {id:'c5', name:'hall, empty', from:9, to:18, loop:true, gain:-10, dur:'2:00'}
  ]},
  {id:'L4', name:'effects', kind:'sfx', volume:100, muted:false, clips:[
    {id:'c6', name:'shutters', from:1, to:1, loop:false, gain:-4, dur:'0:06', cue:'s2'}
  ]},
  {id:'L5', name:'gwen', kind:'voice', character:'gwen', volume:100, muted:false, locked:true, clips:[
    {id:'v1', name:'gwen · 3 lines', from:1, to:4, loop:false, gain:0, dur:'—'}
  ]}
];

const BAY = [
  {id:'b1', name:'thunder-distant.wav', dur:'0:08'},
  {id:'b2', name:'strings-cold.mp3', dur:'5:20'},
  {id:'b3', name:'wind-loop.opus', dur:'1:30'},
  {id:'b4', name:'door-knock-03.wav', dur:'0:03'}
];

/* every sfx cue the author wrote that nobody has dropped a file onto yet.
   this is what turns the composer's blank page into a worklist. */
const openCues = () => SCRIPT.filter(l => l.kind === 'sfx' &&
  !LAYERS.some(L => L.clips.some(c => c.cue === l.id)));

const esc = s => String(s).replace(/[&<>"]/g, m =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const clock1 = s => `${Math.floor(s/60)}:${(s%60).toFixed(1).padStart(4,'0')}`;

/* one preview at a time, everywhere */
let playing = null, playTimer;
function stopPlay(){
  if(!playing) return;
  playing.classList.remove('playing');
  playing.innerHTML = icon('play');
  playing = null;
}
function play_(btn, secs){
  if(playing && playing !== btn) stopPlay();
  clearTimeout(playTimer);
  if(btn.classList.contains('playing')){ stopPlay(); return; }
  btn.style.setProperty('--prev-t', secs + 's');
  btn.innerHTML = icon('pause') + '<i></i>';
  requestAnimationFrame(() => btn.classList.add('playing'));
  playing = btn;
  playTimer = setTimeout(stopPlay, secs * 1000);
}

let toastTimer;
function toast(msg){
  let t = document.querySelector('.toast');
  if(!t){ t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1700);
}

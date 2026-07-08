<template>
  <div
    v-if="activeAnim"
    :class="['reaction-overlay', `react-${activeAnim}`]"
    class="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
  >
    <img
      :src="reactionImages[activeAnim]"
      :class="['w-32 h-32 drop-shadow-2xl object-contain absolute z-20', `anim-react-${activeAnim}`]"
      alt=""
    />

    <div class="reaction-burst z-10"></div>

    <div class="particles z-0">
      <span v-for="i in 8" :key="i"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  playHapticPattern,
  reactionAnimDuration,
  reactionImages
} from '@/config/post.config'

const activeAnim = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

/**
 * Fire the on-image reaction burst (sticker + halo + particles) plus the
 * matching haptic. Safe to call repeatedly — it restarts cleanly.
 */
function play(reaction: string) {
  if (!reaction || !reactionImages[reaction]) return
  if (timer) clearTimeout(timer)
  // Force a fresh mount so the CSS animation replays even on the same type.
  activeAnim.value = null
  requestAnimationFrame(() => {
    activeAnim.value = reaction
    playHapticPattern(reaction)
    timer = setTimeout(() => {
      activeAnim.value = null
      timer = null
    }, reactionAnimDuration[reaction] ?? 1400)
  })
}

defineExpose({ play })
</script>

<style scoped>
.reaction-overlay {
  perspective: 800px;
}

/* Per-emotion palette. --r-accent drives particles, --r-glow the burst,
   --r-shadow the halo behind the sticker. */
.react-love  { --r-accent: 255, 86, 116;  --r-glow: 255, 150, 175; --r-shadow: 255, 70, 110; }
.react-fire  { --r-accent: 255, 138, 40;   --r-glow: 255, 176, 74;  --r-shadow: 255, 110, 30; }
.react-cry   { --r-accent: 86, 172, 255;   --r-glow: 150, 205, 255; --r-shadow: 70, 150, 240; }
.react-crazy { --r-accent: 190, 90, 255;   --r-glow: 120, 235, 160; --r-shadow: 200, 90, 255; }
.react-sleep { --r-accent: 138, 152, 214;  --r-glow: 190, 200, 235; --r-shadow: 120, 135, 200; }


/* ---------- GLOBAL IMPACT HALO ---------- */

.reaction-burst {
  position: absolute;
  width: 140px;
  height: 140px;
  border-radius: 9999px;
  background: radial-gradient(
    circle,
    rgba(var(--r-glow, 255, 255, 255), .9),
    rgba(var(--r-glow, 255, 255, 255), 0) 68%
  );
  animation: impactBurst .75s cubic-bezier(.2, .8, .2, 1) forwards;
}

@keyframes impactBurst {
  0%   { transform: scale(.1); opacity: 0; }
  22%  { opacity: 1; }
  100% { transform: scale(3); opacity: 0; }
}


/* ---------- PARTICLES ---------- */

.particles span {
  position: absolute;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: rgb(var(--r-accent, 255, 255, 255));
  box-shadow: 0 0 8px rgba(var(--r-accent, 255, 255, 255), .8);
  opacity: 0;
  animation: particleExplode 900ms cubic-bezier(.15, .8, .3, 1) forwards;
}

@keyframes particleExplode {
  from { transform: translate(0, 0) scale(1); opacity: 1; }
  to   { transform: translate(var(--tx), var(--ty)) rotate(180deg) scale(0); opacity: 0; }
}

/* Default radial spread (love / crazy use this shape). */
.particles span:nth-child(1) { --tx: -90px;  --ty: -70px; }
.particles span:nth-child(2) { --tx: 90px;   --ty: -50px; }
.particles span:nth-child(3) { --tx: -110px; --ty: 20px;  }
.particles span:nth-child(4) { --tx: 110px;  --ty: 30px;  }
.particles span:nth-child(5) { --tx: -60px;  --ty: 100px; }
.particles span:nth-child(6) { --tx: 70px;   --ty: 90px;  }
.particles span:nth-child(7) { --tx: 0px;    --ty: -120px;}
.particles span:nth-child(8) { --tx: 0px;    --ty: 120px; }


/* =========================
   LOVE ❤️  — pop, double heartbeat, drift up
========================= */
.anim-react-love {
  filter: drop-shadow(0 6px 18px rgba(var(--r-shadow), .55));
  animation:
    loveEntrance .34s cubic-bezier(.2, 1.7, .4, 1) forwards,
    loveBeat .9s .34s ease-in-out forwards,
    loveExit .3s 1.15s ease-in forwards;
}
@keyframes loveEntrance {
  from { transform: scale(0) rotate(-24deg); }
  to   { transform: scale(1.2) rotate(6deg); }
}
@keyframes loveBeat {
  0%   { transform: scale(1.2) rotate(6deg); }
  15%  { transform: scale(1.42) rotate(0deg); }   /* lub */
  30%  { transform: scale(1.12); }
  45%  { transform: scale(1.34); }                /* dub */
  60%  { transform: scale(1.15) translateY(-6px); }
  100% { transform: scale(1.18) translateY(-16px); }
}
@keyframes loveExit {
  to { transform: scale(1) translateY(-70px); opacity: 0; }
}
/* Hearts float upward. */
.react-love .particles span { border-radius: 50% 50% 0 0 / 60% 60% 0 0; transform-origin: center; }
.react-love .particles span:nth-child(odd)  { animation: floatUp 1s cubic-bezier(.3, .7, .3, 1) forwards; }
.react-love .particles span:nth-child(even) { animation: floatUp 1.15s .05s cubic-bezier(.3, .7, .3, 1) forwards; }


/* =========================
   FIRE 🔥  — erupt, flicker, roar upward
========================= */
.anim-react-fire {
  transform-origin: bottom center;
  filter: drop-shadow(0 4px 20px rgba(var(--r-shadow), .7));
  animation:
    fireIgnite .26s cubic-bezier(.2, .9, .3, 1) forwards,
    fireFlicker .7s .26s ease-in-out forwards,
    fireRoar .34s 1.1s ease-in forwards;
}
@keyframes fireIgnite {
  from { transform: translateY(70px) scale(.3); opacity: 0; }
  to   { transform: translateY(0) scale(1.3); opacity: 1; }
}
@keyframes fireFlicker {
  0%   { transform: scale(1.3) rotate(-6deg) skewX(4deg);  filter: brightness(1.15) drop-shadow(0 4px 20px rgba(var(--r-shadow), .7)); }
  20%  { transform: scale(1.14) rotate(5deg) skewX(-5deg); filter: brightness(.95) drop-shadow(0 4px 16px rgba(var(--r-shadow), .6)); }
  40%  { transform: scale(1.3) rotate(-4deg) skewX(4deg);  filter: brightness(1.2) drop-shadow(0 4px 22px rgba(var(--r-shadow), .8)); }
  60%  { transform: scale(1.16) rotate(3deg) skewX(-3deg); filter: brightness(1); }
  100% { transform: scale(1.24) translateY(-24px) rotate(-2deg); }
}
@keyframes fireRoar {
  to { transform: translateY(-96px) scale(.45); opacity: 0; }
}
/* Embers streak upward and outward. */
.react-fire .particles span { width: 9px; height: 9px; }
.react-fire .particles span:nth-child(1) { --tx: -70px; --ty: -140px; }
.react-fire .particles span:nth-child(2) { --tx: 60px;  --ty: -120px; }
.react-fire .particles span:nth-child(3) { --tx: -40px; --ty: -170px; }
.react-fire .particles span:nth-child(4) { --tx: 45px;  --ty: -150px; }
.react-fire .particles span:nth-child(5) { --tx: -90px; --ty: -100px; }
.react-fire .particles span:nth-child(6) { --tx: 85px;  --ty: -90px;  }
.react-fire .particles span:nth-child(7) { --tx: 10px;  --ty: -190px; }
.react-fire .particles span:nth-child(8) { --tx: -15px; --ty: -160px; }
.react-fire .particles span { animation-timing-function: cubic-bezier(.2, .6, .3, 1); }


/* =========================
   CRY 😭  — well up, tremble, tear falls
========================= */
.anim-react-cry {
  filter: drop-shadow(0 6px 16px rgba(var(--r-shadow), .45));
  animation:
    cryAppear .32s ease-out forwards,
    cryTremble .5s .32s ease-in-out forwards,
    cryDrop .7s .82s cubic-bezier(.5, 0, .75, 0) forwards;
}
@keyframes cryAppear {
  from { transform: translateY(-40px) scale(.5); opacity: 0; }
  to   { transform: translateY(0) scale(1.12); opacity: 1; }
}
@keyframes cryTremble {
  0%, 100% { transform: translateY(0) scale(1.12) rotate(0deg); }
  25% { transform: translateY(1px) scale(1.12) rotate(-3deg); }
  50% { transform: translateY(0) scale(1.1) rotate(3deg); }
  75% { transform: translateY(1px) scale(1.12) rotate(-2deg); }
}
@keyframes cryDrop {
  0%   { transform: translateY(0) scaleY(1); }
  20%  { transform: translateY(6px) scaleY(.9) scaleX(1.05); }
  100% { transform: translateY(120px) scaleY(1.15) scaleX(.85); opacity: 0; }
}
/* Teardrops fall. */
.react-cry .particles span { border-radius: 50% 50% 50% 0; }
.react-cry .particles span:nth-child(1) { --tx: -40px; --ty: 120px; }
.react-cry .particles span:nth-child(2) { --tx: 44px;  --ty: 130px; }
.react-cry .particles span:nth-child(3) { --tx: -70px; --ty: 100px; }
.react-cry .particles span:nth-child(4) { --tx: 66px;  --ty: 110px; }
.react-cry .particles span:nth-child(5) { --tx: -20px; --ty: 150px; }
.react-cry .particles span:nth-child(6) { --tx: 24px;  --ty: 140px; }
.react-cry .particles span:nth-child(7) { --tx: -8px;  --ty: 160px; }
.react-cry .particles span:nth-child(8) { --tx: 12px;  --ty: 155px; }
.react-cry .particles span { animation-timing-function: cubic-bezier(.5, 0, .8, .3); }


/* =========================
   CRAZY 🤪  — dizzy overshoot spin & wobble (slow, comedic)
========================= */
.anim-react-crazy {
  filter: drop-shadow(0 4px 18px rgba(var(--r-shadow), .5));
  animation: crazySpin 1.55s cubic-bezier(.36, .07, .19, .97) forwards;
}
@keyframes crazySpin {
  0%   { transform: scale(.2) rotate(0deg) translateX(0); opacity: 0; }
  12%  { transform: scale(1.35) rotate(24deg) translateX(9px); opacity: 1; }
  26%  { transform: scale(1) rotate(-28deg) translateX(-11px); }
  40%  { transform: scale(1.3) rotate(30deg) translateX(9px); }
  54%  { transform: scale(1.05) rotate(-24deg) translateX(-8px); }
  68%  { transform: scale(1.28) rotate(210deg) translateX(6px); }
  82%  { transform: scale(1.1) rotate(340deg) translateX(-4px); }
  92%  { transform: scale(1.22) rotate(430deg) translateX(2px); }
  100% { transform: scale(.35) rotate(520deg); opacity: 0; }
}
/* Multicolour confetti. */
.react-crazy .particles span { border-radius: 2px; }
.react-crazy .particles span:nth-child(1) { background: #ff5a7a; box-shadow: 0 0 8px #ff5a7a; }
.react-crazy .particles span:nth-child(2) { background: #ffd23f; box-shadow: 0 0 8px #ffd23f; }
.react-crazy .particles span:nth-child(3) { background: #3fd0ff; box-shadow: 0 0 8px #3fd0ff; }
.react-crazy .particles span:nth-child(4) { background: #78eb64; box-shadow: 0 0 8px #78eb64; }
.react-crazy .particles span:nth-child(5) { background: #c05aff; box-shadow: 0 0 8px #c05aff; }
.react-crazy .particles span:nth-child(6) { background: #ff9a3f; box-shadow: 0 0 8px #ff9a3f; }
.react-crazy .particles span:nth-child(7) { background: #ff5a7a; box-shadow: 0 0 8px #ff5a7a; }
.react-crazy .particles span:nth-child(8) { background: #3fd0ff; box-shadow: 0 0 8px #3fd0ff; }
.react-crazy .particles span { animation-duration: 1.2s; }


/* =========================
   SLEEP 😴  — slow breathing rock, drifts up
========================= */
.anim-react-sleep {
  filter: drop-shadow(0 6px 16px rgba(var(--r-shadow), .4));
  animation: sleepDrift 1.7s cubic-bezier(.4, 0, .3, 1) forwards;
}
@keyframes sleepDrift {
  0%   { transform: translateY(30px) scale(.6) rotate(-6deg); opacity: 0; }
  22%  { transform: translateY(0) scale(1) rotate(6deg); opacity: 1; }
  45%  { transform: translateY(-18px) scale(1.06) rotate(-6deg); }
  68%  { transform: translateY(-36px) scale(1.02) rotate(5deg); }
  100% { transform: translateY(-72px) scale(.72) rotate(-3deg); opacity: 0; }
}
/* Soft "Z" motes drift lazily up-right. */
.react-sleep .particles span:nth-child(1) { --tx: 30px;  --ty: -90px; }
.react-sleep .particles span:nth-child(2) { --tx: 50px;  --ty: -70px; }
.react-sleep .particles span:nth-child(3) { --tx: 20px;  --ty: -120px;}
.react-sleep .particles span:nth-child(4) { --tx: 60px;  --ty: -100px;}
.react-sleep .particles span:nth-child(5) { --tx: 40px;  --ty: -60px; }
.react-sleep .particles span:nth-child(6) { --tx: 70px;  --ty: -80px; }
.react-sleep .particles span:nth-child(7) { --tx: 15px;  --ty: -140px;}
.react-sleep .particles span:nth-child(8) { --tx: 55px;  --ty: -110px;}
.react-sleep .particles span { animation-duration: 1.4s; animation-timing-function: ease-in-out; }


/* Shared upward float used by love hearts. */
@keyframes floatUp {
  from { transform: translate(0, 0) scale(1); opacity: 1; }
  to   { transform: translate(var(--tx), calc(var(--ty) - 60px)) scale(0); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .anim-react-love,
  .anim-react-fire,
  .anim-react-cry,
  .anim-react-crazy,
  .anim-react-sleep {
    animation: reduceFade 1s ease forwards;
  }
  .reaction-burst,
  .particles span { animation: reduceFade .8s ease forwards; }
  @keyframes reduceFade {
    0% { opacity: 0; transform: scale(.9); }
    20% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; }
  }
}
</style>

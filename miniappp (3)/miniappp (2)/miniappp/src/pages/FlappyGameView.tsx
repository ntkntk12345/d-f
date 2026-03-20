import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CircleAlert, Coins, Gem, Sparkles, Trophy } from "lucide-react";

import type { GameStore } from "@/hooks/use-game-store";
import { formatNumber } from "@/lib/utils";
import { showReviveRewardedAd } from "@/lib/ad-service";

const W = 400;
const H = 600;
const BIRD_X = 80;
const BIRD_R = 20;
const GRAVITY = 0.36;
const JUMP = -8.2;
const PIPE_W = 58;
const PIPE_GAP = 190;
const PIPE_SPEED = 2.15;
const PIPE_INTERVAL = 2100;
const GROUND_H = 56;
const BEST_SCORE_KEY = "miniappp-flappy-best-score";
const REVIVE_INVINCIBLE_FRAMES = 80;

type GameState = "idle" | "playing" | "dead";
type GameNoticeTone = "record" | "success" | "error";

interface GameNotice {
  id: number;
  tone: GameNoticeTone;
  title: string;
  description?: string;
  gold?: number;
  diamonds?: number;
}

interface Bird {
  y: number;
  vy: number;
  angle: number;
  wingAngle: number;
  wingDir: number;
}

interface Pipe {
  x: number;
  topH: number;
  passed: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  r: number;
  color: string;
}

interface Cloud {
  x: number;
  y: number;
  scale: number;
  speed: number;
}

const STAR_COLORS = ["#FFD700", "#FF8C00", "#FF6B6B", "#7BFF7B", "#87CEEB"];
const GAME_NOTICE_STYLES: Record<
  GameNoticeTone,
  {
    panelBackground: string;
    panelBorder: string;
    panelShadow: string;
    iconBackground: string;
    iconColor: string;
    titleColor: string;
    descriptionColor: string;
  }
> = {
  record: {
    panelBackground: "linear-gradient(135deg, rgba(36,24,6,0.94), rgba(86,38,0,0.88))",
    panelBorder: "1px solid rgba(255,215,64,0.35)",
    panelShadow: "0 14px 34px rgba(0,0,0,0.42), 0 0 24px rgba(255,183,0,0.18)",
    iconBackground: "linear-gradient(135deg, rgba(255,215,64,0.26), rgba(255,143,0,0.3))",
    iconColor: "#FFD54F",
    titleColor: "#FFF3C4",
    descriptionColor: "rgba(255,244,214,0.84)",
  },
  success: {
    panelBackground: "linear-gradient(135deg, rgba(6,28,48,0.94), rgba(10,74,120,0.84))",
    panelBorder: "1px solid rgba(103,232,249,0.3)",
    panelShadow: "0 14px 34px rgba(0,0,0,0.42), 0 0 24px rgba(34,211,238,0.12)",
    iconBackground: "linear-gradient(135deg, rgba(34,211,238,0.22), rgba(59,130,246,0.28))",
    iconColor: "#A5F3FC",
    titleColor: "#E0F7FF",
    descriptionColor: "rgba(220,244,255,0.82)",
  },
  error: {
    panelBackground: "linear-gradient(135deg, rgba(54,10,16,0.95), rgba(87,17,29,0.88))",
    panelBorder: "1px solid rgba(248,113,113,0.28)",
    panelShadow: "0 14px 34px rgba(0,0,0,0.42), 0 0 24px rgba(248,113,113,0.12)",
    iconBackground: "linear-gradient(135deg, rgba(248,113,113,0.18), rgba(239,68,68,0.28))",
    iconColor: "#FCA5A5",
    titleColor: "#FFE4E6",
    descriptionColor: "rgba(255,228,230,0.82)",
  },
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function drawBird(ctx: CanvasRenderingContext2D, bird: Bird, shake: { x: number; y: number }) {
  const cx = BIRD_X + BIRD_R + shake.x;
  const cy = bird.y + BIRD_R + shake.y;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((bird.angle * Math.PI) / 180);

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.filter = "blur(4px)";
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(2, BIRD_R + 6, BIRD_R * 0.85, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "none";
  ctx.restore();

  ctx.save();
  ctx.rotate(-0.15);
  const tailColors = ["#FF7043", "#FF5722", "#E64A19"];
  for (let i = 0; i < 3; i += 1) {
    const offset = (i - 1) * 5;
    ctx.save();
    ctx.rotate(offset * 0.08);
    ctx.beginPath();
    ctx.moveTo(-14, 2 + offset * 0.5);
    ctx.bezierCurveTo(-28, -2 + offset, -30, 8 + offset, -18, 12 + offset * 0.5);
    ctx.bezierCurveTo(-14, 14 + offset * 0.3, -12, 10, -14, 2 + offset * 0.5);
    ctx.fillStyle = tailColors[i];
    ctx.fill();
    ctx.strokeStyle = "#BF360C";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  const wingFlap = bird.wingAngle;
  ctx.rotate(wingFlap * 0.5);
  const wingGradient = ctx.createLinearGradient(-8, -2, 10, 16);
  wingGradient.addColorStop(0, "#FFF176");
  wingGradient.addColorStop(0.4, "#FFD54F");
  wingGradient.addColorStop(1, "#FF8F00");
  ctx.beginPath();
  ctx.moveTo(-6, 3);
  ctx.bezierCurveTo(-18, -4 + wingFlap * 8, -20, 10 + wingFlap * 8, -8, 16);
  ctx.bezierCurveTo(-2, 18, 4, 14, 6, 8);
  ctx.bezierCurveTo(4, 2, -2, 2, -6, 3);
  ctx.fillStyle = wingGradient;
  ctx.fill();
  ctx.strokeStyle = "#E65100";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = "rgba(230,100,0,0.35)";
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i += 1) {
    const t = (i + 1) / 4;
    ctx.beginPath();
    ctx.moveTo(lerp(-6, 6, t), lerp(3, 8, t));
    ctx.lineTo(lerp(-14, -4, t), lerp(6 + wingFlap * 4, 14 + wingFlap * 4, t));
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(255,200,0,0.5)";
  ctx.shadowBlur = 10;
  const bodyGradient = ctx.createRadialGradient(-6, -8, 2, 0, 0, BIRD_R + 2);
  bodyGradient.addColorStop(0, "#FFF59D");
  bodyGradient.addColorStop(0.35, "#FFCA28");
  bodyGradient.addColorStop(0.7, "#FFA000");
  bodyGradient.addColorStop(1, "#E65100");
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_R + 1, 0, Math.PI * 2);
  ctx.fillStyle = bodyGradient;
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "#BF360C";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_R + 1, 0, Math.PI * 2);
  ctx.stroke();

  const bellyGradient = ctx.createRadialGradient(4, 4, 1, 4, 4, 12);
  bellyGradient.addColorStop(0, "rgba(255,255,240,0.75)");
  bellyGradient.addColorStop(1, "rgba(255,224,100,0)");
  ctx.beginPath();
  ctx.ellipse(4, 5, 12, 10, 0.15, 0, Math.PI * 2);
  ctx.fillStyle = bellyGradient;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(-7, -10, 7, 4, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fill();

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.2)";
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.ellipse(10, -6, 9, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#FAFAFA";
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  const eyeProgress = Math.max(0, Math.min(1, (bird.angle + 25) / 90));
  const irisX = lerp(9, 12, eyeProgress);
  const irisY = lerp(-8, -4, eyeProgress);
  const irisGradient = ctx.createRadialGradient(irisX - 1, irisY - 1, 0, irisX, irisY, 5.5);
  irisGradient.addColorStop(0, "#26C6DA");
  irisGradient.addColorStop(0.5, "#0288D1");
  irisGradient.addColorStop(1, "#01579B");
  ctx.beginPath();
  ctx.arc(irisX, irisY, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = irisGradient;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(irisX + 0.5, irisY + 0.5, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#111";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(irisX + 2, irisY - 2, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(irisX - 1.5, irisY + 2.5, 0.9, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(10, -6, 9.5, Math.PI * 1.2, Math.PI * 1.85);
  ctx.strokeStyle = "#5D4037";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#FF8A80";
  ctx.beginPath();
  ctx.ellipse(8, 3, 6, 3.5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const beakGradient = ctx.createLinearGradient(14, -5, 14, 2);
  beakGradient.addColorStop(0, "#FFAB40");
  beakGradient.addColorStop(1, "#E64A19");
  ctx.beginPath();
  ctx.moveTo(13, -3);
  ctx.bezierCurveTo(17, -5, 26, -3, 26, 1);
  ctx.bezierCurveTo(26, 3, 17, 2, 13, 1);
  ctx.closePath();
  ctx.fillStyle = beakGradient;
  ctx.fill();
  ctx.strokeStyle = "#BF360C";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  const bottomBeakGradient = ctx.createLinearGradient(14, 1, 14, 7);
  bottomBeakGradient.addColorStop(0, "#FF7043");
  bottomBeakGradient.addColorStop(1, "#BF360C");
  ctx.beginPath();
  ctx.moveTo(13, 2);
  ctx.bezierCurveTo(17, 2, 24, 3, 24, 5);
  ctx.bezierCurveTo(24, 7, 17, 7, 13, 5);
  ctx.closePath();
  ctx.fillStyle = bottomBeakGradient;
  ctx.fill();
  ctx.strokeStyle = "#BF360C";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(15, -2.5);
  ctx.bezierCurveTo(18, -4, 24, -2, 24, 0);
  ctx.bezierCurveTo(22, -1, 16, -1.5, 15, -2.5);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fill();

  ctx.restore();
}

function drawPipe(
  ctx: CanvasRenderingContext2D,
  x: number,
  topH: number,
  canvasH: number,
  shake: { x: number; y: number },
) {
  ctx.save();
  ctx.translate(shake.x, shake.y);

  function roundRect(
    rectX: number,
    rectY: number,
    rectW: number,
    rectH: number,
    tl: number,
    tr: number,
    br: number,
    bl: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(rectX + tl, rectY);
    ctx.lineTo(rectX + rectW - tr, rectY);
    ctx.arcTo(rectX + rectW, rectY, rectX + rectW, rectY + tr, tr);
    ctx.lineTo(rectX + rectW, rectY + rectH - br);
    ctx.arcTo(rectX + rectW, rectY + rectH, rectX + rectW - br, rectY + rectH, br);
    ctx.lineTo(rectX + bl, rectY + rectH);
    ctx.arcTo(rectX, rectY + rectH, rectX, rectY + rectH - bl, bl);
    ctx.lineTo(rectX, rectY + tl);
    ctx.arcTo(rectX, rectY, rectX + tl, rectY, tl);
    ctx.closePath();
  }

  function drawOnePipe(pipeX: number, pipeY: number, pipeWidth: number, pipeHeight: number, capTop: boolean) {
    if (pipeHeight <= 0) return;

    const capHeight = 26;
    const capExtrude = 8;

    const bodyGradient = ctx.createLinearGradient(pipeX, 0, pipeX + pipeWidth, 0);
    bodyGradient.addColorStop(0, "#2E7D32");
    bodyGradient.addColorStop(0.3, "#66BB6A");
    bodyGradient.addColorStop(0.6, "#43A047");
    bodyGradient.addColorStop(1, "#1B5E20");
    ctx.fillStyle = bodyGradient;
    if (capTop) {
      roundRect(pipeX, pipeY, pipeWidth, pipeHeight - capHeight, 0, 0, 0, 0);
    } else {
      roundRect(pipeX, pipeY + capHeight, pipeWidth, pipeHeight - capHeight, 0, 0, 8, 8);
    }
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    if (capTop) {
      ctx.fillRect(pipeX + 8, pipeY, 10, pipeHeight - capHeight);
    } else {
      ctx.fillRect(pipeX + 8, pipeY + capHeight, 10, pipeHeight - capHeight);
    }

    const capY = capTop ? pipeY + pipeHeight - capHeight : pipeY;
    const capGradient = ctx.createLinearGradient(
      pipeX - capExtrude,
      0,
      pipeX - capExtrude + pipeWidth + capExtrude * 2,
      0,
    );
    capGradient.addColorStop(0, "#1B5E20");
    capGradient.addColorStop(0.2, "#4CAF50");
    capGradient.addColorStop(0.5, "#81C784");
    capGradient.addColorStop(0.8, "#388E3C");
    capGradient.addColorStop(1, "#1B5E20");
    ctx.fillStyle = capGradient;
    if (capTop) {
      roundRect(pipeX - capExtrude, capY, pipeWidth + capExtrude * 2, capHeight, 0, 0, 8, 8);
    } else {
      roundRect(pipeX - capExtrude, capY, pipeWidth + capExtrude * 2, capHeight, 8, 8, 0, 0);
    }
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(pipeX - capExtrude + 6, capY + 4, 12, capHeight - 8);

    ctx.strokeStyle = "#1B5E20";
    ctx.lineWidth = 1.5;
    if (capTop) {
      roundRect(pipeX, pipeY, pipeWidth, pipeHeight - capHeight, 0, 0, 0, 0);
      ctx.stroke();
      roundRect(pipeX - capExtrude, capY, pipeWidth + capExtrude * 2, capHeight, 0, 0, 8, 8);
      ctx.stroke();
      return;
    }

    roundRect(pipeX, pipeY + capHeight, pipeWidth, pipeHeight - capHeight, 0, 0, 8, 8);
    ctx.stroke();
    roundRect(pipeX - capExtrude, capY, pipeWidth + capExtrude * 2, capHeight, 8, 8, 0, 0);
    ctx.stroke();
  }

  drawOnePipe(x, 0, PIPE_W, topH, true);
  const bottomY = topH + PIPE_GAP;
  drawOnePipe(x, bottomY, PIPE_W, canvasH - bottomY - GROUND_H, false);

  ctx.restore();
}

function drawSky(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#1565C0");
  gradient.addColorStop(0.35, "#42A5F5");
  gradient.addColorStop(0.7, "#80D8FF");
  gradient.addColorStop(1, "#B3E5FC");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.shadowColor = "rgba(255,255,255,0.4)";
  ctx.shadowBlur = 8;

  const gradient = ctx.createRadialGradient(30, -5, 5, 30, 0, 50);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(220,240,255,0.85)");
  ctx.fillStyle = gradient;

  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.arc(28, -10, 18, 0, Math.PI * 2);
  ctx.arc(54, 0, 22, 0, Math.PI * 2);
  ctx.arc(26, 10, 20, 0, Math.PI * 2);
  ctx.arc(15, 5, 16, 0, Math.PI * 2);
  ctx.arc(40, 5, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, offset: number) {
  const sandGradient = ctx.createLinearGradient(0, H - GROUND_H, 0, H);
  sandGradient.addColorStop(0, "#F9A825");
  sandGradient.addColorStop(0.5, "#E65100");
  sandGradient.addColorStop(1, "#BF360C");
  ctx.fillStyle = sandGradient;
  ctx.fillRect(0, H - GROUND_H, W, GROUND_H);

  const grassGradient = ctx.createLinearGradient(0, H - GROUND_H, 0, H - GROUND_H + 18);
  grassGradient.addColorStop(0, "#66BB6A");
  grassGradient.addColorStop(1, "#2E7D32");
  ctx.fillStyle = grassGradient;
  ctx.fillRect(0, H - GROUND_H, W, 18);

  ctx.fillStyle = "#81C784";
  const tuftSpacing = 30;
  const tuftCount = Math.ceil(W / tuftSpacing) + 2;
  const tuftOffset = offset % tuftSpacing;
  for (let i = 0; i < tuftCount; i += 1) {
    const tuftX = i * tuftSpacing - tuftOffset;
    ctx.beginPath();
    ctx.arc(tuftX, H - GROUND_H + 2, 5, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tuftX + 8, H - GROUND_H + 1, 4, Math.PI, 0);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, H - GROUND_H + 20 + i * 9);
    ctx.lineTo(W, H - GROUND_H + 20 + i * 9);
    ctx.stroke();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const particle of particles) {
    const progress = particle.life / particle.maxLife;
    ctx.save();
    ctx.globalAlpha = progress;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.r * progress, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawScoreEffect(ctx: CanvasRenderingContext2D, score: number, popScale: number) {
  ctx.save();
  ctx.translate(W / 2, 58);
  ctx.scale(popScale, popScale);
  ctx.font = "bold 44px 'Arial Black', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillText(String(score), 3, 3);

  const gradient = ctx.createLinearGradient(0, -22, 0, 22);
  gradient.addColorStop(0, "#FFD700");
  gradient.addColorStop(0.5, "#FFF9C4");
  gradient.addColorStop(1, "#FF8F00");
  ctx.fillStyle = gradient;
  ctx.fillText(String(score), 0, 0);

  ctx.strokeStyle = "rgba(180,80,0,0.6)";
  ctx.lineWidth = 2;
  ctx.strokeText(String(score), 0, 0);
  ctx.restore();
}

export function FlappyGameView({ store }: { store: GameStore }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>("idle");
  const birdRef = useRef<Bird>({
    y: H * 0.22,
    vy: 0,
    angle: 0,
    wingAngle: 0,
    wingDir: 1,
  });
  const pipesRef = useRef<Pipe[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const cloudsRef = useRef<Cloud[]>([
    { x: 60, y: 70, scale: 0.9, speed: 0.3 },
    { x: 230, y: 120, scale: 0.65, speed: 0.2 },
    { x: 350, y: 55, scale: 1.1, speed: 0.25 },
    { x: 160, y: 160, scale: 0.55, speed: 0.15 },
  ]);
  const scoreRef = useRef(0);
  const bestRef = useRef(0);
  const lastPipeRef = useRef(0);
  const groundOffsetRef = useRef(0);
  const shakeRef = useRef({ x: 0, y: 0, frames: 0, intensity: 0 });
  const scorePopRef = useRef(1);
  const animationRef = useRef(0);
  const reviveUsedRef = useRef(false);
  const invincibleFramesRef = useRef(0);
  const scoreSubmittedRef = useRef(false);
  const noticeTimeoutRef = useRef<number | null>(null);

  const [uiState, setUiState] = useState<GameState>("idle");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [flashDead, setFlashDead] = useState(false);
  const [canRevive, setCanRevive] = useState(true);
  const [isReviving, setIsReviving] = useState(false);
  const [bestRewardSummary, setBestRewardSummary] = useState<{ gold: number; diamonds: number } | null>(null);
  const [gameNotice, setGameNotice] = useState<GameNotice | null>(null);

  const clearGameNotice = useCallback(() => {
    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
      noticeTimeoutRef.current = null;
    }
    setGameNotice(null);
  }, []);

  const showGameNotice = useCallback(
    (
      notice: Omit<GameNotice, "id">,
      duration = notice.tone === "record" ? 3600 : 2800,
    ) => {
      if (noticeTimeoutRef.current) {
        window.clearTimeout(noticeTimeoutRef.current);
      }

      const noticeId = Date.now();
      setGameNotice({ ...notice, id: noticeId });
      noticeTimeoutRef.current = window.setTimeout(() => {
        setGameNotice((current) => (current?.id === noticeId ? null : current));
        noticeTimeoutRef.current = null;
      }, duration);
    },
    [],
  );

  useEffect(
    () => () => {
      if (noticeTimeoutRef.current) {
        window.clearTimeout(noticeTimeoutRef.current);
      }
    },
    [],
  );

  const spawnScoreParticles = (x: number, y: number) => {
    for (let i = 0; i < 16; i += 1) {
      const angle = (Math.PI * 2 * i) / 16;
      const speed = 2 + Math.random() * 3;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 1,
        maxLife: 1,
        r: 5 + Math.random() * 4,
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
      });
    }
  };

  const spawnDeathParticles = (x: number, y: number) => {
    for (let i = 0; i < 24; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1,
        maxLife: 1,
        r: 4 + Math.random() * 6,
        color: i % 2 === 0 ? "#FF5722" : "#FFEB3B",
      });
    }
  };

  const resetGame = useCallback(() => {
    birdRef.current = { y: H * 0.4, vy: 0, angle: 0, wingAngle: 0, wingDir: 1 };
    pipesRef.current = [];
    particlesRef.current = [];
    scoreRef.current = 0;
    lastPipeRef.current = 0;
    scorePopRef.current = 1;
    shakeRef.current = { x: 0, y: 0, frames: 0, intensity: 0 };
    groundOffsetRef.current = 0;
    reviveUsedRef.current = false;
    invincibleFramesRef.current = 0;
    scoreSubmittedRef.current = false;
    setScore(0);
    setCanRevive(true);
    setIsReviving(false);
    setBestRewardSummary(null);
    clearGameNotice();
  }, [clearGameNotice]);

  const submitScoreIfNeeded = useCallback(async () => {
    if (scoreSubmittedRef.current) return;

    const finalScore = scoreRef.current;
    scoreSubmittedRef.current = true;

    if (finalScore <= 0) return;

    const result = await store.submitFlappyScore(finalScore);
    if (!result.success) {
      scoreSubmittedRef.current = false;
      showGameNotice({
        tone: "error",
        title: "Khong luu duoc diem",
        description: result.error || "Khong the luu diem Flappy luc nay.",
      });
      return;
    }

    const resolvedBest = Math.max(bestRef.current, result.bestScore || finalScore);
    bestRef.current = resolvedBest;
    setBest(resolvedBest);

    if (result.isNewBest) {
      const rewardGold = result.rewardGold || 0;
      const rewardDiamonds = result.rewardDiamonds || 0;
      const hasReward = rewardGold > 0 || rewardDiamonds > 0;
      setBestRewardSummary(hasReward ? { gold: rewardGold, diamonds: rewardDiamonds } : null);
      showGameNotice({
        tone: "record",
        title: "Pha ky luc moi!",
        description: hasReward ? "Thuong ky luc da duoc cong vao tai khoan." : "Best cua ban vua duoc cap nhat.",
        gold: hasReward ? rewardGold : 0,
        diamonds: hasReward ? rewardDiamonds : 0,
      });
    }
  }, [showGameNotice, store.submitFlappyScore]);

  const startRound = useCallback(() => {
    resetGame();
    stateRef.current = "playing";
    setUiState("playing");
    birdRef.current.vy = JUMP;
    birdRef.current.wingAngle = -0.6;
  }, [resetGame]);

  const jump = useCallback(() => {
    const currentState = stateRef.current;

    if (currentState === "idle") {
      stateRef.current = "playing";
      setUiState("playing");
      birdRef.current.vy = JUMP;
      birdRef.current.wingAngle = -0.6;
      return;
    }

    if (currentState === "playing") {
      birdRef.current.vy = JUMP;
      birdRef.current.wingAngle = -0.6;
      return;
    }

    return;
  }, []);

  useEffect(() => {
    const storedBest = window.localStorage.getItem(BEST_SCORE_KEY);
    const parsedBest = Number(storedBest);
    if (Number.isFinite(parsedBest) && parsedBest > 0) {
      bestRef.current = parsedBest;
      setBest(parsedBest);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(BEST_SCORE_KEY, String(best));
  }, [best]);

  useEffect(() => {
    if (store.flappyConfig.bestScore > bestRef.current) {
      bestRef.current = store.flappyConfig.bestScore;
      setBest(store.flappyConfig.bestScore);
    }
  }, [store.flappyConfig.bestScore]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "ArrowUp") {
        event.preventDefault();
        jump();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jump]);

  const handleReplay = useCallback(async () => {
    if (uiState === "dead") {
      await submitScoreIfNeeded();
    }

    startRound();
  }, [startRound, submitScoreIfNeeded, uiState]);

  const handleBackHome = useCallback(async () => {
    if (uiState === "dead") {
      await submitScoreIfNeeded();
    }

    store.setCurrentPage("home");
  }, [store.setCurrentPage, submitScoreIfNeeded, uiState]);

  const handleRevive = useCallback(async () => {
    if (uiState !== "dead" || !canRevive || isReviving) return;

    setIsReviving(true);
    const rewarded = await showReviveRewardedAd();
    if (!rewarded) {
      showGameNotice({
        tone: "error",
        title: "Chua mo duoc quang cao",
        description: "Khong mo duoc quang cao hoi sinh. Thu lai nhe.",
      });
      setIsReviving(false);
      return;
    }

    const upcomingPipes = pipesRef.current.filter((pipe) => pipe.x + PIPE_W > BIRD_X + 16);
    const nextPipe = upcomingPipes[0];
    const reviveY = nextPipe
      ? Math.min(Math.max(nextPipe.topH + PIPE_GAP / 2 - BIRD_R, 36), H - GROUND_H - BIRD_R * 2 - 12)
      : H * 0.38;

    pipesRef.current = pipesRef.current
      .filter((pipe) => pipe.x + PIPE_W > BIRD_X + 8)
      .map((pipe, index) => (index === 0 ? { ...pipe, x: Math.max(pipe.x, BIRD_X + 120) } : pipe));

    birdRef.current = {
      ...birdRef.current,
      y: reviveY,
      vy: JUMP * 0.55,
      angle: -10,
      wingAngle: -0.6,
      wingDir: 1,
    };
    shakeRef.current = { x: 0, y: 0, frames: 0, intensity: 0 };
    invincibleFramesRef.current = REVIVE_INVINCIBLE_FRAMES;
    reviveUsedRef.current = true;
    setCanRevive(false);
    setFlashDead(false);
    setUiState("playing");
    stateRef.current = "playing";
    setIsReviving(false);
    showGameNotice({
      tone: "success",
      title: "Hoi sinh thanh cong",
      description: "Bay tiep nao! Ban dang an toan trong vai giay dau.",
    });
  }, [canRevive, isReviving, showGameNotice, uiState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let lastTime = 0;
    let flashTimeout = 0;

    function collides(bird: Bird, pipes: Pipe[]) {
      const birdX = BIRD_X + 8;
      const birdY = bird.y + 8;
      const birdSize = BIRD_R * 2 - 16;

      if (birdY + birdSize >= H - GROUND_H || birdY <= 0) {
        return true;
      }

      for (const pipe of pipes) {
        if (birdX + birdSize > pipe.x + 4 && birdX < pipe.x + PIPE_W - 4) {
          if (birdY < pipe.topH || birdY + birdSize > pipe.topH + PIPE_GAP) {
            return true;
          }
        }
      }

      return false;
    }

    const frame = (now: number) => {
      lastTime = lastTime || now;
      lastTime = now;

      const currentState = stateRef.current;
      const bird = birdRef.current;
      const shake = shakeRef.current;

      if (invincibleFramesRef.current > 0) {
        invincibleFramesRef.current -= 1;
      }

      if (shake.frames > 0) {
        shake.x = (Math.random() - 0.5) * shake.intensity;
        shake.y = (Math.random() - 0.5) * shake.intensity;
        shake.frames -= 1;
        shake.intensity *= 0.88;
      } else {
        shake.x = 0;
        shake.y = 0;
      }

      scorePopRef.current = lerp(scorePopRef.current, 1, 0.15);

      for (const particle of particlesRef.current) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.15;
        particle.life -= 0.025;
      }
      particlesRef.current = particlesRef.current.filter((particle) => particle.life > 0);

      for (const cloud of cloudsRef.current) {
        cloud.x -= cloud.speed;
        if (cloud.x < -120) {
          cloud.x = W + 60;
        }
      }

      if (currentState === "playing") {
        groundOffsetRef.current += PIPE_SPEED;

        bird.vy += GRAVITY;
        bird.y += bird.vy;
        bird.angle = Math.min(85, Math.max(-25, bird.vy * 4.5));

        bird.wingAngle += bird.wingDir * 0.15;
        if (bird.wingAngle > 0.5) bird.wingDir = -1;
        if (bird.wingAngle < -0.5) bird.wingDir = 1;

        if (now - lastPipeRef.current > PIPE_INTERVAL) {
          const minTop = 95;
          const maxTop = H - PIPE_GAP - GROUND_H - 95;
          pipesRef.current.push({
            x: W + 20,
            topH: Math.floor(Math.random() * (maxTop - minTop) + minTop),
            passed: false,
          });
          lastPipeRef.current = now;
        }

        for (const pipe of pipesRef.current) {
          pipe.x -= PIPE_SPEED;
          if (!pipe.passed && pipe.x + PIPE_W < BIRD_X) {
            pipe.passed = true;
            scoreRef.current += 1;
            scorePopRef.current = 1.35;
            setScore(scoreRef.current);

            if (scoreRef.current > bestRef.current) {
              bestRef.current = scoreRef.current;
              setBest(bestRef.current);
            }

            spawnScoreParticles(W / 2, 60);
          }
        }
        pipesRef.current = pipesRef.current.filter((pipe) => pipe.x + PIPE_W > -30);

        if (invincibleFramesRef.current <= 0 && collides(bird, pipesRef.current)) {
          spawnDeathParticles(BIRD_X + BIRD_R, bird.y + BIRD_R);
          shake.frames = 18;
          shake.intensity = 10;
          stateRef.current = "dead";
          setUiState("dead");
          const allowRevive = !reviveUsedRef.current;
          setCanRevive(allowRevive);
          if (!allowRevive) {
            void submitScoreIfNeeded();
          }
          setFlashDead(true);
          flashTimeout = window.setTimeout(() => setFlashDead(false), 120);
        }
      } else if (currentState === "idle") {
        bird.y = H * 0.22 + Math.sin(now / 420) * 10;
        bird.angle = Math.sin(now / 420) * 8;
        bird.wingAngle += bird.wingDir * 0.12;
        if (bird.wingAngle > 0.5) bird.wingDir = -1;
        if (bird.wingAngle < -0.5) bird.wingDir = 1;
      }

      drawSky(ctx);

      ctx.save();
      const sunGradient = ctx.createRadialGradient(330, 70, 5, 330, 70, 70);
      sunGradient.addColorStop(0, "rgba(255,255,200,0.9)");
      sunGradient.addColorStop(0.4, "rgba(255,220,100,0.5)");
      sunGradient.addColorStop(1, "rgba(255,200,50,0)");
      ctx.fillStyle = sunGradient;
      ctx.beginPath();
      ctx.arc(330, 70, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      for (const cloud of cloudsRef.current) {
        drawCloud(ctx, cloud.x, cloud.y, cloud.scale);
      }

      for (const pipe of pipesRef.current) {
        drawPipe(ctx, pipe.x, pipe.topH, H, shake);
      }

      drawGround(ctx, groundOffsetRef.current);
      drawParticles(ctx, particlesRef.current);
      drawBird(ctx, bird, shake);

      if (currentState === "playing" || currentState === "dead") {
        drawScoreEffect(ctx, scoreRef.current, scorePopRef.current);
      }

      animationRef.current = window.requestAnimationFrame(frame);
    };

    animationRef.current = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(animationRef.current);
      window.clearTimeout(flashTimeout);
    };
  }, [jump, submitScoreIfNeeded]);

  return (
    <div
      className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-3 py-4"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #0d1b4b 0%, #020510 100%)" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.12),transparent_36%)]" />

      <div className="relative z-10 mb-4 flex w-full max-w-[400px] items-center justify-between gap-3">
        <button
          onClick={() => void handleBackHome()}
          className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-bold text-white/90 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md transition-colors hover:bg-white/12"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lai
        </button>

        <div className="inline-flex items-center gap-2 rounded-full border border-yellow-300/20 bg-black/20 px-4 py-2 text-sm font-bold text-yellow-100 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md">
          <Trophy className="h-4 w-4 text-yellow-300" />
          Best {best}
        </div>
      </div>

      <div className="relative z-10 w-full max-w-[400px]" style={{ userSelect: "none" }}>
        {gameNotice && (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex justify-center">
            <div
              aria-live="polite"
              style={{
                width: "min(100%, 330px)",
                borderRadius: 20,
                border: GAME_NOTICE_STYLES[gameNotice.tone].panelBorder,
                background: GAME_NOTICE_STYLES[gameNotice.tone].panelBackground,
                boxShadow: GAME_NOTICE_STYLES[gameNotice.tone].panelShadow,
                backdropFilter: "blur(16px)",
                padding: "12px 14px",
                animation: "noticeIn 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    background: GAME_NOTICE_STYLES[gameNotice.tone].iconBackground,
                    color: GAME_NOTICE_STYLES[gameNotice.tone].iconColor,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
                  }}
                >
                  {gameNotice.tone === "record" ? (
                    <Trophy size={18} />
                  ) : gameNotice.tone === "error" ? (
                    <CircleAlert size={18} />
                  ) : (
                    <Sparkles size={18} />
                  )}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      margin: 0,
                      color: GAME_NOTICE_STYLES[gameNotice.tone].titleColor,
                      fontSize: 14,
                      fontWeight: 900,
                      letterSpacing: 0.2,
                    }}
                  >
                    {gameNotice.title}
                  </p>

                  {gameNotice.description && (
                    <p
                      style={{
                        margin: "4px 0 0",
                        color: GAME_NOTICE_STYLES[gameNotice.tone].descriptionColor,
                        fontSize: 12,
                        lineHeight: 1.45,
                        fontWeight: 600,
                      }}
                    >
                      {gameNotice.description}
                    </p>
                  )}

                  {(gameNotice.gold || gameNotice.diamonds) && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {Boolean(gameNotice.gold) && (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            borderRadius: 999,
                            padding: "6px 10px",
                            background: "rgba(255,215,0,0.14)",
                            border: "1px solid rgba(255,215,0,0.16)",
                            color: "#FFE082",
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          <Coins size={12} />
                          +{formatNumber(gameNotice.gold || 0)}
                        </div>
                      )}

                      {Boolean(gameNotice.diamonds) && (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            borderRadius: 999,
                            padding: "6px 10px",
                            background: "rgba(34,211,238,0.14)",
                            border: "1px solid rgba(34,211,238,0.16)",
                            color: "#A5F3FC",
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          <Gem size={12} />
                          +{formatNumber(gameNotice.diamonds || 0)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            position: "absolute",
            inset: -24,
            borderRadius: 32,
            background: "radial-gradient(ellipse, rgba(66,165,245,0.18) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={(event) => {
            event.preventDefault();
            jump();
          }}
          className="block w-full rounded-[24px]"
          style={{
            boxShadow: "0 0 60px rgba(66,165,245,0.25), 0 20px 60px rgba(0,0,0,0.7)",
            cursor: "pointer",
            touchAction: "none",
            outline: flashDead ? "4px solid rgba(255,80,80,0.8)" : "none",
            transition: "outline 0.05s",
          }}
        />

        {uiState === "idle" && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end px-5 pb-18">
            <div
              style={{
                background: "linear-gradient(135deg, rgba(10,20,60,0.84), rgba(5,10,40,0.90))",
                backdropFilter: "blur(14px)",
                border: "1.5px solid rgba(100,180,255,0.18)",
                borderRadius: 20,
                padding: "28px 24px",
                textAlign: "center",
                boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
                width: "100%",
              }}
            >
              <div style={{ animation: "titleBob 2s ease-in-out infinite" }}>
                <h1
                  style={{
                    fontFamily: "'Arial Black', Arial, sans-serif",
                    fontSize: 40,
                    fontWeight: 900,
                    background: "linear-gradient(180deg, #FFD700 0%, #FF8F00 60%, #FF5722 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    letterSpacing: 1,
                    margin: 0,
                    lineHeight: 1.1,
                  }}
                >
                  Flappy Bird
                </h1>
              </div>

              <p style={{ color: "rgba(200,230,255,0.8)", fontSize: 15, margin: "12px 0 20px" }}>
                Tap, click hoac nhan Space de bat dau
              </p>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 12,
                  marginBottom: 20,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(255,215,0,0.14)",
                    border: "1px solid rgba(255,215,0,0.18)",
                    borderRadius: 999,
                    padding: "8px 14px",
                    color: "#FFE082",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <Coins size={14} />
                  +{formatNumber(store.flappyConfig.rewardGold)}
                </div>

                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(34,211,238,0.12)",
                    border: "1px solid rgba(34,211,238,0.18)",
                    borderRadius: 999,
                    padding: "8px 14px",
                    color: "#A5F3FC",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <Gem size={14} />
                  +{formatNumber(store.flappyConfig.rewardDiamonds)}
                </div>
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "linear-gradient(135deg, #FFD600, #FF8F00)",
                  color: "#1a1200",
                  fontWeight: 800,
                  fontSize: 15,
                  padding: "10px 26px",
                  borderRadius: 99,
                  boxShadow: "0 4px 20px rgba(255,180,0,0.45)",
                  animation: "pulse 1.4s ease-in-out infinite",
                }}
              >
                Tap de choi
              </div>
            </div>
          </div>
        )}

        {uiState === "dead" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-5">
            <div
              style={{
                background: "linear-gradient(135deg, rgba(60,5,5,0.88), rgba(10,5,30,0.92))",
                backdropFilter: "blur(14px)",
                border: "1.5px solid rgba(255,100,100,0.2)",
                borderRadius: 20,
                padding: "28px 24px",
                textAlign: "center",
                boxShadow: "0 8px 50px rgba(0,0,0,0.6), 0 0 40px rgba(200,50,50,0.15)",
                animation: "popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                width: "100%",
              }}
            >
              <h2
                style={{
                  fontFamily: "'Arial Black', Arial, sans-serif",
                  fontSize: 34,
                  fontWeight: 900,
                  color: "#FF5252",
                  textShadow: "0 0 20px rgba(255,80,80,0.5)",
                  margin: "0 0 16px",
                }}
              >
                Game Over
              </h2>

              <div style={{ display: "flex", justifyContent: "center", gap: 36, marginBottom: 20 }}>
                <div>
                  <p
                    style={{
                      color: "rgba(200,220,255,0.6)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: 2,
                      margin: "0 0 4px",
                    }}
                  >
                    Score
                  </p>
                  <p
                    style={{
                      color: "#fff",
                      fontSize: 38,
                      fontWeight: 900,
                      margin: 0,
                      fontFamily: "'Arial Black', Arial",
                    }}
                  >
                    {score}
                  </p>
                </div>

                <div style={{ width: 1, background: "rgba(255,255,255,0.12)" }} />

                <div>
                  <p
                    style={{
                      color: "rgba(200,220,255,0.6)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: 2,
                      margin: "0 0 4px",
                    }}
                  >
                    Best
                  </p>
                  <p
                    style={{
                      color: "#FFD700",
                      fontSize: 38,
                      fontWeight: 900,
                      margin: 0,
                      fontFamily: "'Arial Black', Arial",
                    }}
                  >
                    {best}
                  </p>
                </div>
              </div>

              {bestRewardSummary && (
                <div
                  style={{
                    marginBottom: 16,
                    borderRadius: 18,
                    border: "1px solid rgba(255,215,0,0.18)",
                    background: "rgba(255,215,0,0.08)",
                    padding: "12px 16px",
                    color: "#FFF8E1",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Thuong ky luc moi: +{formatNumber(bestRewardSummary.gold)} vang, +{formatNumber(bestRewardSummary.diamonds)} KC
                </div>
              )}

              {canRevive && (
                <button
                  onClick={() => void handleRevive()}
                  disabled={isReviving}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    width: "100%",
                    background: "linear-gradient(135deg, #67E8F9, #2563EB)",
                    color: "#ECFEFF",
                    fontWeight: 900,
                    fontSize: 15,
                    padding: "12px 18px",
                    borderRadius: 99,
                    boxShadow: "0 8px 24px rgba(37,99,235,0.35)",
                    marginBottom: 12,
                    border: "none",
                    cursor: "pointer",
                    opacity: isReviving ? 0.7 : 1,
                  }}
                >
                  {isReviving ? "Dang mo quang cao..." : "Xem quang cao de hoi sinh"}
                </button>
              )}

              <button
                onClick={() => void handleReplay()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "100%",
                  background: "linear-gradient(135deg, #FFD600, #FF8F00)",
                  color: "#1a1200",
                  fontWeight: 800,
                  fontSize: 15,
                  padding: "10px 26px",
                  borderRadius: 99,
                  boxShadow: "0 4px 20px rgba(255,180,0,0.4)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Choi lai
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="relative z-10 mt-4 text-center text-xs text-blue-100/60">
        Tap, click, Space hoac mui ten len de flap
      </p>

      <style>{`
        @keyframes titleBob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 20px rgba(255,180,0,0.4); }
          50% { transform: scale(1.04); box-shadow: 0 4px 28px rgba(255,180,0,0.65); }
        }

        @keyframes popIn {
          from { transform: scale(0.7); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        @keyframes noticeIn {
          from { transform: translateY(-10px) scale(0.96); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

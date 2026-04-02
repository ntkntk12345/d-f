import { useMemo, useState } from "react";
import type { GameStore, Task } from "@/hooks/use-game-store";
import { cn, formatNumber } from "@/lib/utils";
import { showTaskRewardedSequence } from "@/lib/ad-service";
import { toast } from "@/hooks/use-toast";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Coins,
  Heart,
  MousePointerClick,
  PlayCircle,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

type TaskVisual = {
  icon: LucideIcon;
  iconWrapperClassName: string;
  iconClassName: string;
};

const VISUALS: Record<string, TaskVisual> = {
  daily: {
    icon: CalendarDays,
    iconWrapperClassName:
      "border-violet-300/25 bg-[linear-gradient(180deg,rgba(99,61,180,0.72)_0%,rgba(42,26,84,0.95)_100%)] shadow-[inset_0_1px_0_rgba(225,214,255,0.18),0_10px_24px_rgba(24,9,52,0.32)]",
    iconClassName: "text-violet-100 drop-shadow-[0_0_10px_rgba(196,181,253,0.45)]",
  },
  community: {
    icon: Users,
    iconWrapperClassName:
      "border-fuchsia-300/20 bg-[linear-gradient(180deg,rgba(112,49,124,0.72)_0%,rgba(52,19,60,0.95)_100%)] shadow-[inset_0_1px_0_rgba(255,214,255,0.14),0_10px_24px_rgba(42,10,46,0.3)]",
    iconClassName: "text-fuchsia-100 drop-shadow-[0_0_10px_rgba(232,121,249,0.4)]",
  },
  newbie: {
    icon: Sparkles,
    iconWrapperClassName:
      "border-cyan-200/25 bg-[linear-gradient(180deg,rgba(35,103,117,0.78)_0%,rgba(9,47,58,0.95)_100%)] shadow-[inset_0_1px_0_rgba(204,251,255,0.16),0_10px_24px_rgba(6,38,45,0.32)]",
    iconClassName: "text-cyan-100 drop-shadow-[0_0_10px_rgba(103,232,249,0.4)]",
  },
  join: {
    icon: Send,
    iconWrapperClassName:
      "border-amber-200/25 bg-[linear-gradient(180deg,rgba(120,81,22,0.76)_0%,rgba(59,34,5,0.95)_100%)] shadow-[inset_0_1px_0_rgba(255,236,179,0.14),0_10px_24px_rgba(57,31,2,0.32)]",
    iconClassName: "text-amber-100 drop-shadow-[0_0_10px_rgba(251,191,36,0.4)]",
  },
  react_heart: {
    icon: Heart,
    iconWrapperClassName:
      "border-rose-200/25 bg-[linear-gradient(180deg,rgba(153,53,77,0.8)_0%,rgba(82,18,36,0.95)_100%)] shadow-[inset_0_1px_0_rgba(255,222,226,0.14),0_10px_24px_rgba(65,12,27,0.3)]",
    iconClassName: "text-rose-100 drop-shadow-[0_0_10px_rgba(251,113,133,0.42)]",
  },
  ad: {
    icon: PlayCircle,
    iconWrapperClassName:
      "border-pink-200/25 bg-[linear-gradient(180deg,rgba(145,55,93,0.78)_0%,rgba(67,17,41,0.95)_100%)] shadow-[inset_0_1px_0_rgba(255,212,226,0.14),0_10px_24px_rgba(56,8,27,0.3)]",
    iconClassName: "text-pink-100 drop-shadow-[0_0_10px_rgba(244,114,182,0.4)]",
  },
  click: {
    icon: MousePointerClick,
    iconWrapperClassName:
      "border-cyan-200/25 bg-[linear-gradient(180deg,rgba(23,93,102,0.76)_0%,rgba(4,42,48,0.95)_100%)] shadow-[inset_0_1px_0_rgba(196,250,255,0.16),0_10px_24px_rgba(2,32,36,0.32)]",
    iconClassName: "text-cyan-100 drop-shadow-[0_0_10px_rgba(103,232,249,0.4)]",
  },
};

const ADSGRAM_BLOCK_IDS = ["int-23213", "int-23325", "int-23213"] as const;

function getTaskVisual(task: Task) {
  if (task.type === "ad") return VISUALS.ad;
  if (task.actionType === "react_heart") return VISUALS.react_heart;
  if (task.actionType === "join") return VISUALS.join;
  if (task.type === "newbie") return VISUALS.newbie;
  if (task.actionType === "click") return VISUALS.click;
  if (task.type === "community") return VISUALS.community;
  return VISUALS.daily;
}

function getTaskHint(task: Task) {
  if (task.actionType === "react_heart") return "Mo tin nhan trong group, tha tym roi quay lai xac minh.";
  if (task.actionType === "join") return "Má»Ÿ nhÃ³m hoáº·c kÃªnh rá»“i quay láº¡i xÃ¡c minh.";
  if (task.type === "ad") return "Xem Ä‘á»§ chuá»—i quáº£ng cÃ¡o Ä‘á»ƒ backend má»Ÿ thÆ°á»Ÿng.";
  if (task.type === "daily") return "LÃ m má»›i má»—i ngÃ y theo thá»i gian mÃ¡y chá»§.";
  if (task.type === "newbie") return "HoÃ n táº¥t chuá»—i tÃ¢n thá»§ Ä‘á»ƒ má»Ÿ thÆ°á»Ÿng má»i báº¡n vÃ  cÃ¡c quyá»n lá»£i Ä‘áº§u game.";
  if (task.type === "community") return "HoÃ n thÃ nh tÆ°Æ¡ng tÃ¡c cá»™ng Ä‘á»“ng Ä‘á»ƒ nháº­n thÆ°á»Ÿng.";
  return "Nhiá»‡m vá»¥ má»™t láº§n, nháº­n thÆ°á»Ÿng trá»±c tiáº¿p tá»« backend.";
}

function renderReward(task: Task) {
  const isGold = task.rewardType === "gold";

  return (
    <div
      className={cn(
        "mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-black tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        isGold
          ? "border-yellow-300/20 bg-[linear-gradient(180deg,rgba(104,58,5,0.78)_0%,rgba(71,41,4,0.9)_100%)] text-yellow-200"
          : "border-cyan-200/20 bg-[linear-gradient(180deg,rgba(9,80,95,0.78)_0%,rgba(3,49,59,0.9)_100%)] text-cyan-100",
      )}
    >
      {isGold ? <Coins className="h-3.5 w-3.5" /> : <Wallet className="h-3.5 w-3.5" />}
      <span>{isGold ? `+${formatNumber(task.reward)}` : `+$${task.reward.toFixed(6)}`}</span>
    </div>
  );
}

export function TasksView({ store }: { store: GameStore }) {
  const [preparedTasks, setPreparedTasks] = useState<Set<string>>(new Set());
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const taskMilestoneCount = Math.max(0, store.economyConfig.taskMilestoneCount || 0);
  const taskMilestoneRewardGold = Math.max(0, store.economyConfig.taskMilestoneRewardGold || 0);
  const newbieLockRequired = store.newbieLock.required;
  const newbieTotalTasks = Math.max(0, store.newbieLock.totalNewbieTasks || 0);
  const newbieCompletedTasks = Math.max(0, store.newbieLock.completedNewbieTasks || 0);
  const newbieRemainingTasks = Math.max(0, store.newbieLock.remainingNewbieTasks || 0);
  const hasTaskMilestone = taskMilestoneCount > 0 && taskMilestoneRewardGold > 0;

  const sections = useMemo(
    () =>
      [
        {
          key: "newbie",
          title: "Nhiá»‡m vá»¥ tÃ¢n thá»§",
          tasks: store.tasks.filter((task) => task.type === "newbie" && !task.done),
        },
        {
          key: "ad",
          title: "Nhiá»‡m vá»¥ quáº£ng cÃ¡o",
          tasks: store.tasks.filter((task) => task.type === "ad"),
        },
        {
          key: "daily",
          title: "Nhiá»‡m vá»¥ háº±ng ngÃ y",
          tasks: store.tasks.filter((task) => task.type === "daily"),
        },
        {
          key: "community",
          title: "Nhiá»‡m vá»¥ cá»™ng Ä‘á»“ng",
          tasks: store.tasks.filter((task) => task.type === "community"),
        },
        {
          key: "once",
          title: "Nhiá»‡m vá»¥ má»™t láº§n",
          tasks: store.tasks.filter((task) => task.type === "one_time"),
        },
      ].filter((section) => section.tasks.length > 0),
    [store.tasks],
  );

  const claimAndNotify = async (task: Task) => {
    const result = await store.claimTask(task.id);

    if (!result.success) {
      alert(result.error || "KhÃ´ng thá»ƒ nháº­n thÆ°á»Ÿng nhiá»‡m vá»¥.");
      return false;
    }

    const amount = result.reward?.amount ?? task.reward;
    const rewardType = result.reward?.type ?? task.rewardType;
    const alertLines = [
      rewardType === "gold"
        ? `Nhan thuong thanh cong: +${formatNumber(amount)} vang`
        : `Nhan thuong thanh cong: +$${Number(amount).toFixed(6)}`,
    ];
    const milestoneGold = Math.max(0, result.milestoneReward?.gold ?? 0);

    if (milestoneGold > 0) {
      const rewardParts: string[] = [];
      const completedCount = Math.max(0, result.milestoneReward?.completedCount ?? 0);
      const milestoneCount = Math.max(taskMilestoneCount, result.milestoneReward?.count ?? 0);

      if (milestoneGold > 0) {
        rewardParts.push(`+${formatNumber(milestoneGold)} vang`);
      }

      alertLines.push(`Thuong moc task: ${rewardParts.join(" + ")}`);

      if (milestoneCount > 0) {
        alertLines.push(`Hom nay da dat ${formatNumber(completedCount || milestoneCount)}/${formatNumber(milestoneCount)} task.`);
      }
    }

    alert(alertLines.join("\n"));
    return true;
  };

  const showAdsSequence = async (count: number, onComplete: () => Promise<void>) => {
    if (!window.Adsgram) {
      toast({ description: "Äang táº£i há»‡ thá»‘ng quáº£ng cÃ¡o Adsgram..." });
      return false;
    }

    for (let i = 0; i < count; i += 1) {
      const blockId = ADSGRAM_BLOCK_IDS[i] ?? ADSGRAM_BLOCK_IDS[0];
      toast({ description: `Quáº£ng cÃ¡o ${i + 1}/${count} Ä‘ang táº£i...` });

      try {
        const adController = window.Adsgram.init({ blockId });
        const result = await adController.show();

        if (!result.done) {
          toast({ description: "Báº¡n cáº§n xem háº¿t chuá»—i quáº£ng cÃ¡o Ä‘á»ƒ nháº­n thÆ°á»Ÿng!" });
          return false;
        }

        if (i < count - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Adsgram error (block: ${blockId})`, error);
        toast({ description: "Há»‡ thá»‘ng quáº£ng cÃ¡o Ä‘ang báº­n, vui lÃ²ng thá»­ láº¡i sau!" });
        return false;
      }
    }

    await onComplete();
    return true;
  };

  const handleTaskClaim = async (task: Task) => {
    if (task.done || pendingTaskId === task.id) return;

    const requiresPreOpen = task.actionType === "join" || task.actionType === "react_heart";

    if (requiresPreOpen && !preparedTasks.has(task.id)) {
      if (task.url) store.openTaskLink(task.url);
      setPreparedTasks((prev) => new Set(prev).add(task.id));
      if (task.actionType === "react_heart") {
        alert("Mo tin nhan, tha tym roi quay lai bam lan nua de xac minh.");
        return;
      }
      alert("HÃ£y tham gia nhÃ³m hoáº·c kÃªnh rá»“i quay láº¡i báº¥m nháº­n láº§n ná»¯a Ä‘á»ƒ xÃ¡c minh.");
      return;
    }

    if (task.type === "ad" && task.url) {
      store.openTaskLink(task.url);
      setPendingTaskId(task.id);

      try {
        await claimAndNotify(task);
      } finally {
        setPendingTaskId(null);
      }

      return;
    }

    if (task.actionType === "click" && task.url) {
      store.openTaskLink(task.url);
    }

    if (task.type === "ad") {
      setPendingTaskId(task.id);

      try {
        const watched = await showTaskRewardedSequence();
        if (!watched) {
          alert("Ban can xem het quang cao de nhan thuong.");
          return;
        }

        await claimAndNotify(task);
      } finally {
        setPendingTaskId(null);
      }

      return;
    }

    setPendingTaskId(task.id);

    try {
      const claimed = await claimAndNotify(task);
      if (claimed || requiresPreOpen) {
        setPreparedTasks((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }
    } finally {
      setPendingTaskId(null);
    }
  };

  const renderTaskGroup = (title: string, tasks: Task[]) => (
    <section className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="h-4 w-4 text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.45)]" />
        <h2 className="bg-[linear-gradient(180deg,#fff4c7_0%,#f7c23e_46%,#a25908_100%)] bg-clip-text text-[1.15rem] font-black uppercase tracking-[0.16em] text-transparent">
          {title}
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-yellow-400/45 via-yellow-500/15 to-transparent" />
      </div>

      <div className="space-y-4">
        {tasks.map((task) => {
          const taskVisual = getTaskVisual(task);
          const Icon = taskVisual.icon;
          const isBusy = pendingTaskId === task.id;
          const isPrepared = preparedTasks.has(task.id);

          return (
            <div
              key={task.id}
              className={cn(
                "relative overflow-hidden rounded-[30px] border border-yellow-500/35 bg-[linear-gradient(180deg,rgba(255,223,136,0.16)_0%,rgba(98,58,8,0.24)_100%)] p-[1px] shadow-[0_18px_34px_rgba(0,0,0,0.34)]",
                !task.done && "transition-transform duration-300 hover:-translate-y-0.5",
              )}
            >
              <div className="relative flex items-center gap-3 overflow-hidden rounded-[29px] bg-[radial-gradient(circle_at_top,rgba(255,214,120,0.2),transparent_44%),linear-gradient(180deg,rgba(93,54,12,0.88)_0%,rgba(44,23,7,0.94)_100%)] px-4 py-4">
                <div className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-[linear-gradient(180deg,#fff0ae_0%,#ffc629_46%,#8e4d03_100%)] shadow-[0_0_18px_rgba(255,199,84,0.45)]" />
                <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-yellow-100/45 to-transparent" />
                <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-yellow-300/10 blur-3xl" />

                <div
                  className={cn(
                    "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border",
                    taskVisual.iconWrapperClassName,
                  )}
                >
                  <Icon className={cn("h-7 w-7", taskVisual.iconClassName)} />

                  {task.done && (
                    <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200/40 bg-emerald-500 text-white shadow-[0_6px_12px_rgba(0,0,0,0.22)]">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-base font-extrabold leading-tight text-[#fff3d4] drop-shadow-[0_2px_10px_rgba(0,0,0,0.3)]">
                    {task.title}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-yellow-100/62">{getTaskHint(task)}</div>
                  {renderReward(task)}
                </div>

                <button
                  onClick={() => void handleTaskClaim(task)}
                  disabled={task.done || isBusy}
                  className={cn(
                    "relative isolate min-w-[116px] shrink-0 overflow-hidden rounded-full px-4 py-3 text-center text-sm font-black uppercase tracking-[0.14em] whitespace-nowrap transition-transform duration-200 active:translate-y-[1px]",
                    task.done
                      ? "border border-emerald-300/30 bg-[linear-gradient(180deg,rgba(67,112,50,0.96)_0%,rgba(31,67,28,0.96)_100%)] text-emerald-100 shadow-[inset_0_1px_0_rgba(210,255,214,0.16),0_10px_18px_rgba(0,0,0,0.24)]"
                      : "border border-[#ffe193]/70 bg-[linear-gradient(180deg,#fff7c3_0%,#ffd551_42%,#c77705_100%)] text-[#572800] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-2px_0_rgba(133,75,6,0.45),0_10px_18px_rgba(0,0,0,0.26)] hover:scale-[1.02]",
                  )}
                >
                  {!task.done && (
                    <span className="pointer-events-none absolute inset-x-3 top-1 h-1/2 rounded-full bg-white/35 blur-sm" />
                  )}

                  <span className="relative flex items-center justify-center gap-1.5">
                    {task.done && <CheckCircle2 className="h-4 w-4" />}
                    {task.done
                      ? "ÄÃ£ hoÃ n thÃ nh"
                      : isBusy
                        ? "Äang xá»­ lÃ½"
                        : task.type === "ad"
                          ? "Xem video"
                          : task.actionType === "join"
                            ? isPrepared
                              ? "Xac minh"
                              : "Tham gia"
                            : task.actionType === "react_heart"
                              ? isPrepared
                                ? "Xac minh"
                                : "Tha tym"
                            : "Nháº­n"}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-32 pt-24">
      <div className="pointer-events-none absolute inset-x-0 top-16 bottom-16 overflow-hidden">
        <div className="absolute left-[-6.5rem] top-16 h-60 w-60 rounded-full bg-yellow-500/10 blur-[88px]" />
        <div className="absolute right-[-7rem] top-44 h-64 w-64 rounded-full bg-amber-300/10 blur-[100px]" />
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-yellow-400/30 to-transparent" />
      </div>

      <div className="relative z-10 mb-8 px-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-[#2e1b08]/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-yellow-100/75 shadow-[inset_0_1px_0_rgba(255,231,173,0.1)]">
          <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
          Trung tam thuong
        </div>

        <h1 className="mt-4 bg-[linear-gradient(180deg,#fff7d0_0%,#ffd970_42%,#ae6309_100%)] bg-clip-text text-[2.1rem] font-black uppercase leading-none text-transparent">
          Nhiem vu
        </h1>

        <p className="mt-3 max-w-[18rem] text-sm leading-6 text-yellow-100/80">
          Hoan thanh tung dau viec de nhan them vang va $.
        </p>
      </div>

      <div className="relative z-10 space-y-8">
        {newbieLockRequired ? (
          <div className="rounded-[28px] border border-rose-300/26 bg-[linear-gradient(180deg,rgba(113,30,42,0.82)_0%,rgba(53,14,20,0.95)_100%)] px-4 py-4 shadow-[0_18px_36px_rgba(0,0,0,0.3)]">
            <div className="flex items-start gap-3">
              <div className="rounded-[18px] border border-rose-200/25 bg-rose-500/16 p-3 text-rose-100">
                <ShieldAlert className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-rose-100/75">Mo khoa tan thu</p>
                <p className="mt-2 text-sm leading-6 text-rose-50/90">
                  Ban dang o che do tan thu do duoc moi. Hoan thanh nhiem vu tan thu de mo cac tab va tinh nang khac.
                </p>
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-rose-100/70">
                  Tien do: {formatNumber(newbieCompletedTasks)}/{formatNumber(newbieTotalTasks)} â€¢ Con{" "}
                  {formatNumber(newbieRemainingTasks)} nhiem vu
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {hasTaskMilestone ? (
          <div className="rounded-[28px] border border-cyan-300/18 bg-[linear-gradient(180deg,rgba(17,62,75,0.72)_0%,rgba(7,25,31,0.94)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.28)]">
            <div className="flex items-start gap-3">
              <div className="rounded-[18px] border border-cyan-200/20 bg-cyan-400/10 p-3 text-cyan-100">
                <CheckCircle2 className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-100/65">Moc task hom nay</p>
                <p className="mt-2 text-sm leading-6 text-cyan-50/90">
                  Hoan thanh {formatNumber(taskMilestoneCount)} task de nhan them{" "}
                  {taskMilestoneRewardGold > 0 ? `${formatNumber(taskMilestoneRewardGold)} vang` : null}
                  .
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {sections.length > 0 ? (
          sections.map((section) => <div key={section.key}>{renderTaskGroup(section.title, section.tasks)}</div>)
        ) : (
          <div className="rounded-[28px] border border-yellow-500/20 bg-[linear-gradient(180deg,rgba(70,41,10,0.78)_0%,rgba(35,20,7,0.94)_100%)] px-4 py-8 text-center shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
            <Sparkles className="mx-auto h-10 w-10 text-yellow-100/25" />
            <p className="mt-3 text-sm leading-6 text-yellow-100/55">Hien chua co nhiem vu nao kha dung.</p>
          </div>
        )}
      </div>
    </div>
  );
}


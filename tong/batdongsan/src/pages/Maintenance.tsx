import { AlertTriangle, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSeo } from "@/hooks/useSeo";
import type { SiteMaintenanceStatus } from "@/hooks/useSiteMaintenanceStatus";

function formatDateTime(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function Maintenance({ status }: { status: SiteMaintenanceStatus }) {
  const updatedAtLabel = formatDateTime(status.updatedAt);

  useSeo({
    title: "Website Dang Bao Tri | 80LandTimPhong.vn",
    description: "He thong dang trong thoi gian bao tri. Vui long quay lai sau it phut nua.",
    image: "/opengraph.jpg",
    type: "website",
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,245,235,0.95),_rgba(255,255,255,1)_48%,_rgba(247,247,244,1)_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(180,83,9,0.08),transparent_38%,rgba(15,23,42,0.05)_100%)]" />
      <div className="absolute left-[-8rem] top-[-6rem] h-56 w-56 rounded-full bg-amber-200/50 blur-3xl" />
      <div className="absolute bottom-[-8rem] right-[-5rem] h-64 w-64 rounded-full bg-orange-200/40 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center px-4 py-12">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="overflow-hidden rounded-[32px] border border-amber-200/80 bg-white/90 shadow-[0_30px_90px_rgba(120,53,15,0.14)] backdrop-blur">
            <div className="border-b border-amber-100 bg-[linear-gradient(135deg,#fff7ed,#fffbeb_52%,#ffffff)] px-6 py-6 md:px-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-amber-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Bao Tri He Thong
              </div>
              <h1 className="mt-4 max-w-2xl text-3xl font-black tracking-tight text-slate-900 md:text-5xl">
                Website tam thoi nghi de nang cap trai nghiem.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                {status.message || "He thong dang trong che do bao tri. Vui long quay lai sau it phut nua."}
              </p>
            </div>

            <div className="grid gap-5 px-6 py-6 md:grid-cols-3 md:px-8">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <Wrench className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-base font-black text-slate-900">Dang toi uu he thong</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Chung toi dang cap nhat de website chay on dinh hon khi dong nguoi vao cung luc.
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-base font-black text-slate-900">Tam khoa truy cap thuong</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Mot so tinh nang da duoc tam dung de tranh loi trong luc bao tri.
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-base font-black text-slate-900">Kiem tra lai sau</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Bam tai lai sau it phut. Khi che do bao tri duoc tat, website se mo lai ngay.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 px-6 py-6 md:px-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="h-12 rounded-2xl bg-[#b45309] px-5 text-sm font-bold text-white hover:bg-[#92400e]"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Thu tai lai
                </Button>
                <p className="text-sm text-slate-500">
                  {updatedAtLabel ? `Cap nhat trang thai luc ${updatedAtLabel}.` : "Trang thai bao tri se duoc cap nhat tu dong."}
                </p>
              </div>
            </div>
          </section>

          <aside className="rounded-[32px] border border-slate-200/80 bg-slate-950 text-white shadow-[0_30px_90px_rgba(15,23,42,0.18)]">
            <div className="h-full p-6 md:p-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-white/70">
                80LandTimPhong.vn
              </div>
              <h2 className="mt-5 text-2xl font-black tracking-tight">Se tro lai som.</h2>
              <p className="mt-3 text-sm leading-7 text-white/70">
                Trong thoi gian nay, khu dieu khien `/admin/bichha` van hoat dong de quan tri vien bat tat che do bao tri va kiem tra he thong.
              </p>

              <div className="mt-8 space-y-4">
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Trang thai</p>
                  <p className="mt-3 text-lg font-black text-amber-300">Dang bao tri</p>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Goi y</p>
                  <p className="mt-3 text-sm leading-7 text-white/70">
                    Neu ban vua thao tac dang tin, tim kiem hoac xem phong, vui long quay lai sau. Du lieu he thong se duoc kiem tra va on dinh lai truoc khi mo cua.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

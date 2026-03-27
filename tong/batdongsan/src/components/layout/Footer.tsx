import { Globe, MapPin, Phone } from "lucide-react";

export function Footer({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`${compact ? "" : "mt-auto "}border-t border-border bg-slate-950 text-sm text-white/75`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-7 pb-24 md:flex-row md:items-start md:justify-between md:py-8 md:pb-8">
        <div className="space-y-2">
          <p className="text-lg font-extrabold uppercase tracking-[0.08em] text-white">80LAND TÌM PHÒNG</p>
          <p className="text-white/80">
            <span className="font-semibold text-white">Giấy DKKD:</span> Số 036305000432 do UBND Xã Rạng Đông , Tỉnh Ninh Bình cấp phép
          </p>
          <p className="text-white/80">
            <span className="font-semibold text-white">Chịu trách nhiệm nội dung:</span> Bà Nguyễn Bích Hà
          </p>
          <p className="flex items-start gap-2 leading-relaxed text-white/80">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
           
          </p>
        </div>

        <div className="space-y-2 md:text-right">
          <a
            href="tel:0876480130"
            className="flex items-center gap-2 text-white/80 transition-colors hover:text-primary md:justify-end"
          >
            <Phone className="h-4 w-4 shrink-0 text-primary" />
            <span>
              <span className="font-semibold text-white">Hotline:</span> 0876 480 130
            </span>
          </a>
          <a
            href="https://80landtimphong.vn"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-white/80 transition-colors hover:text-primary md:justify-end"
          >
            <Globe className="h-4 w-4 shrink-0 text-primary" />
            <span>
              <span className="font-semibold text-white">Website:</span> 80landtimphong.vn
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}

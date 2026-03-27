import { useMemo } from "react";
import { Link } from "wouter";
import { Heart, Trash2 } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import { usePropertyIndex } from "@/lib/local-properties";
import { PropertyCard } from "@/components/property/PropertyCard";

export function Saved() {
  const { favorites, clearAll } = useFavorites();
  const { data: propertyIndex, isLoading } = usePropertyIndex();

  const savedProperties = useMemo(
    () => propertyIndex?.filter((property) => favorites.includes(property.id)) ?? [],
    [favorites, propertyIndex],
  );

  return (
    <div className="min-h-screen bg-[#f8f8f8] pb-24 lg:pb-8">
      <div className="max-w-[1140px] mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Heart className="w-6 h-6 text-primary fill-primary" />
              Phòng đã lưu
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {savedProperties.length} phòng đang theo dõi
            </p>
          </div>
          {savedProperties.length > 0 && (
            <button
              onClick={() => clearAll()}
              className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Xóa tất cả
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="animate-pulse overflow-hidden rounded-2xl border border-border bg-white">
                <div className="bg-muted" style={{ paddingBottom: "75%" }} />
                <div className="space-y-2 p-3">
                  <div className="h-3 w-1/3 rounded bg-muted" />
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : savedProperties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Heart className="w-10 h-10 text-primary/40" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Chưa có phòng nào được lưu</h2>
            <p className="text-muted-foreground text-sm max-w-xs mb-6">
              Bấm vào biểu tượng ❤️ trên mỗi phòng để lưu lại, tìm kiếm sau dễ hơn!
            </p>
            <Link href="/search?type=cho-thue">
              <button className="bg-primary text-white font-bold px-6 py-2.5 rounded-xl hover:bg-primary/90 transition-colors">
                Khám phá phòng ngay
              </button>
            </Link>
          </div>
        ) : (
          <>
            {/* Tip box */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6 flex items-start gap-3">
              <span className="text-2xl">💡</span>
              <div>
                <p className="text-sm font-semibold text-foreground">Mẹo: So sánh phòng đã lưu</p>
                <p className="text-xs text-muted-foreground mt-0.5">Bạn có thể bấm vào từng phòng để xem chi tiết, ảnh và đánh giá từ người thuê trước.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {savedProperties.map((property) => (
                <PropertyCard key={property.id} property={property} layout="grid" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

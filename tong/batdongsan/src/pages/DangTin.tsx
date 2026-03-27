import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import {
  Home, Phone, User,
  Image, CheckCircle2, ChevronDown, AlertCircle, Loader2, Lock, Percent
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, apiFetch, apiJsonFetch } from "@/context/AuthContext";

const PROVINCES = ["Hà Nội", "Hồ Chí Minh"];

const DISTRICTS: Record<string, string[]> = {
  "Hà Nội": [
    "Ba Đình", "Hoàn Kiếm", "Tây Hồ", "Long Biên", "Cầu Giấy",
    "Đống Đa", "Hai Bà Trưng", "Hoàng Mai", "Thanh Xuân",
    "Nam Từ Liêm", "Bắc Từ Liêm", "Hà Đông", "Gia Lâm",
  ],
  "Hồ Chí Minh": [
    "Quận 1", "Quận 3", "Quận 4", "Quận 5", "Quận 6",
    "Quận 7", "Quận 8", "Quận 10", "Quận 11", "Quận 12",
    "Bình Thạnh", "Tân Bình", "Tân Phú", "Gò Vấp",
    "Phú Nhuận", "Bình Tân", "Thủ Đức",
  ],
};

const CATEGORIES = [
  { value: "phong-tro", label: "🏠 Phòng trọ" },
  { value: "studio", label: "🛋️ Studio / Mini apartment" },
  { value: "nha-nguyen-can", label: "🏡 Nhà nguyên căn" },
  { value: "o-ghep", label: "👥 Ở ghép / Tìm người ghép" },
  { value: "mat-bang", label: "🏪 Mặt bằng kinh doanh" },
  { value: "van-phong", label: "🏢 Văn phòng" },
];

const PRICE_UNITS = ["triệu/tháng", "tỷ/tháng", "triệu", "tỷ"];

const STEPS = ["Loại phòng", "Thông tin", "Liên hệ & HH", "Hoàn tất"];

type PostingStatus = {
  isEnabled: boolean;
  message: string;
  updatedAt?: string;
};

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-foreground mb-1.5">
      {children} {required && <span className="text-primary">*</span>}
    </label>
  );
}

function SelectField({
  value, onChange, options, placeholder
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 pl-3 pr-10 rounded-lg border border-input bg-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}

function InputField({
  value, onChange, placeholder, type = "text"
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-11 px-3 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
    />
  );
}

export function DangTin() {
  const [, setLocation] = useLocation();
  const { user, token, isLoggedIn } = useAuth();
  const [isPending, setIsPending] = useState(false);
  const [postingStatus, setPostingStatus] = useState<PostingStatus | null>(null);
  const [isPostingStatusLoading, setIsPostingStatusLoading] = useState(true);

  const [step, setStep] = useState(0);
  const [success, setSuccess] = useState(false);
  const [newId, setNewId] = useState<number | null>(null);

  const [form, setForm] = useState({
    type: "cho-thue",
    category: "",
    title: "",
    province: "",
    district: "",
    ward: "",
    address: "",
    price: "",
    priceUnit: "triệu/tháng",
    area: "",
    bedrooms: "",
    bathrooms: "",
    floors: "",
    description: "",
    contactName: user?.name || "",
    contactPhone: user?.phone || "",
    imageUrls: ["", "", ""],
    commission: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const districts = form.province ? (DISTRICTS[form.province] || []).map((d) => ({ value: d, label: d })) : [];

  useEffect(() => {
    let isActive = true;

    const loadPostingStatus = async () => {
      setIsPostingStatusLoading(true);

      const fallback: PostingStatus = {
        isEnabled: true,
        message: "Đăng bài đang được bật. Người dùng có thể gửi tin mới.",
      };

      const { res, data } = await apiJsonFetch<PostingStatus>(
        "/properties/posting-status",
        fallback,
      );

      if (!isActive) {
        return;
      }

      setPostingStatus(res.ok ? data : fallback);
      setIsPostingStatusLoading(false);
    };

    void loadPostingStatus();

    return () => {
      isActive = false;
    };
  }, []);

  const canNext = () => {
    if (step === 0) return form.type && form.category;
    if (step === 1) return form.title && form.province && form.district && form.address && form.price && form.area && form.description;
    if (step === 2) return form.contactName && form.contactPhone;
    return true;
  };

  if (isPostingStatusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/20 px-4 pt-6 pb-24 md:pt-24 md:pb-20">
        <div className="bg-white rounded-2xl border border-border shadow-xl p-10 max-w-md w-full text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Đang kiểm tra trạng thái đăng bài</h2>
          <p className="text-muted-foreground text-sm">Vui lòng đợi trong giây lát...</p>
        </div>
      </div>
    );
  }

  if (postingStatus && !postingStatus.isEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/20 px-4 pt-6 pb-24 md:pt-24 md:pb-20">
        <div className="bg-white rounded-2xl border border-border shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Đăng bài tạm thời đang tắt</h2>
          <p className="text-muted-foreground text-sm mb-6">{postingStatus.message}</p>
          <div className="flex flex-col gap-3">
            <Button className="w-full bg-primary" onClick={() => setLocation("/")}>
              Về trang chủ
            </Button>
            <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
              Kiểm tra lại
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/20 px-4 pt-6 pb-24 md:pt-24 md:pb-20">
        <div className="bg-white rounded-2xl border border-border shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Đăng nhập để đăng tin</h2>
          <p className="text-muted-foreground text-sm mb-6">Bạn cần có tài khoản để đăng tin cho thuê phòng</p>
          <div className="flex flex-col gap-3">
            <Link href="/dang-nhap">
              <Button className="w-full bg-primary">Đăng nhập</Button>
            </Link>
            <Link href="/dang-ky">
              <Button variant="outline" className="w-full">Tạo tài khoản mới</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (postingStatus && !postingStatus.isEnabled) {
      alert(postingStatus.message);
      return;
    }

    const images = form.imageUrls.filter(Boolean);
    const priceNum = Number(form.price);

    const payload = {
      title: form.title,
      type: form.type,
      category: form.category,
      price: priceNum,
      priceUnit: form.priceUnit,
      area: Number(form.area),
      address: form.address,
      province: form.province,
      district: form.district,
      ward: form.ward || undefined,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
      floors: form.floors ? Number(form.floors) : undefined,
      description: form.description,
      images,
      contactName: form.contactName,
      contactPhone: form.contactPhone,
      commission: form.commission ? Number(form.commission) : undefined,
    };

    setIsPending(true);
    try {
      const res = await apiFetch("/properties", {
        method: "POST",
        body: JSON.stringify(payload),
      }, token);
      const created = await res.json();
      if (!res.ok) {
        alert(created.message || "Có lỗi xảy ra. Vui lòng thử lại.");
        return;
      }
      setNewId(created.id);
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert("Có lỗi xảy ra. Vui lòng thử lại.");
    } finally {
      setIsPending(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/20 px-4 pt-6 pb-24 md:pt-24 md:pb-20">
        <div className="bg-white rounded-2xl border border-border shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">Đã gửi tin đăng!</h2>
          <p className="text-muted-foreground mb-2">
            Tin của bạn đang <strong>chờ admin duyệt</strong>. Sau khi được duyệt, tin sẽ hiển thị công khai trong <strong>15 ngày</strong>.
          </p>
          <p className="text-sm text-muted-foreground mb-8">Mã tin: <strong className="text-primary">#{newId}</strong></p>
          <div className="flex flex-col gap-3">
            {newId && (
              <Button className="w-full bg-primary" onClick={() => setLocation(`/property/${newId}`)}>
                Xem tin đăng
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => { setSuccess(false); setStep(0); setForm(f => ({ ...f, title: "", description: "", price: "", area: "" })); }}>
              Đăng tin khác
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setLocation("/")}>
              Về trang chủ
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/20 pt-4 pb-24 md:pt-12 md:pb-20">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-foreground mb-2">Đăng tin bất động sản</h1>
          <p className="text-muted-foreground">Tin đăng sẽ tự động xóa sau 15 ngày</p>
        </div>

        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                  i < step ? "bg-primary border-primary text-white" :
                  i === step ? "border-primary text-primary bg-white" :
                  "border-border text-muted-foreground bg-white"
                }`}>
                  {i < step ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
                </div>
                <span className={`text-xs mt-1 font-medium hidden sm:block ${i === step ? "text-primary" : "text-muted-foreground"}`}>
                  {s}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 transition-all ${i < step ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-border shadow-sm p-6 md:p-8">

          {step === 0 && (
            <div className="space-y-6">
              <div>
                <FieldLabel required>Loại giao dịch</FieldLabel>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[{ value: "ban", label: "🏠 Mua bán" }, { value: "cho-thue", label: "🔑 Cho thuê" }].map((t) => (
                    <button
                      key={t.value}
                      onClick={() => set("type")(t.value)}
                      className={`p-4 rounded-xl border-2 text-center font-semibold transition-all ${
                        form.type === t.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <FieldLabel required>Loại bất động sản</FieldLabel>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => set("category")(c.value)}
                      className={`p-3 rounded-xl border-2 text-left text-sm font-medium transition-all ${
                        form.category === c.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <FieldLabel required>Tiêu đề tin đăng</FieldLabel>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => set("title")(e.target.value)}
                  placeholder="VD: Bán căn hộ 2PN view hồ tây, full nội thất cao cấp..."
                  className="w-full h-11 px-3 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">{form.title.length}/100 ký tự</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel required>Tỉnh/Thành phố</FieldLabel>
                  <SelectField
                    value={form.province}
                    onChange={(v) => { set("province")(v); set("district")(""); }}
                    options={PROVINCES.map((p) => ({ value: p, label: p }))}
                    placeholder="Chọn tỉnh/thành"
                  />
                </div>
                <div>
                  <FieldLabel required>Quận/Huyện</FieldLabel>
                  <SelectField
                    value={form.district}
                    onChange={set("district")}
                    options={districts}
                    placeholder="Chọn quận/huyện"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Phường/Xã</FieldLabel>
                  <InputField value={form.ward} onChange={set("ward")} placeholder="Nhập phường/xã" />
                </div>
                <div>
                  <FieldLabel required>Địa chỉ cụ thể</FieldLabel>
                  <InputField value={form.address} onChange={set("address")} placeholder="Số nhà, tên đường..." />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="col-span-2">
                  <FieldLabel required>Giá</FieldLabel>
                  <InputField value={form.price} onChange={set("price")} placeholder="VD: 3.5" type="number" />
                </div>
                <div>
                  <FieldLabel required>Đơn vị</FieldLabel>
                  <SelectField
                    value={form.priceUnit}
                    onChange={set("priceUnit")}
                    options={PRICE_UNITS.map((u) => ({ value: u, label: u }))}
                    placeholder="Đơn vị"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel required>Diện tích (m²)</FieldLabel>
                  <InputField value={form.area} onChange={set("area")} placeholder="VD: 65" type="number" />
                </div>
                <div>
                  <FieldLabel>Số tầng</FieldLabel>
                  <InputField value={form.floors} onChange={set("floors")} placeholder="VD: 4" type="number" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Số phòng ngủ</FieldLabel>
                  <SelectField
                    value={form.bedrooms}
                    onChange={set("bedrooms")}
                    options={["1", "2", "3", "4", "5", "6+"].map((v) => ({ value: v, label: `${v} phòng ngủ` }))}
                    placeholder="Chọn số PN"
                  />
                </div>
                <div>
                  <FieldLabel>Số phòng tắm</FieldLabel>
                  <SelectField
                    value={form.bathrooms}
                    onChange={set("bathrooms")}
                    options={["1", "2", "3", "4+"].map((v) => ({ value: v, label: `${v} phòng tắm` }))}
                    placeholder="Chọn số PT"
                  />
                </div>
              </div>

              <div>
                <FieldLabel required>Mô tả chi tiết</FieldLabel>
                <textarea
                  value={form.description}
                  onChange={(e) => set("description")(e.target.value)}
                  placeholder="Mô tả chi tiết về bất động sản: vị trí, tiện ích, pháp lý, tình trạng nhà..."
                  rows={5}
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                />
              </div>

              <div>
                <FieldLabel>Link ảnh (tối đa 3 ảnh)</FieldLabel>
                <div className="space-y-3">
                  {form.imageUrls.map((url, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Image className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => {
                          const next = [...form.imageUrls];
                          next[i] = e.target.value;
                          setForm((f) => ({ ...f, imageUrls: next }));
                        }}
                        placeholder={`Link ảnh ${i + 1} (https://...)`}
                        className="flex-1 h-10 px-3 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Sử dụng link từ Google Drive, Imgur, hoặc dịch vụ lưu trữ ảnh
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  Thông tin liên hệ sẽ hiển thị công khai cho người tìm mua/thuê. Vui lòng điền chính xác.
                </p>
              </div>

              <div>
                <FieldLabel required>Tên người liên hệ</FieldLabel>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={form.contactName}
                    onChange={(e) => set("contactName")(e.target.value)}
                    placeholder="Họ và tên của bạn"
                    className="w-full h-11 pl-10 pr-3 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <FieldLabel required>Số điện thoại</FieldLabel>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="tel"
                    value={form.contactPhone}
                    onChange={(e) => set("contactPhone")(e.target.value)}
                    placeholder="0912 345 678"
                    className="w-full h-11 pl-10 pr-3 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <FieldLabel>Hoa hồng môi giới (%)</FieldLabel>
                <div className="relative">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={form.commission}
                    onChange={(e) => set("commission")(e.target.value)}
                    placeholder="VD: 2.5 (tức 2.5%)"
                    className="w-full h-11 pl-10 pr-3 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Thông tin hoa hồng chỉ admin mới thấy, không hiển thị công khai
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-semibold text-blue-800 mb-2 text-sm">Lưu ý về tin đăng</h4>
                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                  <li>Tin đăng cần <strong>admin duyệt</strong> trước khi hiển thị</li>
                  <li>Sau khi duyệt, tin có hiệu lực <strong>15 ngày</strong></li>
                  <li>Bạn có thể đăng lại bất kỳ lúc nào</li>
                </ul>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-foreground">Kiểm tra thông tin trước khi đăng</h3>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="bg-secondary/40 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Loại tin</p>
                    <p className="font-semibold">{form.type === "ban" ? "Mua bán" : "Cho thuê"}</p>
                  </div>
                  <div className="bg-secondary/40 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Danh mục</p>
                    <p className="font-semibold">{CATEGORIES.find(c => c.value === form.category)?.label || form.category}</p>
                  </div>
                </div>

                <div className="bg-secondary/40 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Tiêu đề</p>
                  <p className="font-semibold">{form.title}</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="bg-secondary/40 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Giá</p>
                    <p className="font-bold text-primary text-lg">{form.price} {form.priceUnit}</p>
                  </div>
                  <div className="bg-secondary/40 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Diện tích</p>
                    <p className="font-semibold">{form.area} m²</p>
                  </div>
                  <div className="bg-secondary/40 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Địa chỉ</p>
                    <p className="font-semibold text-sm">{form.district}, {form.province}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="bg-secondary/40 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Liên hệ</p>
                    <p className="font-semibold">{form.contactName}</p>
                    <p className="text-sm text-muted-foreground">{form.contactPhone}</p>
                  </div>
                  <div className="bg-secondary/40 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Hết hạn sau</p>
                    <p className="font-semibold">15 ngày</p>
                    <p className="text-xs text-muted-foreground">Tự động xóa</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row">
            {step > 0 && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep((s) => s - 1)}
                disabled={isPending}
              >
                Quay lại
              </Button>
            )}

            {step < STEPS.length - 1 ? (
              <Button
                className="flex-1 bg-primary"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext()}
              >
                Tiếp theo
              </Button>
            ) : (
              <Button
                className="flex-1 bg-primary"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Đang đăng tin...</>
                ) : (
                  "Đăng tin ngay"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

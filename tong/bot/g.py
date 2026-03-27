"""
Flask Web App - Tìm kiếm phòng & gửi Zalo cho Bích Hà
- Đọc data từ folder districts_ok/
- Lọc theo quận, địa chỉ, giá
- Nhấn Send -> gửi thông tin căn + ảnh vào Zalo Bích Hà
"""

import os
import sys
import json
import time
import re
import threading
import requests
import unicodedata
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, request, jsonify, render_template_string

# Force UTF-8 console output on Windows so startup logs do not crash the bot.
def _configure_console_output():
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")

    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


_configure_console_output()

# Import zlapi từ cùng thư mục
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import API_KEY, SECRET_KEY, IMEISUP, COOKIESUP
from zlapi import ZaloAPI
from zlapi.models import Message, ThreadType

app = Flask(__name__)

# ── Port Restriction for Security ──────────────────────────────────────────
@app.before_request
def restrict_ports():
    """Chỉ cho phép port 8000 truy cập vào /anh/ để tránh lộ admin chính ở port 5050"""
    server_port = str(request.environ.get('SERVER_PORT', ''))
    path = request.path
    
    if server_port == '8000':
        # Port 8000 chỉ dùng để xem ảnh
        allowed_prefixes = ['/anh/']
        if not any(path.startswith(p) for p in allowed_prefixes):
            return "<h3>Access Denied</h3><p>Port 8000 is for image gallery only.</p>", 403

# ── Cấu hình đường dẫn ──────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DISTRICTS_OK  = os.path.join(BASE_DIR, "districts_ok")
DISTRICTS_FULL = os.path.join(BASE_DIR, "districts_full")

TARGET_NAME = "bích hà"     # Tên (không dấu so sánh lowercase)

# ── Zalo bot instance (toàn cục) ──────────────────────────────────────────────
_bot = None
_bot_lock = threading.Lock()
_target_zalo_id = None       # ID Zalo của Bích Hà
_executor = ThreadPoolExecutor(max_workers=5)
_processed_mids = set()      # Tránh xử lý tin nhắn trùng

# ── Chat log (persistent) ─────────────────────────────────────────────────────
CHAT_LOG_FILE = os.path.join(BASE_DIR, "chat_log.json")
_chat_log_lock = threading.Lock()
_chat_log: dict = {}  # {uid: {name, avatar, messages: [{role,text,ts}]}}

def _load_chat_log():
    global _chat_log
    if os.path.exists(CHAT_LOG_FILE):
        try:
            with open(CHAT_LOG_FILE, "r", encoding="utf-8") as f:
                _chat_log = json.load(f)
            print(f"[CHAT] Loaded {len(_chat_log)} conversations")
        except: _chat_log = {}

def _save_chat_log_bg():
    try:
        with _chat_log_lock:
            data = json.dumps(_chat_log, ensure_ascii=False, indent=2)
        with open(CHAT_LOG_FILE, "w", encoding="utf-8") as f:
            f.write(data)
    except Exception as e:
        print(f"[CHAT] Lỗi save: {e}")

def chat_log_add(uid: str, name: str, role: str, text: str, avatar: str = ""):
    """Thêm tin nhắn vào log. role: 'user' | 'bot'"""
    uid = str(uid)
    with _chat_log_lock:
        if uid not in _chat_log:
            _chat_log[uid] = {"name": name or uid, "avatar": avatar, "messages": []}
        if name and name != uid:
            _chat_log[uid]["name"] = name
        if avatar:
            _chat_log[uid]["avatar"] = avatar
        _chat_log[uid]["messages"].append({"role": role, "text": text, "ts": time.time()})
        if len(_chat_log[uid]["messages"]) > 500:
            _chat_log[uid]["messages"] = _chat_log[uid]["messages"][-500:]
    threading.Thread(target=_save_chat_log_bg, daemon=True).start()

_load_chat_log()

# ── Helper: chuẩn hóa chuỗi ──────────────────────────────────────────────────
def remove_accents(s):
    s = str(s).lower().strip()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("đ", "d")
    return s


# ── WebBot: ZaloAPI + onMessage listener ─────────────────────────────────────
class WebBot(ZaloAPI):
    """ZaloAPI với onMessage handler xử lý lệnh /showanh từ khách."""

    def onMessage(self, mid, author_id, message, message_object, thread_id, thread_type):
        global _processed_mids
        # Tránh xử lý trùng
        if mid in _processed_mids:
            return
        _processed_mids.add(mid)
        if len(_processed_mids) > 2000:
            _processed_mids.clear()

        try:
            author_str  = str(author_id)
            thread_str  = str(thread_id)

            # Bỏ qua tin nhắn của chính bot
            if author_str == str(getattr(self, "uid", "")):
                return

            # Chỉ xử lý tin nhắn USER (1:1), bỏ group
            if thread_type != ThreadType.USER:
                return

            if not isinstance(message, str) or not message.strip():
                return

            msg = message.strip()
            print(f"[WEB_BOT] Nhận tin từ {thread_str}: {msg[:60]}")

            # ── Thử lấy thông tin khách ──
            name = ""
            avatar = ""
            with _chat_log_lock:
                needs_info = thread_str not in _chat_log or _chat_log[thread_str].get("name") == thread_str
            
            if needs_info:
                try:
                    # fetchUserInfo thường cần một list ids
                    info = self.fetchUserInfo([thread_str])
                    if info and thread_str in info:
                        u = info[thread_str]
                        name = u.get("displayName") or u.get("zaloName") or u.get("name") or ""
                        avatar = u.get("avatar") or ""
                        print(f"[WEB_BOT] Found info for {thread_str}: '{name}'")
                    
                    if not name:
                        # Thử trong danh sách bạn bè
                        friends = self.fetchAllFriends()
                        for f in friends:
                            fid = str(getattr(f, "userId", None) or getattr(f, "uid", None) or "")
                            if fid == thread_str:
                                name = getattr(f, "displayName", "") or getattr(f, "zaloName", "") or ""
                                avatar = getattr(f, "avatar", "") or ""
                                print(f"[WEB_BOT] Found via friends for {thread_str}: '{name}'")
                                break
                except Exception as e:
                    print(f"[WEB_BOT] Lỗi fetchUserInfo: {e}")

            # Ghi log tin khách vào chat_log
            chat_log_add(thread_str, name, "user", msg, avatar)

            # ── /showanh <room_id> hoặc /anh <room_id> ───────────────────────
            if msg.lower().startswith("/showanh") or msg.lower().startswith("/anh"):
                # Tách ID: xử lý /showanh 123, /anh 123, hoặc /anh/123
                if msg.lower().startswith("/showanh"):
                    raw_id = msg[8:].strip()
                else: # /anh
                    raw_id = msg[4:].strip()
                    if raw_id.startswith("/"):
                        raw_id = raw_id[1:].strip()
                
                if not raw_id:
                    self.send(Message(text="❌ Cú pháp: /showanh <ID phòng> hoặc /anh <ID phòng>\nVí dụ: /anh 1768260875990"), thread_str, ThreadType.USER)
                    return

                clean_id = re.sub(r"[^a-zA-Z0-9_]", "", raw_id)
                print(f"[SHOWANH] User {thread_str} xem phòng ID={clean_id}")

                self.send(Message(text="⏳ Đang tải thông tin phòng..."), thread_str, ThreadType.USER)

                # ── Tìm summary (districts_ok) + full (districts_full) ──
                # Giống hệt logic send_room_to_zalo, nhưng tìm trên TẤT CẢ quận
                room_summary = None
                room_full    = None

                if os.path.exists(DISTRICTS_OK):
                    for fname in os.listdir(DISTRICTS_OK):
                        if not fname.endswith(".json"): continue
                        try:
                            with open(os.path.join(DISTRICTS_OK, fname), "r", encoding="utf-8") as f:
                                for r in json.load(f):
                                    if str(r.get("id", "")) == clean_id:
                                        room_summary = r; break
                        except: pass
                        if room_summary: break

                if os.path.exists(DISTRICTS_FULL):
                    for fname in os.listdir(DISTRICTS_FULL):
                        if not fname.endswith(".json"): continue
                        try:
                            with open(os.path.join(DISTRICTS_FULL, fname), "r", encoding="utf-8") as f:
                                for r in json.load(f):
                                    if str(r.get("id", "")) == clean_id:
                                        room_full = r; break
                        except: pass
                        if room_full: break

                if not room_full and not room_summary:
                    self.send(Message(text=f"❌ Không tìm thấy phòng ID: {clean_id}\nKiểm tra lại ID trong danh sách đã nhận."), thread_str, ThreadType.USER)
                    return

                # ── Build text — giống hệt send_room_to_zalo ──
                if room_summary:
                    addr  = room_summary.get("address", "N/A")
                    price = room_summary.get("price", "N/A")
                    rtype = room_summary.get("type", "")
                    type_str = f"\n🛏 Loại phòng: {rtype}" if rtype and str(rtype).lower() not in ("null", "none", "") else ""
                    info_text = (
                        f"🏠 THÔNG TIN PHÒNG\n"
                        f"📍 Địa chỉ: {addr}\n"
                        f"💰 Giá: {price}"
                        f"{type_str}"
                    )
                    if room_full:
                        full_text = room_full.get("text", "")
                        clean = full_text.replace("NỘI ĐÔ LAND", "Bít Chà Cute").replace("Nội Đô Land", "Bít Chà Cute")
                        clean = "\n".join(l for l in clean.split("\n") if "đẩy cho" not in l.lower() or "bít chà" in l.lower())
                        info_text += f"\n\n📝 Chi tiết:\n{clean}"
                else:
                    info_text = f"🏠 Phòng ID: {clean_id}"

                # ── Gửi text ──
                self.send(Message(text=info_text), thread_str, ThreadType.USER)
                chat_log_add(thread_str, "", "bot", info_text)

                # ── Gửi ảnh + video — dùng hàm _send_media có sẵn ──
                photos = room_full.get("photos", []) if room_full else []
                videos = room_full.get("videos", []) if room_full else []
                if photos or videos:
                    threading.Thread(
                        target=_send_media,
                        args=(photos[:10], videos[:3], thread_str, clean_id),
                        daemon=True
                    ).start()

        except Exception as e:
            print(f"[WEB_BOT] Lỗi onMessage: {e}")





# ── Khởi tạo bot listener ─────────────────────────────────────────────────────
_listen_bot = None       # Bot riêng để listen (WebBot)
_listen_lock = threading.Lock()

def get_bot():
    """Lấy bot dùng để GỬI (WebBot, nhưng không cần listen)."""
    global _bot
    with _bot_lock:
        if _bot is None:
            try:
                _bot = WebBot(API_KEY, SECRET_KEY, imei=IMEISUP, session_cookies=COOKIESUP)
                print("[BOT] Đã khởi tạo WebBot (send)")
            except Exception as e:
                print(f"[BOT] Lỗi khởi tạo bot: {e}")
    return _bot

def _start_listener():
    """Khởi động bot listen tin nhắn đến (chạy trong thread riêng)."""
    global _listen_bot
    while True:
        try:
            print("[LISTENER] Khởi động WebBot listener...")
            with _listen_lock:
                _listen_bot = WebBot(API_KEY, SECRET_KEY, imei=IMEISUP, session_cookies=COOKIESUP)
            print("[LISTENER] ✅ WebBot listener đã kết nối, bắt đầu listen...")
            _listen_bot.listen()
        except Exception as e:
            print(f"[LISTENER] ❌ Lỗi listener: {e}. Restart sau 10s...")
            time.sleep(10)

# Khởi động listener trong background thread
threading.Thread(target=_start_listener, daemon=True).start()


def find_bich_ha_id():
    """Tự động tìm ID Zalo của Bích Hà trong danh sách bạn bè"""
    global _target_zalo_id
    if _target_zalo_id:
        return _target_zalo_id
    
    bot = get_bot()
    if not bot:
        return None

    try:
        print("[BOT] Đang tìm ID Zalo của Bích Hà...")
        friends = bot.fetchAllFriends()
        if not friends:
            print("[BOT] Không lấy được danh sách bạn bè")
            return None

        target_norm = remove_accents(TARGET_NAME).replace(" ", "")
        for friend in friends:
            name = getattr(friend, "displayName", "") or getattr(friend, "zaloName", "") or ""
            name_norm = remove_accents(name).replace(" ", "")
            if target_norm in name_norm:
                uid = getattr(friend, "userId", None) or getattr(friend, "uid", None)
                if uid:
                    _target_zalo_id = str(uid)
                    print(f"[BOT] ✓ Tìm thấy Bích Hà: '{name}' → ID={_target_zalo_id}")
                    return _target_zalo_id

        print(f"[BOT] ❌ Không tìm thấy bạn tên '{TARGET_NAME}'")
        return None

    except Exception as e:
        print(f"[BOT] Lỗi tìm Bích Hà: {e}")
        return None

# Tìm ID lúc khởi động (chạy nền)
threading.Thread(target=find_bich_ha_id, daemon=True).start()


# ── Đọc danh sách districts ──────────────────────────────────────────────────
DISTRICT_LABELS = {
    "bactuliem":  "Bắc Từ Liêm",
    "badinh":     "Ba Đình",
    "caugiay":    "Cầu Giấy",
    "dongda":     "Đống Đa",
    "hadong":     "Hà Đông",
    "haibatrung": "Hai Bà Trưng",
    "hoaiduc":    "Hoài Đức",
    "hoangmai":   "Hoàng Mai",
    "hoankiem":   "Hoàn Kiếm",
    "longbien":   "Long Biên",
    "namtuliem":  "Nam Từ Liêm",
    "tayho":      "Tây Hồ",
    "thanhtri":   "Thanh Trì",
    "thanhxuan":  "Thanh Xuân",
    "khaicute":   "Khaicute",
}

def get_districts():
    result = []
    if not os.path.exists(DISTRICTS_OK):
        return result
    for fname in sorted(os.listdir(DISTRICTS_OK)):
        if fname.endswith(".json"):
            key = fname.replace(".json", "")
            result.append({"key": key, "label": DISTRICT_LABELS.get(key, key)})
    return result

def load_all_rooms(district_key=None, addr_keyword=None, price_min=None, price_max=None, room_type=None):
    """Đọc rooms từ districts_ok/, lọc theo các tiêu chí, sắp xếp từ mới nhất đến cũ nhất.
    Kèm theo thumb_url, full_text và danh sách ảnh từ districts_full nếu có.
    """
    all_rooms = []

    if district_key and district_key != "all":
        ok_files = [os.path.join(DISTRICTS_OK, f"{district_key}.json")]
    else:
        ok_files = [
            os.path.join(DISTRICTS_OK, f)
            for f in (os.listdir(DISTRICTS_OK) if os.path.exists(DISTRICTS_OK) else [])
            if f.endswith(".json")
        ]

    norm_kw = remove_accents(addr_keyword).replace(" ", "") if addr_keyword and addr_keyword.strip() else None

    for fpath in ok_files:
        d_key = os.path.basename(fpath).replace(".json", "")
        if not os.path.exists(fpath):
            continue

        # Đọc full data từ districts_full (id -> {text, photos})
        full_data_cache = {}  # id -> {text, photos}
        full_path = os.path.join(DISTRICTS_FULL, f"{d_key}.json")
        if os.path.exists(full_path):
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    full_rooms = json.load(f)
                for fr in full_rooms:
                    rid = fr.get("id")
                    if rid:
                        full_data_cache[rid] = {
                            "text": fr.get("text", ""),
                            "photos": fr.get("photos") or []
                        }
            except Exception as e:
                print(f"[LOAD_FULL_CACHE] Lỗi đọc {full_path}: {e}")

        try:
            with open(fpath, "r", encoding="utf-8") as f:
                rooms = json.load(f)
            for room in rooms:
                # Lấy dữ liệu chi tiết ngay để lọc và lấy thông tin
                full_info = full_data_cache.get(room.get("id"))
                if not full_info:
                    # Nếu không có data full thì cũng bỏ qua vì không có ảnh
                    continue

                # Lọc dạng phòng (Check cả field type và nội dung mô tả - VD: "2n1k")
                if room_type and room_type != "all":
                    r_type = str(room.get("type", "")).lower()
                    f_text = str(full_info.get("text", "")).lower()
                    if room_type.lower() not in r_type and room_type.lower() not in f_text:
                        continue
                
                # Lọc địa chỉ
                if norm_kw:
                    addr_norm = remove_accents(room.get("address", "")).replace(" ", "")
                    if norm_kw not in addr_norm:
                        continue

                # Lọc giá
                if price_min is not None or price_max is not None:
                    def parse_price(val):
                        if not val: return 0
                        s = str(val).strip()
                        # Nếu có nhiều dấu chấm, đó là phân cách hàng nghìn (ví dụ 5.500.000)
                        if s.count('.') > 1 or s.count(',') > 1:
                            s = s.replace(".", "").replace(",", "")
                        else:
                            # Nếu chỉ có 1 dấu chấm/phẩy, kiểm tra xem nó là thập phân hay hàng nghìn
                            # VD: "5.5" là thập phân, "5.500" là hàng nghìn
                            match = re.search(r'[.,](\d+)$', s)
                            if match:
                                if len(match.group(1)) == 3: # 3 chữ số sau dấu -> hàng nghìn
                                    s = s.replace(".", "").replace(",", "")
                                else: # Thập phân
                                    s = s.replace(",", ".")
                        
                        try:
                            n = float(s)
                            if 0 < n < 1000: # Ví dụ 5.5 hoặc 5.8
                                n *= 1_000_000
                            return int(n)
                        except: return 0

                    p1 = parse_price(room.get("price1"))
                    p2 = parse_price(room.get("price2")) or p1

                    if price_min is not None and p2 < price_min:
                        continue
                    if price_max is not None and p1 > price_max:
                        continue

                room["district_key"] = d_key
                room["district_label"] = DISTRICT_LABELS.get(d_key, d_key)
                # Timestamp từ id (ms)
                try:
                    r_ts = int(room.get("id", 0)) / 1000.0
                except:
                    r_ts = 0
                
                # 1. Lọc theo thời gian (giới hạn 7 ngày như Zalo lưu ảnh)
                cutoff = time.time() - (7 * 24 * 3600)
                if r_ts < cutoff:
                    continue

                room["_ts"] = r_ts
                room["full_text"] = full_info["text"]
                # Lấy tối đa 10 ảnh đầu tiên
                room["all_photos"] = [p.get("url") or p.get("hd") or p.get("href") for p in full_info["photos"][:10] if (p.get("url") or p.get("hd") or p.get("href"))]
                
                if not room["all_photos"]:
                    continue
                
                room["thumb_url"] = room["all_photos"][0]
                all_rooms.append(room)
        except Exception as e:
            print(f"[LOAD] Lỗi đọc {fpath}: {e}")

    # Sắp xếp từ mới nhất đến cũ nhất
    all_rooms.sort(key=lambda r: r.get("_ts", 0), reverse=True)
    return all_rooms



# ── Auto-cron: Xóa phòng > 7 ngày ──────────────────────────────────────────
def _delete_old_rooms_once():
    """Xóa các phòng > 7 ngày từ districts_full và districts_ok.
    - districts_full: dùng field 'timestamp' để xác định thời gian.
    - districts_ok: dùng 'id' (millisecond timestamp) vì không có timestamp riêng.
    """
    SEVEN_DAYS = 7 * 24 * 3600
    now = time.time()
    cutoff = now - SEVEN_DAYS
    total_deleted_full = 0

    # --- 1. Xóa từ districts_full và lấy danh sách ID còn lại ---
    valid_ids_per_district = {}  # district_key -> set of valid ids
    if os.path.exists(DISTRICTS_FULL):
        for fname in os.listdir(DISTRICTS_FULL):
            if not fname.endswith(".json"):
                continue
            d_key = fname.replace(".json", "")
            fpath = os.path.join(DISTRICTS_FULL, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    rooms = json.load(f)
                kept = []
                for room in rooms:
                    ts = room.get("timestamp", 0)
                    if ts and ts < cutoff:
                        total_deleted_full += 1
                    else:
                        kept.append(room)
                
                # Lưu file và lưu danh sách ID còn sống
                with open(fpath, "w", encoding="utf-8") as f:
                    json.dump(kept, f, ensure_ascii=False, indent=2)
                
                valid_ids_per_district[d_key] = set(str(r.get("id")) for r in kept)
                if total_deleted_full > 0:
                    print(f"[AUTOCRON] districts_full/{fname}: xóa {total_deleted_full} phòng cũ")
            except Exception as e:
                print(f"[AUTOCRON] Lỗi xử lý districts_full/{fname}: {e}")

    # --- 2. Xóa từ districts_ok, đồng bộ với districts_full ---
    total_deleted_ok = 0
    if os.path.exists(DISTRICTS_OK):
        for fname in os.listdir(DISTRICTS_OK):
            if not fname.endswith(".json"):
                continue
            d_key = fname.replace(".json", "")
            fpath = os.path.join(DISTRICTS_OK, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    rooms = json.load(f)
                
                kept = []
                # Lấy danh sách ID khả dụng của quận này từ districts_full
                valid_ids = valid_ids_per_district.get(d_key)
                
                for room in rooms:
                    room_id = str(room.get("id", ""))
                    
                    # A. Phải có trong districts_full (Sync strict)
                    if valid_ids is not None and room_id not in valid_ids:
                        total_deleted_ok += 1
                        continue
                    
                    # B. Kiểm tra thời gian (Phòng hờ trường hợp dist_full chưa update)
                    try:
                        id_ts = int(room_id) / 1000.0
                        if id_ts < cutoff:
                            total_deleted_ok += 1
                            continue
                    except:
                        pass
                    
                    kept.append(room)
                
                if len(rooms) != len(kept):
                    with open(fpath, "w", encoding="utf-8") as f:
                        json.dump(kept, f, ensure_ascii=False, indent=2)
                    print(f"[AUTOCRON] districts_ok/{fname}: đã xóa {len(rooms) - len(kept)} phòng (do sync/old)")
            except Exception as e:
                print(f"[AUTOCRON] Lỗi xử lý districts_ok/{fname}: {e}")

    total = total_deleted_full + total_deleted_ok
    if total > 0:
        print(f"[AUTOCRON] ✅ Tổng: đã xóa {total} phòng (full={total_deleted_full}, ok={total_deleted_ok})")
    else:
        print(f"[AUTOCRON] ✅ Không có phòng nào cần xóa")


def _autocron_loop():
    """Chạy auto-cron mỗi 6 giờ"""
    while True:
        try:
            _delete_old_rooms_once()
        except Exception as e:
            print(f"[AUTOCRON] Lỗi: {e}")
        time.sleep(6 * 3600)  # chạy lại sau 6 tiếng


# Khởi động auto-cron ngay lúc start
threading.Thread(target=_autocron_loop, daemon=True).start()


# ── Gửi phòng qua Zalo (giống khaicute) ─────────────────────────────────────
def send_room_to_zalo(room_id, district_key):
    """Tìm phòng trong districts_full rồi gửi cho Bích Hà"""
    target_id = _target_zalo_id or find_bich_ha_id()
    if not target_id:
        return False, "Không tìm thấy ID Zalo của Bích Hà"
    
    bot = get_bot()
    if not bot:
        return False, "Không kết nối được Zalo bot"

    # --- Lấy thông tin summary từ districts_ok ---
    ok_path = os.path.join(DISTRICTS_OK, f"{district_key}.json")
    room_summary = None
    if os.path.exists(ok_path):
        with open(ok_path, "r", encoding="utf-8") as f:
            for r in json.load(f):
                if r.get("id") == room_id:
                    room_summary = r
                    break

    # --- Lấy full data từ districts_full ---
    full_path = os.path.join(DISTRICTS_FULL, f"{district_key}.json")
    room_full = None
    if os.path.exists(full_path):
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                for r in json.load(f):
                    if r.get("id") == room_id:
                        room_full = r
                        break
        except:
            pass

    # Tạo text thông tin phòng
    if room_summary:
        addr  = room_summary.get("address", "N/A")
        price = room_summary.get("price", "N/A")
        rtype = room_summary.get("type", "")
        type_str = f"\n🛏 Loại phòng: {rtype}" if rtype and str(rtype).lower() not in ("null", "none", "") else ""
        info_text = (
            f"🏠 THÔNG TIN PHÒNG\n"
            f"📍 Địa chỉ: {addr}\n"
            f"💰 Giá: {price}"
            f"{type_str}"
        )
        if room_full:
            full_text = room_full.get("text", "")
            # Thay thế branding và giữ nguyên các dòng thông tin khác
            clean = full_text.replace("NỘI ĐÔ LAND", "Bít Chà Cute").replace("Nội Đô Land", "Bít Chà Cute")
            info_text += f"\n\n📝 Chi tiết:\n{clean}"
    else:
        info_text = f"🏠 Phòng ID: {room_id}"

    try:
        bot.send(Message(text=info_text), target_id, ThreadType.USER)
        print(f"[SEND] Đã gửi text cho {target_id}")
    except Exception as e:
        print(f"[SEND] Lỗi gửi text: {e}")
        return False, f"Lỗi gửi text: {e}"

    # Gửi ảnh + video
    photos = []
    videos = []
    if room_full:
        photos = room_full.get("photos", [])
        videos = room_full.get("videos", [])

    # Luôn gọi _send_media để gửi ít nhất 1 cái sticker ngăn cách (ngay cả khi không có ảnh/video)
    threading.Thread(
        target=_send_media,
        args=(photos[:10], videos[:3], target_id, room_id, True),
        daemon=True
    ).start()

    return True, f"Đã gửi thông tin căn cho Bích Hà (ID: {target_id})"


def _send_media(photos, videos, dest_id, room_id=None, send_sticker=False):
    """Gửi ảnh + video theo chuẩn gộp (giống forward_images.py / sender.py)"""
    bot = get_bot()
    if not bot:
        return
    
    room_url = f"http://163.227.230.41:8000/anh/{room_id}" if room_id else ""
    dest_id_str = str(dest_id)
    
    # Nhận diện chính xác User vs Group: 
    # Group ID thường bắt đầu bằng 14.. 15.. 16.. 21.. và có độ dài <= 16 ký tự. 
    # User ID thường >= 18 ký tự (VD: 35... 36...)
    if len(dest_id_str) >= 17:
        is_group = False
        t_type = ThreadType.USER
    else:
        is_group = True
        t_type = ThreadType.GROUP

    # ── 1. Gửi ảnh (Gộp ảnh - Direct URL) ──
    if photos:
        from zlapi import _util
        import random
        valid_photos = [p for p in photos if (p.get("url") or p.get("hd") or p.get("href"))]
        total = len(valid_photos)
        glid = str(int(time.time() * 1000)) # ID gộp ảnh
        
        print(f"[MEDIA] Gửi {total} ảnh (Gồm gộp) tới {'Group' if is_group else 'User'} {dest_id_str}")
        
        for i, photo in enumerate(valid_photos):
            try:
                # Delay 1.0 - 1.5s (giúp Zalo gộp ảnh đẹp hơn)
                if i > 0:
                    time.sleep(random.uniform(1.0, 1.5))
                
                photo_url = photo.get("url") or photo.get("hd") or photo.get("href")
                w, h = photo.get("width", 2560), photo.get("height", 2560)
                
                params_query = {"zpw_ver": 679, "zpw_type": 30, "nretry": 0}
                
                # Payload chuẩn theo gộp ảnh
                p_params = {
                    "photoId": int(_util.now() * 2),
                    "clientId": int(_util.now()),
                    "desc": "", "width": w, "height": h,
                    "rawUrl": photo_url, "hdUrl": photo_url, "thumbUrl": photo_url,
                    "thumbSize": "53932", "fileSize": "247671", "hdSize": "344622",
                    "zsource": -1, "jcp": json.dumps({"sendSource": 1, "convertible": "jxl"}),
                    "ttl": 0, 
                    "groupLayoutId": glid, 
                    "totalItemInGroup": total, 
                    "isGroupLayout": 1, 
                    "idInGroup": i,
                }
                
                if is_group:
                    url = "https://tt-files-wpa.chat.zalo.me/api/group/photo_original/send"
                    p_params["grid"] = dest_id_str
                    p_params["oriUrl"] = photo_url
                else:
                    url = "https://tt-files-wpa.chat.zalo.me/api/message/photo_original/send"
                    p_params["toid"] = dest_id_str
                    p_params["normalUrl"] = photo_url
                
                payload = {"params": bot._encode(p_params)}
                res = bot._post(url, params=params_query, data=payload)
                data = res.json()
                
                if data.get("error_code") == 0:
                    print(f"[MEDIA]  ✓ Ảnh {i+1}/{total} Sent")
                else:
                    print(f"[MEDIA]  ✗ Lỗi {data.get('error_code')}: {data.get('error_message')}")
                    # Thử fallback loại ngược lại nếu lỗi logic ID
                    if i == 0: 
                        print("[MEDIA] Thử gửi lại với mode thread khác...")
                        if is_group:
                            p_params.pop("grid", None)
                            p_params["toid"] = dest_id_str
                            p_params["normalUrl"] = photo_url
                            url_alt = "https://tt-files-wpa.chat.zalo.me/api/message/photo_original/send"
                        else:
                            p_params.pop("toid", None)
                            p_params["grid"] = dest_id_str
                            p_params["oriUrl"] = photo_url
                            url_alt = "https://tt-files-wpa.chat.zalo.me/api/group/photo_original/send"
                        
                        payload_alt = {"params": bot._encode(p_params)}
                        bot._post(url_alt, params=params_query, data=payload_alt)

            except Exception as e:
                print(f"[MEDIA]  ✗ Lỗi hệ thống gửi ảnh {i+1}: {e}")
                if "221" in str(e).lower() and room_id:
                    limit_msg = f"Zalo giới hạn, xem tại web: {room_url}"
                    try: bot.send(Message(text=limit_msg), dest_id, t_type)
                    except: pass
                    break

    # ── 2. Gửi video ──
    if videos:
        for video in videos:
            try:
                bot.sendRemoteVideo(
                    video["url"],
                    video.get("thumb") or video["url"],
                    video.get("duration", 1000),
                    dest_id, t_type,
                    width=video.get("width", 1280),
                    height=video.get("height", 720)
                )
                time.sleep(1.0)
            except Exception as e:
                print(f"[MEDIA] Lỗi video: {e}")

    # ── 3. Sticker (Gửi để ngăn cách các căn) ──
    if send_sticker:
        try:
            # Gửi sticker mặt cười (Package 1, ID 2)
            bot.send(Message(sticker_id="2", package_id="1"), dest_id, t_type)
        except:
            pass


# ── Flask Routes ─────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route("/api/districts")
def api_districts():
    return jsonify(get_districts())

@app.route("/api/rooms")
def api_rooms():
    district = request.args.get("district", "all")
    addr     = request.args.get("addr", "").strip()
    price_raw = request.args.get("price", "").strip()
    rtype    = request.args.get("type", "all").strip()
    
    price_min = price_max = None
    if price_raw:
        # Hỗ trợ: "3tr", "3tr-5tr", "duoi 4tr", "tren 3tr5"
        s = price_raw.lower()
        s = re.sub(r"(\d+)\s*tr\s*(\d+)", r"\1.\2", s)
        s = s.replace("triệu","tr").replace("m","tr").replace("củ","tr").replace("đ","tr")
        
        def to_val(v):
            try:
                m = re.search(r"(\d+\.?\d*)", v)
                if not m: return 0
                n = float(m.group(1))
                if n < 100: n *= 1_000_000
                return int(n)
            except: return 0
        
        range_m = re.search(r"(\d+\.?\d*)\s*[-–]+\s*(\d+\.?\d*)", s)
        if range_m:
            price_min = to_val(range_m.group(1))
            price_max = to_val(range_m.group(2))
        elif "dưới" in price_raw.lower() or "duoi" in s:
            price_max = to_val(s)
        elif "trên" in price_raw.lower() or "tren" in s:
            price_min = to_val(s)
        else:
            v = to_val(s)
            if v:
                price_min = max(0, v - 500_000)
                price_max = v + 500_000

    rooms = load_all_rooms(district, addr, price_min, price_max, rtype)

    # Thêm thông tin thời gian đăng (dạng chuỗi hiển thị)
    for r in rooms:
        ts = r.get("_ts", 0)
        if ts:
            try:
                r["posted_at"] = datetime.fromtimestamp(ts).strftime("%d/%m/%Y %H:%M")
            except:
                r["posted_at"] = ""
        else:
            r["posted_at"] = ""

    # Giới hạn 200 kết quả để tránh chậm
    return jsonify({"total": len(rooms), "rooms": rooms[:200]})

@app.route("/api/send", methods=["POST"])
def api_send():
    data = request.json or {}
    room_id = data.get("room_id")
    district_key = data.get("district_key")
    if not room_id or not district_key:
        return jsonify({"ok": False, "msg": "Thiếu room_id hoặc district_key"}), 400
    
    ok, msg = send_room_to_zalo(room_id, district_key)
    return jsonify({"ok": ok, "msg": msg})

@app.route("/api/send_batch", methods=["POST"])
def api_send_batch():
    """Gửi hàng loạt phòng cho Bích Hà."""
    data = request.json or {}
    items = data.get("items", []) # [{"id": "...", "district_key": "..."}, ...]
    
    if not items:
        return jsonify({"ok": False, "msg": "Danh sách phòng trống"}), 400
    
    results = []
    success_count = 0
    
    for item in items:
        rid = item.get("id")
        dk = item.get("district_key")
        if rid and dk:
            ok, msg = send_room_to_zalo(rid, dk)
            if ok: success_count += 1
            results.append({"id": rid, "ok": ok, "msg": msg})
            time.sleep(1) # Delay tránh spam
            
    return jsonify({
        "ok": success_count > 0, 
        "msg": f"Đã gửi thành công {success_count}/{len(items)} phòng.",
        "results": results
    })

@app.route("/api/target_status")
def api_target_status():
    return jsonify({
        "found": bool(_target_zalo_id),
        "id": _target_zalo_id,
        "name": TARGET_NAME.title()
    })


@app.route("/api/create_task", methods=["POST"])
def api_create_task():
    """
    Tạo task: tìm phòng theo bộ lọc (hoặc theo danh sách ID có sẵn) rồi gửi cho khách.
    """
    data = request.json or {}
    uid          = str(data.get("uid", "")).strip()
    district_key = data.get("district", "all").strip()
    addr_kw      = data.get("addr", "").strip()
    price_raw    = data.get("price", "").strip()
    rtype_kw     = data.get("type", "all").strip()
    custom_intro = data.get("intro", "").strip()
    room_items   = data.get("room_items", []) # [{id, district_key}]

    if not uid:
        return jsonify({"ok": False, "msg": "Thiếu uid người nhận"}), 400

    bot = get_bot()
    if not bot:
        return jsonify({"ok": False, "msg": "Không kết nối được Zalo bot"})

    rooms = []
    
    # Ưu tiên nếu có danh sách ID chọn sẵn
    if room_items:
        for item in room_items:
            rid = item.get("id")
            dk = item.get("district_key")
            if not rid or not dk: continue
            
            # Load room info từ file
            fpath = os.path.join(DISTRICTS_OK, f"{dk}.json")
            if os.path.exists(fpath):
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        for r in json.load(f):
                            if str(r.get("id")) == str(rid):
                                rooms.append(r)
                                break
                except: pass
    else:
        # Nếu không có ID chọn sẵn -> Lọc theo bộ lọc như cũ
        price_min = price_max = None
        if price_raw:
            s = price_raw.lower()
            s = re.sub(r"(\d+)\s*tr\s*(\d+)", r"\1.\2", s)
            s = s.replace("triệu","tr").replace("m","tr").replace("củ","tr")
            def to_val(v):
                try:
                    m = re.search(r"(\d+\.?\d*)", v)
                    if not m: return 0
                    n = float(m.group(1)); 
                    if n < 1000: n *= 1_000_000
                    return int(n)
                except: return 0
            
            range_m = re.search(r"(\d+\.?\d*)\s*[-–]+\s*(\d+\.?\d*)", s)
            if range_m:
                price_min = to_val(range_m.group(1))
                price_max = to_val(range_m.group(2))
            elif "dưới" in s: price_max = to_val(s)
            elif "trên" in s: price_min = to_val(s)
            else:
                v = to_val(s)
                if v:
                    price_min = max(0, v - 500_000)
                    price_max = v + 500_000

        rooms = load_all_rooms(district_key if district_key != "all" else None,
                               addr_kw or None, price_min, price_max, rtype_kw)

    if not rooms:
        return jsonify({"ok": False, "msg": "Không tìm thấy phòng nào phù hợp"})

    # Gửi danh sách cho khách
    top = rooms[:50] # Tăng lên 50 nếu khách chọn tay


    try:
        # 1. Lời giới thiệu
        intro = custom_intro or f"🏠 Xin chào! Dưới đây là {min(len(rooms), 10)} căn phòng mới nhất phù hợp nhất với yêu cầu của bạn:"
        bot.send(Message(text=intro), uid, ThreadType.USER)
        time.sleep(0.5)

        # 2. Gửi từng căn (tối đa 10 căn) theo thứ tự: tt -> ảnh -> sticker
        top = rooms[:10]
        for i, room in enumerate(top, 1):
            room_id = room.get("id")
            dk = room.get("district_key")
            if not room_id: continue
            
            # --- Lấy full text và media ---
            room_full = None
            if not dk:
                # Tìm dk nếu thiếu (thường có sẵn trong load_all_rooms)
                for fname in os.listdir(DISTRICTS_FULL):
                    if fname.endswith(".json"):
                        try:
                            with open(os.path.join(DISTRICTS_FULL, fname), "r", encoding="utf-8") as f:
                                for r in json.load(f):
                                    if str(r.get("id")) == str(room_id):
                                        room_full = r; dk = fname.replace(".json",""); break
                        except: pass
                    if room_full: break
            else:
                fpath = os.path.join(DISTRICTS_FULL, f"{dk}.json")
                if os.path.exists(fpath):
                    try:
                        with open(fpath, "r", encoding="utf-8") as f:
                            for r in json.load(f):
                                if str(r.get("id")) == str(room_id):
                                    room_full = r; break
                    except: pass

            # --- Gửi text ---
            addr = room.get("address", "N/A")
            price = room.get("price", "N/A")
            rtype = room.get("type", "")
            type_str = f"\n🛏 Loại phòng: {rtype}" if rtype and str(rtype).lower() not in ("null", "none", "") else ""
            
            clean_desc = ""
            if room_full:
                desc = room_full.get("text", "")
                clean_desc = desc.replace("NỘI ĐÔ LAND", "Bít Chà Cute").replace("Nội Đô Land", "Bít Chà Cute")
            
            info_text = (
                f"🏠 CĂN {i}\n"
                f"📍 Địa chỉ: {addr}\n"
                f"💰 Giá: {price}"
                f"{type_str}\n\n"
                f"📝 Chi tiết:\n{clean_desc}"
            )
            bot.send(Message(text=info_text), uid, ThreadType.USER)
            time.sleep(0.5)

            # --- Gửi Media (ảnh + video + sticker ở cuối) ---
            photos = room_full.get("photos", []) if room_full else []
            videos = room_full.get("videos", []) if room_full else []
            # --- Gửi Media + Sticker ngăn cách ---
            # Luôn gọi để có sticker ngăn cách các căn
            _send_media(photos[:10], videos[:2], uid, room_id, send_sticker=True)
            time.sleep(1.5) 

        print(f"[TASK] Đã gửi {len(top)} căn chi tiết cho uid={uid}")
        return jsonify({"ok": True, "msg": f"Đã gửi {len(top)} căn chi tiết cho khách", "count": len(top), "total": len(rooms)})

    except Exception as e:
        print(f"[TASK] Lỗi gửi task: {e}")
        return jsonify({"ok": False, "msg": f"Lỗi gửi: {e}"})


@app.route("/api/lookup_phone", methods=["POST"])
def api_lookup_phone():
    """Tra cuu Zalo ID tu so dien thoai - tu goi API de tranh loi int(None) trong thu vien."""
    data = request.json or {}
    phone_raw = str(data.get("phone", "")).strip()
    if not phone_raw:
        return jsonify({"ok": False, "msg": "Thieu so dien thoai"}), 400

    # Chuan hoa SDT -> dang 84xxxxxxxxx
    if phone_raw.startswith("0"):
        phone_e164 = "84" + phone_raw[1:]
    elif phone_raw.startswith("+84"):
        phone_e164 = "84" + phone_raw[3:]
    elif phone_raw.startswith("84"):
        phone_e164 = phone_raw
    else:
        phone_e164 = "84" + phone_raw

    bot = get_bot()
    if not bot:
        return jsonify({"ok": False, "msg": "Khong ket noi duoc Zalo bot"})

    try:
        # Goi thang API Zalo thay vi dung wrapper fetchPhoneNumber()
        # de tranh loi int(None) ben trong thu vien khi userId = None
        params_inner = {
            "phone": phone_e164,
            "avatar_size": 240,
            "language": "vi",
            "imei": bot._imei,
            "reqSrc": 85
        }
        params = {
            "zpw_ver": 645,
            "zpw_type": 30,
            "params": bot._encode(params_inner)
        }
        response = bot._get("https://tt-friend-wpa.chat.zalo.me/api/friend/profile/get", params=params)
        raw = response.json()
        print(f"[PHONE] Raw response error_code={raw.get('error_code')}, phone={phone_e164}")

        if raw.get("error_code") != 0:
            ec = raw.get("error_code")
            return jsonify({"ok": False, "msg": f"SĐT {phone_raw} không tìm thấy trên Zalo (có thể ẩn số). [err={ec}]"})

        decoded = bot._decode(raw["data"])
        if isinstance(decoded, str):
            try:
                decoded = json.loads(decoded)
            except:
                pass

        # Lay data ben trong
        inner = decoded.get("data") if isinstance(decoded, dict) else decoded
        if inner is None:
            inner = decoded
        if isinstance(inner, dict) and "data" in inner and isinstance(inner["data"], dict):
            inner = inner["data"]

        print(f"[PHONE] Decoded keys: {list(inner.keys()) if isinstance(inner, dict) else type(inner)}")

        # Trich xuat uid, name, avatar an toan (tranh int(None))
        uid = name = avatar = ""
        if isinstance(inner, dict):
            uid_raw  = inner.get("userId") or inner.get("uid") or inner.get("accnt")
            name_raw = inner.get("displayName") or inner.get("zaloName") or inner.get("name")
            ava_raw  = inner.get("avatar") or inner.get("ava") or ""
            # An toan: chi lay neu khong phai None/null/"0"
            uid    = str(uid_raw)    if uid_raw    not in (None, "", 0) else ""
            name   = str(name_raw)  if name_raw   not in (None, "")    else ""
            avatar = str(ava_raw)   if ava_raw     not in (None, "")   else ""
            if uid in ("None", "null", "0"):
                uid = ""

        if not uid:
            return jsonify({"ok": False, "msg": f"Không tìm thấy tài khoản Zalo với SĐT {phone_raw} (có thể ẩn số hoặc không dùng Zalo)"})

        print(f"[PHONE] Tìm thấy: SĐT {phone_raw} → ID={uid}, Tên={name}")
        return jsonify({"ok": True, "uid": uid, "name": name, "avatar": avatar, "phone": phone_raw})

    except Exception as e:
        print(f"[PHONE] Loi lookup {phone_raw}: {e}")
        import traceback; traceback.print_exc()
        err_str = str(e).lower()
        if any(x in err_str for x in ["error #", "error_code", "4023"]):
            return jsonify({"ok": False, "msg": f"Không tìm thấy SĐT {phone_raw} trên Zalo (có thể ẩn số hoặc không dùng Zalo)"})
        return jsonify({"ok": False, "msg": f"Lỗi tra cứu: {e}"})


@app.route("/api/send_to_phone", methods=["POST"])
def api_send_to_phone():
    """Gửi tin nhắn tới Zalo ID (đã lookup từ SĐT)."""
    data = request.json or {}
    uid   = str(data.get("uid", "")).strip()
    msg_text = str(data.get("message", "")).strip()
    room_id   = data.get("room_id", "")       # optional: kèm thông tin phòng
    district_key = data.get("district_key", "")

    if not uid:
        return jsonify({"ok": False, "msg": "Thiếu uid người nhận"}), 400
    if not msg_text and not room_id:
        return jsonify({"ok": False, "msg": "Thiếu nội dung tin nhắn"}), 400

    bot = get_bot()
    if not bot:
        return jsonify({"ok": False, "msg": "Không kết nối được Zalo bot"})

    try:
        # Gửi tin nhắn tự do
        if msg_text:
            bot.send(Message(text=msg_text), uid, ThreadType.USER)
            print(f"[PHONE_SEND] Đã gửi text tới {uid}")

        # Nếu có kèm phòng → gửi thêm thông tin phòng
        if room_id and district_key:
            ok_path  = os.path.join(DISTRICTS_OK, f"{district_key}.json")
            full_path = os.path.join(DISTRICTS_FULL, f"{district_key}.json")
            room_summary = None
            room_full    = None

            if os.path.exists(ok_path):
                with open(ok_path, "r", encoding="utf-8") as f:
                    for r in json.load(f):
                        if r.get("id") == room_id:
                            room_summary = r; break

            if os.path.exists(full_path):
                try:
                    with open(full_path, "r", encoding="utf-8") as f:
                        for r in json.load(f):
                            if r.get("id") == room_id:
                                room_full = r; break
                except: pass

            if room_summary:
                addr  = room_summary.get("address", "N/A")
                price = room_summary.get("price", "N/A")
                rtype = room_summary.get("type", "")
                type_str = f"\n🛏 Loại phòng: {rtype}" if rtype and str(rtype).lower() not in ("null", "none", "") else ""
                info_text = f"🏠 THÔNG TIN PHÒNG\n📍 Địa chỉ: {addr}\n💰 Giá: {price}{type_str}"
                if room_full:
                    full_text = room_full.get("text", "")
                    clean = full_text.replace("NỘI ĐÔ LAND", "Bít Chà Cute").replace("Nội Đô Land", "Bít Chà Cute")
                    info_text += f"\n\n📝 Chi tiết:\n{clean}"
                bot.send(Message(text=info_text), uid, ThreadType.USER)

                # Gửi media nếu có
                photos = room_full.get("photos", []) if room_full else []
                videos = room_full.get("videos", []) if room_full else []
                if photos or videos:
                    threading.Thread(target=_send_media, args=(photos[:10], videos[:3], uid, room_id), daemon=True).start()

        return jsonify({"ok": True, "msg": f"Đã gửi tin nhắn tới Zalo UID: {uid}"})

    except Exception as e:
        print(f"[PHONE_SEND] Lỗi gửi tới {uid}: {e}")
        return jsonify({"ok": False, "msg": f"Lỗi gửi: {e}"})


# ── HTML Template ─────────────────────────────────────────────────────────────
HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>🏠 Tìm Phòng – Gửi Zalo</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #090b10;
    --card: #151921;
    --card2: #1c222d;
    --border: rgba(255,255,255,.06);
    --accent: #7c6dff;
    --accent-glow: rgba(124, 109, 255, 0.25);
    --accent2: #4ade80;
    --green: #10b981;
    --red: #f43f5e;
    --text: #f8fafc;
    --muted: #94a3b8;
    --radius: 20px;
  }
  body { 
    font-family: 'Inter', sans-serif; 
    background: var(--bg); 
    background-image: 
        radial-gradient(circle at top right, rgba(124, 109, 255, 0.08), transparent 600px),
        radial-gradient(circle at bottom left, rgba(74, 222, 128, 0.05), transparent 600px);
    color: var(--text); 
    min-height: 100vh;
    overflow-x: hidden;
  }
  /* ── Batch Actions Bar ── */
  #batch-bar {
    position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
    background: rgba(22, 26, 35, 0.9); backdrop-filter: blur(12px);
    border: 1px solid var(--accent); border-radius: 99px;
    padding: 12px 24px; display: none; align-items: center; gap: 20px;
    z-index: 1002; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    animation: slideUp 0.3s ease;
  }
  #batch-bar span { font-size: 14px; font-weight: 600; }
  #btn-batch-send {
    padding: 8px 20px; background: var(--accent); border: none; border-radius: 99px;
    color: #fff; font-weight: 700; cursor: pointer; font-size: 13px;
  }
  #btn-batch-clear { background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 13px; }

  /* ── Room Card Checkbox ── */
  .room-check-wrapper {
    position: absolute; top: 12px; left: 12px; z-index: 10;
  }
  .room-checkbox {
    width: 28px; height: 28px; cursor: pointer;
    accent-color: var(--accent);
    border-radius: 6px;
    border: 2px solid var(--accent);
  }
  .room-card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 15px var(--accent-glow);
    background: var(--card2);
  }
  .room-card.selected .room-check-wrapper::after {
    content: "✓";
    position: absolute; top: -2px; left: 6px;
    color: white; font-weight: 900; font-size: 20px;
    pointer-events: none;
  }
  .room-photo-grid {
    display: flex; gap: 8px; overflow-x: auto; margin-top: 12px;
    padding-bottom: 8px; scrollbar-width: thin;
  }
  .room-photo-grid::-webkit-scrollbar { height: 4px; }
  .room-photo-grid img {
    height: 100px; width: 140px; object-fit: cover; border-radius: 8px;
    flex-shrink: 0; border: 1px solid var(--border); cursor: pointer;
  }
  .room-photo-grid img:hover { border-color: var(--accent); }

  /* ── Header ── */
  header {
    background: rgba(11, 14, 20, 0.8);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    padding: 24px 40px;
    display: flex; align-items: center; gap: 20px;
    position: sticky; top: 0; z-index: 100;
  }
  header .logo { 
    font-size: 32px; 
    filter: drop-shadow(0 0 10px var(--accent-glow));
  }
  header h1 { 
    font-family: 'Outfit', sans-serif;
    font-size: 24px; font-weight: 800;
    background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    letter-spacing: -0.5px;
  }
  header p { font-size: 13px; color: var(--muted); margin-top: 1px; }
  #target-badge {
    margin-left: auto; padding: 6px 16px; border-radius: 99px; font-size: 13px; font-weight: 600;
    border: 1px solid var(--border); background: var(--card2);
    display: flex; align-items: center; gap: 8px;
  }
  #target-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex-shrink: 0; transition: background .3s; }
  #target-dot.ok { background: var(--green); box-shadow: 0 0 8px var(--green); }

  /* ── Layout ── */
  .wrapper { max-width: 1300px; margin: 0 auto; padding: 28px 24px; }

  /* ── Filter bar ── */
  .filters {
    display: grid; grid-template-columns: 1fr 1fr 2fr 1fr auto; gap: 12px;
    background: var(--card); padding: 20px; border-radius: var(--radius);
    border: 1px solid var(--border); margin-bottom: 24px;
  }
  .filters label { display: block; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 6px; }
  .filters select, .filters input {
    width: 100%; padding: 10px 14px; border-radius: 8px; font-size: 14px; font-family: inherit;
    background: var(--card2); border: 1px solid var(--border); color: var(--text); outline: none;
    transition: border-color .2s;
  }
  .filters select:focus, .filters input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
  #btn-search {
    align-self: flex-end; padding: 12px 32px; background: linear-gradient(135deg, var(--accent), #5443f0);
    border: none; border-radius: 12px; color: #fff; font-size: 14px; font-weight: 700;
    cursor: pointer; white-space: nowrap; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex; align-items: center; gap: 10px;
    box-shadow: 0 4px 15px rgba(109, 93, 252, 0.3);
  }
  #btn-search:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(109, 93, 252, 0.4); opacity: 0.95; }
  #btn-search:active { transform: translateY(0) scale(.98); }
  #btn-search .spin { display: none; animation: spin .8s linear infinite; }
  #btn-search.loading .spin { display: inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Stats bar ── */
  #stats-bar { font-size: 13px; color: var(--muted); margin-bottom: 14px; min-height: 20px; }
  #stats-bar span { color: var(--accent); font-weight: 600; }

  /* ── Room grid ── */
  #room-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; }

  .room-card {
    background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
    overflow: hidden; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex; flex-direction: column;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  .room-card:hover { transform: translateY(-6px); border-color: rgba(109, 93, 252, 0.4); box-shadow: 0 12px 30px rgba(0,0,0,0.3), 0 0 15px var(--accent-glow); }

  .room-thumb {
    width: 100%; height: 180px; object-fit: cover; background: var(--card2);
    display: flex; align-items: center; justify-content: center; font-size: 44px;
    position: relative; overflow: hidden;
  }
  .room-thumb::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.4), transparent); }
  .room-thumb img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease; }
  .room-card:hover .room-thumb img { transform: scale(1.08); }

  .room-body { padding: 16px 20px; flex: 1; display: flex; flex-direction: column; gap: 10px; }
  .room-addr { font-size: 15px; font-weight: 600; line-height: 1.5; color: var(--text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 3rem; }
  .room-meta { display: flex; flex-wrap: wrap; gap: 8px; }
  .badge {
    padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: 700;
    border: 1px solid transparent; text-transform: uppercase; letter-spacing: 0.3px;
  }
  .badge-price { background: rgba(34, 185, 129, 0.1); border-color: rgba(34, 185, 129, 0.2); color: var(--accent2); }
  .badge-type  { background: rgba(109, 93, 252, 0.1); border-color: rgba(109, 93, 252, 0.2); color: #a78bfa; }
  .badge-dist  { background: rgba(255,255,255,.05); border-color: var(--border); color: var(--muted); }

  .room-time {
    font-size: 11px; color: var(--muted); margin-top: 4px;
    display: flex; align-items: center; gap: 6px;
  }

  .room-footer { 
    padding: 16px 20px; border-top: 1px solid var(--border);
    display: flex; gap: 10px;
  }
  .btn-send {
    flex: 2; padding: 10px; border-radius: 10px; font-size: 13px; font-weight: 700;
    border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
    background: linear-gradient(135deg, var(--accent), #5443f0); color: #fff;
    transition: all 0.2s;
  }
  .btn-gallery {
    flex: 1; padding: 10px; border-radius: 10px; font-size: 13px; font-weight: 700;
    border: 1px solid var(--border); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
    background: var(--card2); color: var(--text);
    text-decoration: none; transition: all 0.2s;
  }
  .btn-send:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 4px 12px var(--accent-glow); opacity: 0.9; }
  .btn-gallery:hover { background: var(--border); border-color: var(--muted); transform: translateY(-2px); }
  .btn-send:active, .btn-gallery:active { transform: translateY(0); }
  
  .btn-send:disabled { opacity: .45; cursor: not-allowed; filter: grayscale(1); }
  .btn-send.sending { background: linear-gradient(135deg, #f59e0b, #d97706); }
  .btn-send.done    { background: #334155; }
  .btn-send.error   { background: var(--red); }

  /* ── Empty state ── */
  #empty-state { text-align: center; padding: 72px 24px; color: var(--muted); display: none; }
  #empty-state .icon { font-size: 64px; margin-bottom: 16px; opacity: .5; }
  #empty-state p { font-size: 15px; }

  /* ── Toast ── */
  #toast {
    position: fixed; bottom: 28px; right: 28px; padding: 14px 20px; border-radius: 10px;
    font-size: 14px; font-weight: 500; z-index: 9999; max-width: 380px;
    pointer-events: none; opacity: 0; transition: opacity .3s;
    box-shadow: 0 8px 32px rgba(0,0,0,.4);
  }
  #toast.show { opacity: 1; }
  #toast.ok    { background: #16a34a; color: #fff; }
  #toast.err   { background: var(--red); color: #fff; }
  #toast.info  { background: var(--accent); color: #fff; }

  @media (max-width: 700px) {
    .filters { grid-template-columns: 1fr 1fr; }
    #btn-search { grid-column: 1/-1; }
    header { padding: 16px 20px; }
    header h1 { font-size: 18px; }
    #target-badge { display: none; }
    
    #batch-bar {
      bottom: 0; left: 0; transform: none; width: 100%; border-radius: 20px 20px 0 0;
      padding: 16px; flex-wrap: wrap; justify-content: center; gap: 10px;
    }
    #batch-bar span { width: 100%; text-align: center; margin-bottom: 5px; }
    #btn-batch-send, #btn-batch-task { flex: 1; min-width: 120px; }
  }

  /* ── Float button gửi SДТ ── */
  #fab-phone {
    position: fixed; bottom: 28px; left: 28px; z-index: 999;
    width: 56px; height: 56px; border-radius: 50%;
    background: linear-gradient(135deg, #ff6b6b, #ee5a24);
    border: none; cursor: pointer; color: #fff; font-size: 22px;
    box-shadow: 0 4px 20px rgba(238,90,36,.45);
    display: flex; align-items: center; justify-content: center;
    transition: transform .2s, box-shadow .2s;
  }
  #fab-phone:hover { transform: scale(1.1); box-shadow: 0 8px 28px rgba(238,90,36,.6); }

  /* ── Modal gửi SДТ ── */
  #phone-overlay {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,.6);
    z-index: 1000; backdrop-filter: blur(4px);
    align-items: center; justify-content: center;
  }
  #phone-overlay.open { display: flex; }
  #phone-modal {
    background: var(--card); border: 1px solid var(--border); border-radius: 18px;
    padding: 28px 32px; width: 100%; max-width: 480px;
    box-shadow: 0 24px 60px rgba(0,0,0,.6);
    animation: slideUp .25s ease;
  }
  @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  #phone-modal h2 { font-size: 18px; font-weight: 800; margin-bottom: 20px;
    background: linear-gradient(90deg, #ff8c6b, #ee5a24);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .pm-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 6px; }
  .pm-row { margin-bottom: 16px; }
  .pm-input {
    width: 100%; padding: 11px 14px; border-radius: 9px; font-size: 14px; font-family: inherit;
    background: var(--card2); border: 1px solid var(--border); color: var(--text); outline: none;
    transition: border-color .2s;
  }
  .pm-input:focus { border-color: #ff6b6b; }
  .pm-input-row { display: flex; gap: 8px; }
  .pm-input-row .pm-input { flex: 1; }
  #btn-lookup {
    padding: 11px 18px; border-radius: 9px; border: none; cursor: pointer;
    background: linear-gradient(135deg, var(--accent), #5a4fcf); color: #fff;
    font-size: 14px; font-weight: 700; white-space: nowrap;
    transition: opacity .2s;
  }
  #btn-lookup:hover { opacity: .88; }
  #phone-result {
    display: none; padding: 12px 16px; border-radius: 9px;
    background: var(--card2); border: 1px solid var(--border);
    margin-bottom: 16px; font-size: 13px;
  }
  #phone-result.ok  { border-color: rgba(34,197,94,.4); background: rgba(34,197,94,.08); }
  #phone-result.err { border-color: rgba(239,68,68,.4); background: rgba(239,68,68,.08); }
  .pr-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover;
    background: var(--card); border: 2px solid var(--border); margin-right: 10px; flex-shrink: 0; }
  #phone-result-content { display: flex; align-items: center; }
  .pr-info strong { color: var(--text); font-size: 14px; }
  .pr-info small { color: var(--muted); display: block; font-size: 11px; }
  #pm-textarea {
    width: 100%; min-height: 100px; padding: 11px 14px; border-radius: 9px; font-size: 14px;
    font-family: inherit; background: var(--card2); border: 1px solid var(--border);
    color: var(--text); outline: none; resize: vertical; transition: border-color .2s;
  }
  #pm-textarea:focus { border-color: #ff6b6b; }
  .pm-actions { display: flex; gap: 10px; margin-top: 4px; }
  #btn-pm-send {
    flex: 1; padding: 12px; border-radius: 9px; border: none; cursor: pointer;
    background: linear-gradient(135deg, #ff6b6b, #ee5a24); color: #fff;
    font-size: 14px; font-weight: 700; transition: opacity .2s;
  }
  #btn-pm-send:hover:not(:disabled) { opacity: .88; }
  #btn-pm-send:disabled { opacity: .4; cursor: not-allowed; }
  #btn-pm-close {
    padding: 12px 20px; border-radius: 9px; border: 1px solid var(--border);
    background: transparent; color: var(--muted); font-size: 14px; font-weight: 600;
    cursor: pointer; transition: background .2s;
  }
  #btn-pm-close:hover { background: var(--card2); }
</style>
</head>
<body>

<header>
  <div class="logo">🏠</div>
  <div>
    <h1>Tìm Phòng & Gửi Zalo</h1>
    <p>Tìm kiếm phòng trong hệ thống và gửi thông tin cho khách</p>
  </div>
  <div id="target-badge">
    <div id="target-dot"></div>
    <span id="target-label">Đang tìm Bích Hà...</span>
  </div>
</header>

<div class="wrapper">
  <!-- Filter bar -->
  <div class="filters">
    <div>
      <label>Quận / Huyện</label>
      <select id="sel-district">
        <option value="all">-- Tất cả --</option>
      </select>
    </div>
    <div>
      <label>Địa chỉ (từ khóa)</label>
      <input id="inp-addr" type="text" placeholder="Ví dụ: Triều Khúc, ngõ 27 Lâm Hạ..." />
    </div>
    <div>
      <label>Dạng phòng</label>
      <select id="sel-type">
        <option value="all">-- Tất cả --</option>
        <option value="studio">Studio</option>
        <option value="1n1b">1N1B (1 Ngủ 1 Bếp)</option>
        <option value="2n1k">2N1K (2 Ngủ 1 Khách)</option>
        <option value="1 ngủ">1 Ngủ (1PN)</option>
        <option value="2 ngủ">2 Ngủ (2PN)</option>
        <option value="gác xép">Gác xép / Duplex</option>
        <option value="vskk">VSKK (Khép kín)</option>
        <option value="vsc">VSC (Vệ sinh chung)</option>
        <option value="giường tầng">Giường tầng / Kí túc xá</option>
      </select>
    </div>
    <div>
      <label>Giá thuê</label>
      <input id="inp-price" type="text" placeholder="Ví dụ: 3tr-5tr, dưới 4tr..." />
    </div>
    <div>
      <button id="btn-search" onclick="doSearch()">
        <svg id="ico-search" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        Tìm kiếm
      </button>
    </div>
  </div>

  <div id="stats-bar">Nhấn Tìm kiếm để bắt đầu</div>
  
  <!-- Batch Bar -->
  <div id="batch-bar">
    <span>Đã chọn <mark id="batch-count" style="background:transparent;color:var(--accent)">0</mark> căn</span>
    <button id="btn-batch-send" onclick="sendBatchSelected()">🚀 Gửi Bích Hà</button>
    <button id="btn-batch-task" style="padding:8px 20px; background:linear-gradient(135deg, #7c6dff, #5a4fcf); border:none; border-radius:99px; color:#fff; font-weight:700; cursor:pointer; font-size:13px;" onclick="openTaskModalWithSelected()">📱 Gửi cho khách</button>
    <button id="btn-batch-clear" onclick="clearSelection()">Bỏ chọn</button>
  </div>

  <div id="room-grid"></div>
  <div id="empty-state">
    <div class="icon">🔍</div>
    <p>Không tìm thấy phòng phù hợp.<br/>Hãy thử điều chỉnh bộ lọc.</p>
  </div>
</div>

<!-- Floating button gửi Zalo theo SĐT -->
<button id="fab-phone" onclick="openPhoneModal()" title="Gửi Zalo theo SĐT">📱</button>

<!-- Modal gửi SĐT -->
<div id="phone-overlay" onclick="e => { if(e.target===this) closePhoneModal(); }">
  <div id="phone-modal">
    <h2>📱 Gửi Zalo theo Số Điện Thoại</h2>

    <div class="pm-row">
      <div class="pm-label">Số điện thoại</div>
      <div class="pm-input-row">
        <input id="pm-phone" class="pm-input" type="tel" placeholder="VD: 0912345678" />
        <button id="btn-lookup" onclick="lookupPhone()">🔎 Tra cứu</button>
      </div>
    </div>

    <div id="phone-result">
      <div id="phone-result-content"></div>
    </div>

    <div class="pm-row">
      <div class="pm-label">Nội dung tin nhắn</div>
      <textarea id="pm-textarea" class="pm-input" placeholder="Nhập tin nhắn muốn gửi..."></textarea>
    </div>

    <div class="pm-actions">
      <button id="btn-pm-close" onclick="closePhoneModal()">Hủy</button>
      <button id="btn-pm-send" onclick="sendToPhone()" disabled>
        📤 Gửi tin nhắn
      </button>
    </div>
  </div>
</div>

<div id="toast"></div>

<script>
// ── Load districts ──
async function loadDistricts() {
  try {
    const res = await fetch("/api/districts");
    const list = await res.json();
    const sel = document.getElementById("sel-district");
    list.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.key; opt.textContent = d.label;
      sel.appendChild(opt);
    });
  } catch(e) { console.error(e); }
}

// ── Check target status ──
async function checkTarget() {
  try {
    const r = await fetch("/api/target_status");
    const d = await r.json();
    const dot = document.getElementById("target-dot");
    const lbl = document.getElementById("target-label");
    if (d.found) {
      dot.classList.add("ok");
      lbl.textContent = `✓ ${d.name} (ID: ${d.id})`;
    } else {
      lbl.textContent = `Đang tìm ${d.name}...`;
      setTimeout(checkTarget, 5000);
    }
  } catch(e) { setTimeout(checkTarget, 5000); }
}

// ── Search ──
async function doSearch() {
  const btn = document.getElementById("btn-search");
  btn.classList.add("loading"); btn.disabled = true;
  
  const district = document.getElementById("sel-district").value;
  const addr     = document.getElementById("inp-addr").value;
  const price    = document.getElementById("inp-price").value;
  const type     = document.getElementById("sel-type").value;
  
  const params = new URLSearchParams({ district, addr, price, type });
  
  try {
    const res = await fetch("/api/rooms?" + params);
    const data = await res.json();
    renderRooms(data.rooms, data.total);
  } catch(e) {
    showToast("Lỗi kết nối server!", "err");
  } finally {
    btn.classList.remove("loading"); btn.disabled = false;
  }
}

// ── Multi-select management ──
let selectedRooms = []; // [{id, district_key}]

function toggleRoomSelection(rid, dkey, checked, element = null) {
  if (checked) {
    if (!selectedRooms.find(r => r.id === rid)) {
      selectedRooms.push({ id: rid, district_key: dkey });
    }
  } else {
    selectedRooms = selectedRooms.filter(r => r.id !== rid);
  }
  
  if (element) {
    const card = element.closest(".room-card");
    if (card) {
      if (checked) card.classList.add("selected");
      else card.classList.remove("selected");
      
      const cb = card.querySelector(".room-checkbox");
      if (cb) cb.checked = checked;
    }
  }
  updateBatchBar();
}

function updateBatchBar() {
  const bar = document.getElementById("batch-bar");
  const cnt = document.getElementById("batch-count");
  if (selectedRooms.length > 0) {
    bar.style.display = "flex";
    cnt.textContent = selectedRooms.length;
  } else {
    bar.style.display = "none";
  }
}

function clearSelection() {
  selectedRooms = [];
  document.querySelectorAll(".room-checkbox").forEach(cb => cb.checked = false);
  document.querySelectorAll(".room-card.selected").forEach(card => card.classList.remove("selected"));
  updateBatchBar();
}

async function sendBatchSelected() {
  if (selectedRooms.length === 0) return;
  const btn = document.getElementById("btn-batch-send");
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳ Đang gửi " + selectedRooms.length + " căn...";

  try {
    const res = await fetch("/api/send_batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: selectedRooms })
    });
    const d = await res.json();
    if (d.ok) {
      showToast(d.msg, "ok");
      clearSelection();
    } else {
      showToast(d.msg, "err");
    }
  } catch(e) {
    showToast("Lỗi kết nối server!", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

// ── Render rooms ──
function renderRooms(rooms, total) {
  const grid  = document.getElementById("room-grid");
  const empty = document.getElementById("empty-state");
  const stats = document.getElementById("stats-bar");
  
  grid.innerHTML = "";
  
  if (!rooms || rooms.length === 0) {
    empty.style.display = "block";
    stats.innerHTML = "Không tìm thấy phòng nào";
    return;
  }
  
  empty.style.display = "none";
  stats.innerHTML = `Tìm thấy <span>${total}</span> căn (mới nhất trước)${total > rooms.length ? ` · hiển thị ${rooms.length}` : ""}`;
  
  rooms.forEach(room => {
    const isSelected = selectedRooms.some(r => r.id === room.id);
    const card = document.createElement("div");
    card.className = "room-card" + (isSelected ? " selected" : "");
    
    // Đổ dữ liệu
    const typeStr  = (room.type && room.type !== "null") ? room.type : "";
    const distStr  = room.district_label || room.district_key || "";
    const postedAt = room.posted_at || "";
    const thumbUrl = room.thumb_url || "";
    const fullText = room.full_text || "";
    const photos   = room.all_photos || [];

    // Phần thumbnail: ảnh thật hoặc fallback icon
    const thumbHtml = thumbUrl
      ? `<div class="room-thumb"><img src="${escHtml(thumbUrl)}" alt="Ảnh phòng" loading="lazy" onerror="this.parentElement.innerHTML='<span>🏠</span>'" /></div>`
      : `<div class="room-thumb"><span>🏠</span></div>`;
    
    // Grid ảnh chi tiết
    let photosHtml = "";
    if (photos.length > 1) {
      photosHtml = `<div class="room-photo-grid">`;
      photos.forEach(p => {
        photosHtml += `<img src="${escHtml(p)}" onclick="window.open('${escHtml(p)}')" onerror="this.style.display='none'" />`;
      });
      photosHtml += `</div>`;
    }

    card.onclick = (e) => {
      // Đừng trigger tick nếu click vào nút, link hoặc ảnh gallery
      if (e.target.closest("button, a, .room-photo-grid img, input")) return;
      const cb = card.querySelector(".room-checkbox");
      const newState = !cb.checked;
      toggleRoomSelection(room.id, room.district_key, newState, cb);
    };

    card.innerHTML = `
      <div class="room-check-wrapper">
        <input type="checkbox" class="room-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleRoomSelection('${escHtml(room.id)}', '${escHtml(room.district_key)}', this.checked, this)">
      </div>
      ${thumbHtml}
      <div class="room-body">
        <div class="room-addr">${escHtml(room.address || "Chưa có địa chỉ")}</div>
        <div class="room-meta">
          <span class="badge badge-price">💰 ${escHtml(room.price || "Thỏa thuận")}</span>
          ${typeStr ? `<span class="badge badge-type">${escHtml(typeStr)}</span>` : ""}
          ${distStr ? `<span class="badge badge-dist">📍 ${escHtml(distStr)}</span>` : ""}
        </div>
        ${postedAt ? `<div class="room-time"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${escHtml(postedAt)}</div>` : ""}
        
        <div class="room-desc">${escHtml(fullText)}</div>
        ${photosHtml}
      </div>
      <div class="room-footer">
        <a href="/anh/${room.id}" target="_blank" class="btn-gallery">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
           Album
        </a>
        <button class="btn-send" onclick="sendRoom(this, '${escHtml(room.id)}', '${escHtml(room.district_key)}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"/></svg>
          Gửi Bích Hà
        </button>
      </div>
    `;
    
    grid.appendChild(card);
  });
  updateBatchBar();
}

// ── Send ──
async function sendRoom(btn, roomId, districtKey) {
  btn.disabled = true;
  btn.classList.add("sending");
  btn.innerHTML = `<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Đang gửi...`;
  
  try {
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: roomId, district_key: districtKey })
    });
    const d = await res.json();
    
    if (d.ok) {
      btn.classList.remove("sending"); btn.classList.add("done");
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Đã gửi!`;
      showToast("✅ " + d.msg, "ok");
    } else {
      btn.classList.remove("sending"); btn.classList.add("error"); btn.disabled = false;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Lỗi – Thử lại`;
      showToast("❌ " + d.msg, "err");
      setTimeout(() => {
        btn.classList.remove("error");
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"/></svg> Gửi cho Bích Hà`;
      }, 3000);
    }
  } catch(e) {
    btn.classList.remove("sending"); btn.disabled = false;
    btn.innerHTML = `⚡ Lỗi mạng – Thử lại`;
    showToast("❌ Lỗi kết nối!", "err");
  }
}

function showToast(msg, type="info") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "show " + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ""; }, 3500);
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

// Enter key search
document.addEventListener("DOMContentLoaded", () => {
  loadDistricts();
  checkTarget();
  document.getElementById("inp-addr").addEventListener("keydown", e => e.key === "Enter" && doSearch());
  document.getElementById("inp-price").addEventListener("keydown", e => e.key === "Enter" && doSearch());
  document.getElementById("pm-phone").addEventListener("keydown", e => e.key === "Enter" && lookupPhone());
});

// ── Phone Modal ──
let _pm_uid = null;

function openPhoneModal() {
  _pm_uid = null;
  document.getElementById("pm-phone").value = "";
  document.getElementById("pm-textarea").value = "";
  document.getElementById("phone-result").style.display = "none";
  document.getElementById("phone-result").className = "";
  document.getElementById("btn-pm-send").disabled = true;
  document.getElementById("phone-overlay").classList.add("open");
  setTimeout(() => document.getElementById("pm-phone").focus(), 100);
}

function closePhoneModal() {
  document.getElementById("phone-overlay").classList.remove("open");
}

// Đóng modal khi click ngoài
document.getElementById("phone-overlay").addEventListener("click", function(e) {
  if (e.target === this) closePhoneModal();
});

async function lookupPhone() {
  const phone = document.getElementById("pm-phone").value.trim();
  if (!phone) { showToast("Nhập số điện thoại trước!", "err"); return; }

  const btn = document.getElementById("btn-lookup");
  btn.disabled = true; btn.textContent = "Đang tra...";

  const resBox = document.getElementById("phone-result");
  const resCnt = document.getElementById("phone-result-content");
  resBox.style.display = "block";
  resBox.className = "";
  resCnt.innerHTML = "<span style='color:var(--muted)'>⏳ Đang tra cứu...</span>";

  try {
    const res = await fetch("/api/lookup_phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });
    const d = await res.json();

    if (d.ok) {
      _pm_uid = d.uid;
      resBox.className = "ok";
      const avatarHtml = d.avatar
        ? `<img class="pr-avatar" src="${escHtml(d.avatar)}" onerror="this.style.display='none'" />`
        : `<div class="pr-avatar" style="display:flex;align-items:center;justify-content:center;font-size:18px">👤</div>`;
      resCnt.innerHTML = `${avatarHtml}<div class="pr-info"><strong>✅ ${escHtml(d.name || "Không rõ tên")}</strong><small>Zalo ID: ${escHtml(d.uid)} · SĐT: ${escHtml(phone)}</small></div>`;
      document.getElementById("btn-pm-send").disabled = false;
      showToast(`✅ Tìm thấy: ${d.name || d.uid}`, "ok");
    } else {
      _pm_uid = null;
      resBox.className = "err";
      resCnt.innerHTML = `<span style="color:#ef4444">❌ ${escHtml(d.msg)}</span>`;
      document.getElementById("btn-pm-send").disabled = true;
    }
  } catch(e) {
    resBox.className = "err";
    resCnt.innerHTML = `<span style="color:#ef4444">❌ Lỗi kết nối server</span>`;
  } finally {
    btn.disabled = false; btn.textContent = "🔎 Tra cứu";
  }
}

async function sendToPhone() {
  if (!_pm_uid) { showToast("Tra cứu SĐT trước!", "err"); return; }
  const msg = document.getElementById("pm-textarea").value.trim();
  if (!msg) { showToast("Nhập nội dung tin nhắn!", "err"); return; }

  const btn = document.getElementById("btn-pm-send");
  btn.disabled = true; btn.textContent = "⏳ Đang gửi...";

  try {
    const res = await fetch("/api/send_to_phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: _pm_uid, message: msg })
    });
    const d = await res.json();
    if (d.ok) {
      showToast("✅ " + d.msg, "ok");
      btn.textContent = "✅ Đã gửi!";
      setTimeout(() => {
        btn.textContent = "📤 Gửi tin nhắn";
        btn.disabled = false;
      }, 3000);
    } else {
      showToast("❌ " + d.msg, "err");
      btn.textContent = "📤 Gửi tin nhắn";
      btn.disabled = false;
    }
  } catch(e) {
    showToast("❌ Lỗi kết nối!", "err");
    btn.textContent = "📤 Gửi tin nhắn";
    btn.disabled = false;
  }
}
</script>

<!-- ═══════════════════════════════ TASK MODAL CSS ═══════════════════════════ -->
<style>
  /* ── FAB Task button ── */
  #fab-task {
    position: fixed; bottom: 96px; left: 28px; z-index: 999;
    width: 56px; height: 56px; border-radius: 50%;
    background: linear-gradient(135deg, #7c6dff, #5a4fcf);
    border: none; cursor: pointer; color: #fff; font-size: 22px;
    box-shadow: 0 4px 20px rgba(124,109,255,.45);
    display: flex; align-items: center; justify-content: center;
    transition: transform .2s, box-shadow .2s;
  }
  #fab-task:hover { transform: scale(1.1); box-shadow: 0 8px 28px rgba(124,109,255,.6); }

  /* ── Task overlay / modal ── */
  #task-overlay {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,.65);
    z-index: 1001; backdrop-filter: blur(4px);
    align-items: center; justify-content: center;
  }
  #task-overlay.open { display: flex; }
  #task-modal {
    background: var(--card); border: 1px solid var(--border); border-radius: 18px;
    padding: 28px 32px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto;
    box-shadow: 0 24px 60px rgba(0,0,0,.65); animation: slideUp .25s ease;
  }
  #task-modal h2 { font-size: 18px; font-weight: 800; margin-bottom: 6px;
    background: linear-gradient(90deg, #a78bfa, #5ee7df);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  #task-modal .subtitle { font-size: 12px; color: var(--muted); margin-bottom: 20px; }
  .tm-section { margin-bottom: 18px; }
  .tm-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 6px; }
  .tm-input {
    width: 100%; padding: 10px 14px; border-radius: 9px; font-size: 14px; font-family: inherit;
    background: var(--card2); border: 1px solid var(--border); color: var(--text); outline: none;
    transition: border-color .2s;
  }
  .tm-input:focus { border-color: var(--accent); }
  .tm-row { display: flex; gap: 8px; }
  .tm-row .tm-input { flex: 1; }
  #btn-task-lookup {
    padding: 10px 16px; border-radius: 9px; border: none; cursor: pointer; white-space: nowrap;
    background: linear-gradient(135deg, #ff6b6b, #ee5a24); color: #fff;
    font-size: 13px; font-weight: 700; transition: opacity .2s;
  }
  #btn-task-lookup:hover { opacity: .88; }
  #task-user-result {
    display: none; padding: 10px 14px; border-radius: 9px; font-size: 13px;
    background: var(--card2); border: 1px solid var(--border); margin-bottom: 4px;
  }
  #task-user-result.ok  { border-color: rgba(34,197,94,.4); background: rgba(34,197,94,.08); }
  #task-user-result.err { border-color: rgba(239,68,68,.4);  background: rgba(239,68,68,.08); }

  .tm-filters { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .tm-select {
    width: 100%; padding: 10px 14px; border-radius: 9px; font-size: 14px; font-family: inherit;
    background: var(--card2); border: 1px solid var(--border); color: var(--text); outline: none;
  }
  .tm-actions { display: flex; gap: 10px; margin-top: 6px; }
  #btn-task-send {
    flex: 1; padding: 13px; border-radius: 9px; border: none; cursor: pointer;
    background: linear-gradient(135deg, var(--accent), #5a4fcf); color: #fff;
    font-size: 14px; font-weight: 700; transition: opacity .2s;
  }
  #btn-task-send:hover:not(:disabled) { opacity: .88; }
  #btn-task-send:disabled { opacity: .4; cursor: not-allowed; }
  #btn-task-close {
    padding: 13px 20px; border-radius: 9px; border: 1px solid var(--border);
    background: transparent; color: var(--muted); font-size: 14px; font-weight: 600; cursor: pointer;
  }
  #task-result-bar {
    margin-top: 12px; padding: 10px 14px; border-radius: 9px; font-size: 13px;
    display: none; text-align: center;
    background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.3); color: var(--green);
  }
  #task-result-bar.err { background: rgba(239,68,68,.1); border-color: rgba(239,68,68,.3); color: #ef4444; }
</style>

<!-- FAB Tạo Task -->
<button id="fab-task" onclick="openTaskModal()" title="Tạo Task gửi phòng">📋</button>

<!-- Task Modal -->
<div id="task-overlay">
  <div id="task-modal">
    <h2>📋 Tạo Task Gửi Phòng</h2>
    <p class="subtitle">Tra cứu SĐT khách → Tìm phòng → Gửi danh sách kèm hướng dẫn <code>/showanh</code></p>

    <!-- Bước 1: SĐT -->
    <div class="tm-section">
      <div class="tm-label">① Số điện thoại khách</div>
      <div class="tm-row">
        <input id="tm-phone" class="tm-input" type="tel" placeholder="VD: 0912345678" />
        <button id="btn-task-lookup" onclick="taskLookupPhone()">🔎 Tra cứu</button>
      </div>
      <div id="task-user-result"></div>
    </div>

    <!-- Bước 2: Bộ lọc phòng -->
    <div class="tm-section">
      <div class="tm-label">② Bộ lọc phòng</div>
      <div class="tm-filters">
        <div>
          <div class="tm-label" style="margin-top:8px">Quận/Huyện</div>
          <select id="tm-district" class="tm-select">
            <option value="all">-- Tất cả --</option>
          </select>
        </div>
        <div>
          <div class="tm-label" style="margin-top:8px">Giá thuê</div>
          <input id="tm-price" class="tm-input" type="text" placeholder="VD: 3tr-5tr, dưới 4tr..." />
        </div>
        <div>
          <div class="tm-label" style="margin-top:8px">Dạng phòng</div>
          <select id="tm-type" class="tm-select">
            <option value="all">-- Tất cả --</option>
            <option value="studio">Studio</option>
            <option value="1n1b">1N1B (1 Ngủ 1 Bếp)</option>
            <option value="2n1k">2N1K (2 Ngủ 1 Khách)</option>
            <option value="1 ngủ">1 Ngủ (1PN)</option>
            <option value="2 ngủ">2 Ngủ (2PN)</option>
            <option value="gác xép">Gác xép / Duplex</option>
            <option value="vskk">VSKK (Khép kín)</option>
            <option value="vsc">VSC (Vệ sinh chung)</option>
            <option value="giường tầng">Giường tầng / Kí túc xá</option>
          </select>
        </div>
      </div>
      <div style="margin-top:10px">
        <div class="tm-label">Địa chỉ (từ khóa)</div>
        <input id="tm-addr" class="tm-input" type="text" placeholder="VD: Triều Khúc, ngõ 27 Lâm Hạ..." />
      </div>
      <div style="margin-top:10px">
        <div class="tm-label">Lời giới thiệu (tùy chọn)</div>
        <input id="tm-intro" class="tm-input" type="text" placeholder="Để trống = tự động" />
      </div>
    </div>

    <div class="tm-actions">
      <button id="btn-task-close" onclick="closeTaskModal()">Hủy</button>
      <button id="btn-task-send" onclick="createTask()" disabled>🚀 Gửi danh sách phòng</button>
    </div>
    <div id="task-result-bar"></div>
  </div>
</div>

<script>
// ── Task Modal ──────────────────────────────────────────────────────────────
let _task_uid = null;

function openTaskModal() {
  _task_uid = null;
  // Reset selected rooms if opened normally? No, maybe keep them.
  _openTaskModalBase();
}

function openTaskModalWithSelected() {
  if (selectedRooms.length === 0) return;
  _openTaskModalBase();
  // Có thể ẩn bớt các bộ lọc nếu đã chọn tay? 
  document.getElementById("tm-district").disabled = true;
  document.getElementById("tm-price").disabled = true;
  document.getElementById("tm-type").disabled = true;
  document.getElementById("tm-addr").disabled = true;
  showToast("Đã nạp " + selectedRooms.length + " căn đã chọn!", "info");
}

function _openTaskModalBase() {
  _task_uid = null;
  document.getElementById("tm-phone").value = "";
  document.getElementById("tm-price").value = "";
  document.getElementById("tm-addr").value = "";
  document.getElementById("tm-intro").value = "";
  
  // Re-enable filters in case they were disabled
  document.getElementById("tm-district").disabled = false;
  document.getElementById("tm-price").disabled = false;
  document.getElementById("tm-type").disabled = false;
  document.getElementById("tm-addr").disabled = false;

  document.getElementById("task-user-result").style.display = "none";
  document.getElementById("task-user-result").className = "";
  document.getElementById("btn-task-send").disabled = true;
  document.getElementById("task-result-bar").style.display = "none";
  document.getElementById("task-overlay").classList.add("open");

  // Sync districts vào select task
  const src = document.getElementById("sel-district");
  const dst = document.getElementById("tm-district");
  dst.innerHTML = "<option value='all'>-- Tất cả --</option>";
  for (let i = 1; i < src.options.length; i++) {
    const o = document.createElement("option");
    o.value = src.options[i].value;
    o.textContent = src.options[i].textContent;
    dst.appendChild(o);
  }
  setTimeout(() => document.getElementById("tm-phone").focus(), 100);
}

function closeTaskModal() {
  document.getElementById("task-overlay").classList.remove("open");
}
document.getElementById("task-overlay").addEventListener("click", function(e) {
  if (e.target === this) closeTaskModal();
});

async function taskLookupPhone() {
  const phone = document.getElementById("tm-phone").value.trim();
  if (!phone) { showToast("Nhập số điện thoại trước!", "err"); return; }

  const btn = document.getElementById("btn-task-lookup");
  const res_box = document.getElementById("task-user-result");
  btn.disabled = true; btn.textContent = "Đang tra...";
  res_box.style.display = "block"; res_box.className = "";
  res_box.textContent = "⏳ Đang tra cứu...";

  try {
    const res = await fetch("/api/lookup_phone", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });
    const d = await res.json();
    if (d.ok) {
      _task_uid = d.uid;
      res_box.className = "ok";
      res_box.innerHTML = `✅ <strong>${escHtml(d.name || "Không rõ tên")}</strong> &nbsp;|&nbsp; ID: ${escHtml(d.uid)} &nbsp;|&nbsp; SĐT: ${escHtml(phone)}`;
      document.getElementById("btn-task-send").disabled = false;
      showToast("✅ Tìm thấy: " + (d.name || d.uid), "ok");
    } else {
      _task_uid = null;
      res_box.className = "err";
      res_box.innerHTML = `❌ ${escHtml(d.msg)}`;
      document.getElementById("btn-task-send").disabled = true;
    }
  } catch(e) {
    res_box.className = "err"; res_box.textContent = "❌ Lỗi kết nối server";
  } finally {
    btn.disabled = false; btn.textContent = "🔎 Tra cứu";
  }
}

async function createTask() {
  if (!_task_uid) { showToast("Tra cứu SĐT trước!", "err"); return; }

  const btn = document.getElementById("btn-task-send");
  const bar = document.getElementById("task-result-bar");
  btn.disabled = true; btn.textContent = "⏳ Đang tìm và gửi...";
  bar.style.display = "none";

  const payload = {
    uid:        _task_uid,
    district:   document.getElementById("tm-district").value,
    addr:       document.getElementById("tm-addr").value.trim(),
    price:      document.getElementById("tm-price").value.trim(),
    type:       document.getElementById("tm-type").value,
    intro:      document.getElementById("tm-intro").value.trim(),
    room_items: selectedRooms // Thêm danh sách chọn tay
  };

  try {
    const res = await fetch("/api/create_task", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const d = await res.json();
    bar.style.display = "block";
    if (d.ok) {
      bar.className = "";
      bar.innerHTML = `✅ ${escHtml(d.msg)} &nbsp;(tổng ${d.total} phòng, đã gửi ${d.count})`;
      showToast("✅ " + d.msg, "ok");
      btn.textContent = "✅ Đã gửi!";
      setTimeout(() => { btn.textContent = "🚀 Gửi danh sách phòng"; btn.disabled = false; }, 4000);
    } else {
      bar.className = "err";
      bar.textContent = "❌ " + d.msg;
      showToast("❌ " + d.msg, "err");
      btn.textContent = "🚀 Gửi danh sách phòng"; btn.disabled = false;
    }
  } catch(e) {
    bar.style.display = "block"; bar.className = "err"; bar.textContent = "❌ Lỗi kết nối server";
    btn.textContent = "🚀 Gửi danh sách phòng"; btn.disabled = false;
  }
}
</script>
</body>
</html>
"""

# ── Chat Page Routes ──────────────────────────────────────────────────────────

@app.route("/chat")
def chat_page():
    return render_template_string(CHAT_HTML_TEMPLATE)

@app.route("/api/chat/conversations")
def api_chat_conversations():
    with _chat_log_lock:
        # Trả về danh sách user, sắp xếp theo tin nhắn mới nhất
        conversations = []
        for uid, data in _chat_log.items():
            last_msg = data["messages"][-1] if data["messages"] else {"text": "", "ts": 0}
            conversations.append({
                "uid": uid,
                "name": data["name"],
                "avatar": data["avatar"],
                "last_text": last_msg["text"],
                "last_ts": last_msg["ts"]
            })
    conversations.sort(key=lambda x: x["last_ts"], reverse=True)
    return jsonify(conversations)

@app.route("/api/chat/messages/<uid>")
def api_chat_messages(uid):
    uid = str(uid)
    with _chat_log_lock:
        data = _chat_log.get(uid, {"name": uid, "messages": []})
    return jsonify(data)

@app.route("/api/chat/send", methods=["POST"])
def api_chat_send():
    data = request.json
    uid = str(data.get("uid"))
    text = data.get("text", "").strip()
    
    if not uid or not text:
        return jsonify({"ok": False, "msg": "Thiếu dữ liệu"})
        
    bot = get_bot()
    if not bot:
        return jsonify({"ok": False, "msg": "Bot chưa sẵn sàng"})
        
    try:
        bot.send(Message(text=text), uid, ThreadType.USER)
        # Log vào history
        chat_log_add(uid, "", "bot", text)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "msg": str(e)})

@app.route("/api/chat/set_name", methods=["POST"])
def api_chat_set_name():
    data = request.json
    uid = str(data.get("uid"))
    new_name = data.get("name", "").strip()
    
    if not uid or not new_name:
        return jsonify({"ok": False, "msg": "Thiếu dữ liệu"})
        
    global _chat_log
    with _chat_log_lock:
        if uid in _chat_log:
            _chat_log[uid]["name"] = new_name
            threading.Thread(target=_save_chat_log_bg, daemon=True).start()
            return jsonify({"ok": True})
    return jsonify({"ok": False, "msg": "Không tìm thấy user"})

# ── Gallery Page: /anh/<room_id> ──────────────────────────────────────────────

@app.route("/anh/<room_id>")
def gallery_page(room_id):
    room_id = str(room_id)
    room_full = None
    
    # Tìm trong districts_full để lấy media
    if os.path.exists(DISTRICTS_FULL):
        for fname in os.listdir(DISTRICTS_FULL):
            if not fname.endswith(".json"): continue
            try:
                with open(os.path.join(DISTRICTS_FULL, fname), "r", encoding="utf-8") as f:
                    for r in json.load(f):
                        if str(r.get("id", "")) == room_id:
                            room_full = r
                            break
            except: pass
            if room_full: break
            
    if not room_full:
        return f"<h3>Không tìm thấy dữ liệu ảnh cho phòng ID: {room_id}</h3>", 404

    return render_template_string(GALLERY_HTML_TEMPLATE, room=room_full)

GALLERY_HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Album Ảnh - Phòng {{ room.id }}</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Inter:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #05060f;
      --card: rgba(255, 255, 255, 0.03);
      --glass: rgba(20, 21, 35, 0.7);
      --accent: #7c6dff;
      --accent-glow: rgba(124, 109, 255, 0.3);
      --text: #f1f1f1;
      --text-muted: #a0a0ba;
      --gold: #f9d423;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: 'Inter', sans-serif; 
      background-color: var(--bg); 
      background-image: 
        radial-gradient(circle at 20% 20%, rgba(124, 109, 255, 0.05) 0%, transparent 40%),
        radial-gradient(circle at 80% 80%, rgba(94, 231, 223, 0.05) 0%, transparent 40%);
      color: var(--text); 
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Header */
    .header {
      position: sticky; top: 0; z-index: 100;
      background: var(--glass);
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding: 24px 32px;
      display: flex; justify-content: space-between; align-items: center;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .header-info h1 {
      font-family: 'Outfit', sans-serif; font-size: 1.6rem; font-weight: 800;
      margin-bottom: 4px; letter-spacing: -0.5px;
      background: linear-gradient(90deg, #fff, #a0a0ba);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .header-info p { font-size: 0.95rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }
    .header-price { 
      font-family: 'Outfit', sans-serif; font-size: 1.5rem; font-weight: 700; color: var(--gold);
      padding: 8px 20px; border-radius: 12px; background: rgba(249, 212, 35, 0.1);
      border: 1px solid rgba(249, 212, 35, 0.2);
    }

    .container { max-width: 1400px; margin: 40px auto; padding: 0 32px; }

    /* Media Grid */
    .media-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 24px;
      animation: fadeIn 0.8s ease-out;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

    .media-card {
      background: var(--card);
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      overflow: hidden;
      aspect-ratio: 4/3;
      position: relative;
      cursor: zoom-in;
      transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
    }
    .media-card:hover {
      transform: translateY(-8px) scale(1.02);
      border-color: var(--accent);
      box-shadow: 0 20px 40px rgba(0,0,0,0.4), 0 0 20px var(--accent-glow);
    }
    .media-card img, .media-card video {
      width: 100%; height: 100%; object-fit: cover;
      transition: transform 0.6s ease;
    }
    .media-card:hover img { transform: scale(1.08); }
    
    .media-type-badge {
      position: absolute; top: 16px; right: 16px;
      background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
      padding: 6px 14px; border-radius: 10px; font-size: 0.75rem; font-weight: 700;
      color: #fff; z-index: 2; border: 1px solid rgba(255,255,255,0.1);
    }

    /* Video controls override */
    video::-webkit-media-controls { background-color: rgba(0,0,0,0.5); }

    /* Description */
    .description-box {
      margin-top: 60px;
      background: linear-gradient(135deg, rgba(124, 109, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 24px;
      padding: 40px;
      position: relative; overflow: hidden;
    }
    .description-box::before {
      content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%;
      background: var(--accent); box-shadow: 0 0 15px var(--accent-glow);
    }
    .description-box h2 {
      font-family: 'Outfit', sans-serif; font-size: 1.4rem; font-weight: 700;
      margin-bottom: 20px; color: var(--accent);
    }
    .description-content {
      font-size: 1.05rem; line-height: 1.8; color: var(--text-muted);
      white-space: pre-wrap; word-break: break-word;
    }

    .back-btn {
      margin-top: 40px; display: inline-flex; align-items: center; gap: 10px;
      background: transparent; border: 1px solid rgba(255,255,255,0.1);
      color: var(--text); padding: 12px 24px; border-radius: 12px;
      font-weight: 600; cursor: pointer; transition: all 0.2s; text-decoration: none;
    }
    .back-btn:hover { background: rgba(255,255,255,0.05); border-color: var(--text); }

    @media (max-width: 768px) {
      .header { padding: 16px 20px; flex-direction: column; align-items: flex-start; gap: 16px; }
      .header-price { width: 100%; text-align: center; }
      .container { padding: 0 20px; }
      .media-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-info">
      <h1>📍 {{ room.address }}</h1>
      <p>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        Phòng ID: {{ room.id }}
      </p>
    </div>
    <div class="header-price">
      {{ room.price }}
    </div>
  </header>

  <main class="container">
    <div class="media-grid">
      {% for vid in room.videos %}
        <div class="media-card" onclick="this.querySelector('video').play()">
          <span class="media-type-badge">VIDEO</span>
          <video controls preload="metadata">
            <source src="{{ vid.url }}" type="video/mp4">
          </video>
        </div>
      {% endfor %}
      
      {% for photo in room.photos %}
        <div class="media-card" onclick="window.open('{{ photo.url or photo.hd or photo.href }}')">
          <span class="media-type-badge">IMG</span>
          <img src="{{ photo.url or photo.hd or photo.href }}" loading="lazy" alt="Phòng {{ room.id }}">
        </div>
      {% endfor %}
    </div>

    {% if room.text %}
    <section class="description-box">
      <h2>Mô tả chi tiết</h2>
      <div class="description-content">{{ room.text }}</div>
    </section>
    {% endif %}

    <a href="/" class="back-btn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
      Quay lại trang chủ
    </a>
  </main>
</body>
</html>
"""

# ── Chat HTML Template ────────────────────────────────────────────────────────

CHAT_HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zalo Chat Manager</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #0084ff;
      --bg: #f0f2f5;
      --sidebar-w: 320px;
      --border: #e4e6eb;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: var(--bg); height: 100vh; display: flex; overflow: hidden; }
    
    /* Sidebar */
    .sidebar {
      width: var(--sidebar-w);
      background: #fff;
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
    }
    .sidebar-header {
      padding: 20px;
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      font-size: 1.2rem;
      color: #1c1e21;
    }
    .conv-list { flex: 1; overflow-y: auto; }
    .conv-item {
      padding: 12px 16px;
      display: flex;
      align-items: center;
      cursor: pointer;
      transition: background 0.2s;
      border-bottom: 1px solid #f9f9f9;
    }
    .conv-item:hover { background: #f5f6f7; }
    .conv-item.active { background: #e7f3ff; }
    .conv-avatar {
      width: 48px; height: 48px;
      border-radius: 50%;
      background: #e4e6eb;
      margin-right: 12px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 600; color: #65676b;
      flex-shrink: 0; overflow: hidden;
    }
    .conv-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .conv-info { flex: 1; min-width: 0; }
    .conv-name { font-weight: 600; font-size: 0.95rem; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .conv-last { font-size: 0.85rem; color: #65676b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    
    /* Main Chat */
    .main-chat { flex: 1; display: flex; flex-direction: column; background: #fff; position: relative; }
    .chat-header {
      padding: 12px 20px;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center;
      background: #fff; z-index: 10;
    }
    .chat-header-info { margin-left: 12px; }
    .chat-header-name { font-weight: 600; font-size: 1rem; }
    .chat-header-status { font-size: 0.8rem; color: #45bd62; }
    
    .messages-container {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      background: #f0f2f5;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .msg-bubble {
      max-width: 70%;
      padding: 10px 14px;
      border-radius: 18px;
      font-size: 0.95rem;
      line-height: 1.4;
      position: relative;
      word-wrap: break-word;
    }
    .msg-user {
      align-self: flex-start;
      background: #fff;
      color: #050505;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }
    .msg-bot {
      align-self: flex-end;
      background: var(--primary);
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .msg-time {
      font-size: 0.7rem;
      margin-top: 4px;
      opacity: 0.7;
      display: block;
    }
    .msg-bot .msg-time { text-align: right; }
    
    /* Input Area */
    .chat-input-area {
      padding: 16px 20px;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: flex-end;
      gap: 12px;
    }
    #chat-input {
      flex: 1;
      border: 1px solid var(--border);
      background: #f0f2f5;
      border-radius: 20px;
      padding: 10px 16px;
      font-family: inherit;
      font-size: 0.95rem;
      outline: none;
      max-height: 150px;
      resize: none;
    }
    #chat-input:focus { border-color: var(--primary); background: #fff; }
    .btn-send-chat {
      background: var(--primary);
      color: #fff;
      border: none;
      width: 40px; height: 40px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: transform 0.1s;
      flex-shrink: 0;
    }
    .btn-send-chat:active { transform: scale(0.9); }
    .btn-send-chat svg { width: 20px; height: 20px; }
    
    /* Empty State */
    .empty-chat {
      flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
      color: #65676b; text-align: center;
    }
    .empty-chat svg { width: 80px; height: 80px; margin-bottom: 16px; opacity: 0.2; }
    
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-thumb { background: #bcc0c4; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="sidebar">
    <div class="sidebar-header">Đoạn chat</div>
    <div class="conv-list" id="conv-list">
      <!-- Conversations loaded here -->
    </div>
  </div>
  
  <div class="main-chat" id="main-chat">
    <div class="empty-chat" id="empty-chat">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 1.821.487 3.53 1.338 5L2 22l5-1.338c1.47.851 3.179 1.338 5 1.338 5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18c-1.477 0-2.864-.386-4.066-1.06L5.594 19.53l.589-2.34-1.06-4.066C4.386 11.864 4 10.477 4 9c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"/></svg>
      <p>Chọn một cuộc trò chuyện để bắt đầu</p>
    </div>
    
    <div id="active-chat-box" style="display: none; height: 100%; flex-direction: column;">
      <div class="chat-header">
        <div class="conv-avatar" id="header-avatar"></div>
        <div class="chat-header-info">
          <div class="chat-header-name" id="header-name" onclick="renameUser()" style="cursor: pointer;" title="Click để đổi tên">Tên khách</div>
          <div class="chat-header-status">Đang hoạt động</div>
        </div>
      </div>
      
      <div class="messages-container" id="msg-container">
        <!-- Messages loaded here -->
      </div>
      
      <div class="chat-input-area">
        <textarea id="chat-input" placeholder="Nhập tin nhắn..." rows="1"></textarea>
        <button class="btn-send-chat" id="btn-send" onclick="sendMsg()">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"/></svg>
        </button>
      </div>
    </div>
  </div>

  <script>
    let currentUid = null;
    let lastMsgCount = 0;

    async function loadConversations() {
      const res = await fetch("/api/chat/conversations");
      const list = await res.json();
      const container = document.getElementById("conv-list");
      
      container.innerHTML = "";
      list.forEach(c => {
        const item = document.createElement("div");
        item.className = `conv-item ${c.uid === currentUid ? 'active' : ''}`;
        item.onclick = () => selectConv(c.uid, c.name, c.avatar);
        
        const avatarChar = c.name ? c.name.charAt(0).toUpperCase() : '?';
        const avatarHtml = c.avatar 
          ? `<img src="${c.avatar}" />` 
          : `<span>${avatarChar}</span>`;
          
        item.innerHTML = `
          <div class="conv-avatar">${avatarHtml}</div>
          <div class="conv-info">
            <div class="conv-name">${c.name}</div>
            <div class="conv-last">${c.last_text || '(Tin nhắn tệp/ảnh)'}</div>
          </div>
        `;
        container.appendChild(item);
      });
    }

    async function renameUser() {
      if (!currentUid) return;
      const oldName = document.getElementById("header-name").textContent;
      const newName = prompt("Nhập tên mới cho khách này:", oldName);
      if (newName && newName.trim() && newName !== oldName) {
        const res = await fetch("/api/chat/set_name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: currentUid, name: newName.trim() })
        });
        const d = await res.json();
        if (d.ok) {
          document.getElementById("header-name").textContent = newName.trim();
          loadConversations();
        }
      }
    }

    async function selectConv(uid, name, avatar) {
      currentUid = uid;
      document.getElementById("empty-chat").style.display = "none";
      document.getElementById("active-chat-box").style.display = "flex";
      
      const avatarChar = name ? name.charAt(0).toUpperCase() : '?';
      document.getElementById("header-avatar").innerHTML = avatar ? `<img src="${avatar}" />` : `<span>${avatarChar}</span>`;
      document.getElementById("header-name").textContent = name;
      
      loadMessages();
      loadConversations(); // update active state
    }

    async function loadMessages() {
      if (!currentUid) return;
      const res = await fetch(`/api/chat/messages/${currentUid}`);
      const data = await res.json();
      const container = document.getElementById("msg-container");
      
      if (data.messages.length === lastMsgCount && lastMsgCount > 0) return;
      
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
      
      container.innerHTML = "";
      data.messages.forEach(m => {
        const bubble = document.createElement("div");
        bubble.className = `msg-bubble msg-${m.role}`;
        
        const timeStr = new Date(m.ts * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        bubble.innerHTML = `
          <div class="msg-text">${m.text.replace(/\\n/g, '<br>')}</div>
          <span class="msg-time">${timeStr}</span>
        `;
        container.appendChild(bubble);
      });
      
      lastMsgCount = data.messages.length;
      if (isAtBottom) container.scrollTop = container.scrollHeight;
    }

    async function sendMsg() {
      const input = document.getElementById("chat-input");
      const text = input.value.trim();
      if (!text || !currentUid) return;
      
      input.value = "";
      input.style.height = "auto";
      
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: currentUid, text: text })
      });
      
      const d = await res.json();
      if (d.ok) {
        loadMessages();
      } else {
        alert("Lỗi: " + d.msg);
      }
    }

    // Enter to send
    document.getElementById("chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMsg();
      }
    });

    // Auto refresh
    setInterval(loadConversations, 5000);
    setInterval(loadMessages, 3000);
    
    loadConversations();
  </script>
</body>
</html>
"""

if __name__ == "__main__":
    def run_port_8000():
        print("📸 Khởi động Gallery Port (8000)...")
        app.run(host="0.0.0.0", port=8000, debug=False, threaded=True)

    # Chạy port 8000 trong thread riêng
    threading.Thread(target=run_port_8000, daemon=True).start()

    print("🚀 Khởi động Web Phòng Chính (5050)...")
    print("   → http://localhost:5050")
    print("   → Gallery public: http://163.227.230.41:8000/anh/<id>")
    
    # Chạy port chính 5050 ở main thread
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)


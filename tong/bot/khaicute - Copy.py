"""
Bot forward 1:1 với group layout cho ảnh/video
- Đọc config từ khai.txt: iddauvao|iddaura
- Forward nguyên bản tin nhắn từ đầu vào → đầu ra
- Gom ảnh/video theo user trong khoảng thời gian rồi gửi gộp
"""

import os
import time
import json
import threading
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

from config import API_KEY, SECRET_KEY, IMEISUP, COOKIESUP
from zlapi import ZaloAPI
from zlapi.models import Message, ThreadType
from colorama import Fore, Style, init

init(autoreset=True)

CONFIG_FILE = "khai.txt"


class NTKBot(ZaloAPI):
    def __init__(self, api_key, secret_key, imei, session_cookies):
        super().__init__(api_key, secret_key, imei=imei, session_cookies=session_cookies)
        
        # Flag để kiểm tra bot có đang chạy không
        self.is_running = True
        
        # OpenRouter API Config
        self.openrouter_api_key = "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"
        self.openrouter_api_url = "https://openrouter.ai/api/v1/chat/completions"
        self.training_file = "training_prompt.txt"
        self.system_prompt = self._load_training_data()
        
        # Conversation history cho từng user
        # Format: {user_id: [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
        self.conversation_histories = {}
        self.max_history_length = 10  # Giữ tối đa 10 tin nhắn gần nhất (5 cặp hỏi-đáp)
        self.conversation_last_active = {}  # Track last activity for cleanup
        
        # Room Inquiry System
        self.idphong_file = "idphong.txt"
        self.room_owner_map = {}  # {room_code: owner_zalo_id}
        self._load_room_owners()
        
        # Inquiry sessions: {user_id: {"other_id": ..., "room_code": ..., "role": "customer"/"owner"}}
        self.inquiry_sessions = {}
        
        # Full conversation history for inquiries (NO LIMIT)
        # {"customer_id_owner_id": [{"from": "customer"/"owner", "message": ..., "timestamp": ...}]}
        self.inquiry_conversations = {}
        self.max_inquiry_messages = 50  # Limit per conversation to prevent memory leak

        
        # Mapping: input_id -> output_id
        self.routing_map = {}
        self._load_config()
        
        # Buffer để gom ảnh/video theo (source_id, author_id)
        # { (source_id, author_id): {
        #     "photos": [{url, width, height, id_in_group, timestamp}],
        #     "videos": [{url, thumb, duration, width, height, timestamp}],
        #     "dest_id": str,
        #     "last_update": float,
        #     "timer": Timer
        # } }
        self.media_buffers = {}
        self.buffer_lock = threading.Lock()
        self.buffer_timeout = 3.0  # 3 giây timeout để gom ảnh
        
        # Thread pool để tải ảnh song song
        self.executor = ThreadPoolExecutor(max_workers=10)
        
        # Heartbeat - theo dõi tin nhắn cuối
        self.last_message_time = time.time()
        self.heartbeat_thread = None
        self._start_heartbeat()
        self._start_auto_cleanup()  # Auto cleanup old data
        
        # Uptime tracking
        self.start_time = time.time()
        self.uptime_target_id = None
        self.uptime_timer = None
        
        # Tự động tìm nhóm khaicute để gửi uptime
        threading.Thread(target=self._auto_find_khaicute_group, daemon=True).start()
    
    def _auto_find_khaicute_group(self):
        """Tự động tìm ID của nhóm mang tên 'khaicute'"""
        print("[UPTIME] Đang tìm kiếm nhóm 'khaicute'...")
        time.sleep(5) # Đợi bot ổn định kết nối
        try:
            all_groups = self.fetchAllGroups()
            if not all_groups or not hasattr(all_groups, "gridVerMap"):
                print("[UPTIME] ❌ Không thể lấy danh sách nhóm")
                return
            
            grid_info = getattr(all_groups, "gridInfoMap", {})
            if grid_info and isinstance(grid_info, dict):
                for gid, info in grid_info.items():
                    if not info: continue
                    name = info.get("name", "")
                    if "khaicute" in name.lower():
                        print(f"[UPTIME] ✓ Đã tìm thấy nhóm '{name}' (ID: {gid})")
                        self._start_uptime_notifications(str(gid))
                        return
            
            # Nếu fetchAllGroups không đủ info, thử fetch thêm
            group_ids = list(all_groups.gridVerMap.keys())
            print(f"[UPTIME] Tìm kiếm trong {len(group_ids)} nhóm...")
            chunk_size = 50
            for i in range(0, len(group_ids), chunk_size):
                chunk = group_ids[i:i+chunk_size]
                try:
                    batch = {str(gid): 0 for gid in chunk}
                    res = self.fetchGroupInfo(batch)
                    if res and hasattr(res, "gridInfoMap"):
                        g_info = getattr(res, "gridInfoMap", {})
                        if g_info and isinstance(g_info, dict):
                            for gid, info in g_info.items():
                                if not info: continue
                                name = info.get("name", "")
                                if "khaicute" in name.lower():
                                    print(f"[UPTIME] ✓ Đã tìm thấy nhóm '{name}' (ID: {gid})")
                                    self._start_uptime_notifications(str(gid))
                                    return
                except Exception as e:
                    print(f"[UPTIME] Lỗi batch {i}: {e}")
                    continue
                    
            print("[UPTIME] ❌ Không tìm thấy nhóm nào có tên 'khaicute'")
        except Exception as e:
            print(f"[UPTIME] Lỗi khi tự động tìm nhóm: {e}")
    
    def _cleanup(self):
        """Dọn dẹp tài nguyên trước khi dừng bot"""
        print("[CLEANUP] Bắt đầu dọn dẹp tài nguyên...")
        
        # Cancel tất cả timers trong buffers
        with self.buffer_lock:
            for buffer_key, buffer in list(self.media_buffers.items()):
                timer = buffer.get("timer")
                if timer:
                    try:
                        timer.cancel()
                        print(f"[CLEANUP] Đã cancel timer cho buffer {buffer_key}")
                    except Exception as e:
                        print(f"[CLEANUP] Lỗi cancel timer: {e}")
            
            # Clear buffers
            self.media_buffers.clear()
            print("[CLEANUP] Đã xóa tất cả buffers")
        
        # Shutdown executor
        if self.executor:
            try:
                print("[CLEANUP] Đang shutdown ThreadPoolExecutor...")
                self.executor.shutdown(wait=False)
                print("[CLEANUP] Đã shutdown ThreadPoolExecutor")
            except Exception as e:
                print(f"[CLEANUP] Lỗi shutdown executor: {e}")
        
        # Cancel uptime timer
        if self.uptime_timer:
            try:
                self.uptime_timer.cancel()
                print("[CLEANUP] Đã cancel uptime timer")
            except Exception as e:
                print(f"[CLEANUP] Lỗi cancel uptime timer: {e}")
        
        print("[CLEANUP] Hoàn tất dọn dẹp")
    
    def _send_uptime_notification(self):
        """Gửi thông báo uptime và đặt lịch gửi tiếp theo"""
        if not self.is_running or not self.uptime_target_id:
            return
        
        try:
            # Tính uptime
            uptime_seconds = int(time.time() - self.start_time)
            hours = uptime_seconds // 3600
            minutes = (uptime_seconds % 3600) // 60
            
            # Format message
            if hours > 0:
                uptime_msg = f"🤖 Bot đã chạy được {hours} giờ {minutes} phút"
            else:
                uptime_msg = f"🤖 Bot đã chạy được {minutes} phút"
            
            # Gửi tin nhắn
            self.send(Message(text=uptime_msg), self.uptime_target_id, ThreadType.GROUP)
            print(f"[UPTIME] Đã gửi: {uptime_msg} → {self.uptime_target_id}")
            
        except Exception as e:
            print(f"[UPTIME] Lỗi gửi thông báo: {e}")
        
        # Đặt lịch gửi tiếp theo sau 5 phút
        if self.is_running and self.uptime_target_id:
            self.uptime_timer = threading.Timer(300, self._send_uptime_notification)  # 300s = 5 phút
            self.uptime_timer.start()
            print(f"[UPTIME] Đã đặt lịch gửi tiếp theo sau 5 phút")
    
    def _start_uptime_notifications(self, target_id):
        """Bắt đầu gửi thông báo uptime định kỳ"""
        # Cancel timer cũ nếu có
        if self.uptime_timer:
            try:
                self.uptime_timer.cancel()
                print("[UPTIME] Đã cancel timer cũ")
            except:
                pass
        
        # Lưu target ID
        self.uptime_target_id = target_id
        print(f"[UPTIME] Đã set target ID: {target_id}")
        
        # Bắt đầu timer mới - gửi lần đầu sau 5 phút
        self.uptime_timer = threading.Timer(300, self._send_uptime_notification)
        self.uptime_timer.start()
        print("[UPTIME] Đã khởi động uptime timer (gửi sau 5 phút)")
    
    def _start_heartbeat(self):
        """
        Khởi động thread heartbeat (Watchdog):
        - Check mỗi 60 giây
        - Nếu quá 1 giờ (3600s) không có tin nhắn mới -> Restart bot
        - Check kêt nối Zalo chủ động mỗi 30 phút
        - Tự động restart sau mỗi 12 giờ để làm mới session
        """
        def heartbeat_worker():
            print(f"[HEARTBEAT] Watchdog started.")
            last_health_check = time.time()
            start_time = time.time()
            
            while self.is_running:
                try:
                    time.sleep(60)
                    
                    if not self.is_running:
                        break
                    
                    current_time = time.time()
                    time_since_last = current_time - self.last_message_time
                    
                    # 1. Nếu quá 12 giờ -> Restart định kỳ
                    if current_time - start_time > 43200:
                        print(f"{Fore.CYAN}[HEARTBEAT] 🕒 Đã chạy 12 giờ. Restart định kỳ để làm mới session...{Style.RESET_ALL}")
                        self.is_running = False
                        break

                    # 2. Nếu quá 1 giờ không có tin nhắn -> Restart
                    if time_since_last > 3600:
                        print(f"{Fore.YELLOW}[HEARTBEAT] ⚠️ Quá 1 giờ không có tin nhắn mới. Restarting...{Style.RESET_ALL}")
                        self.is_running = False
                        break
                    
                    # 3. Check kết nối chủ động mỗi 30 phút
                    if current_time - last_health_check > 1800:
                        last_health_check = current_time
                        try:
                            # print("[HEARTBEAT] 🔍 Kiểm tra kết nối Zalo...")
                            self.getSelfInfo() # Gọi API để test socket
                        except Exception as e:
                            print(f"{Fore.RED}[HEARTBEAT] ❌ Không thể gọi API Zalo ({e}). Restarting...{Style.RESET_ALL}")
                            self.is_running = False
                            break
                    
                    # Log mỗi 30 phút
                    if int(current_time) % 1800 < 60:
                        print(f"[HEARTBEAT] ✓ Bot hoạt động bình thường (tin cuối: {int(time_since_last)}s trước)")
                        
                except Exception as e:
                    print(f"[HEARTBEAT] Lỗi watchdog: {e}")
            
            print(f"[HEARTBEAT] Watchdog thread kết thúc")
        
        self.heartbeat_thread = threading.Thread(target=heartbeat_worker, daemon=True, name="Heartbeat")
        self.heartbeat_thread.start()
    
    def _start_auto_cleanup(self):
        """Auto cleanup old data to prevent memory leaks"""
        def cleanup_worker():
            while self.is_running:
                try:
                    time.sleep(3600)  # Run every 1 hour
                    
                    if not self.is_running:
                        break
                    
                    current_time = time.time()
                    
                    # Cleanup old conversation histories (inactive > 24h)
                    if hasattr(self, 'conversation_last_active'):
                        to_remove = []
                        for user_id, last_active in self.conversation_last_active.items():
                            if current_time - last_active > 86400:  # 24 hours
                                to_remove.append(user_id)
                        
                        for user_id in to_remove:
                            if user_id in self.conversation_histories:
                                del self.conversation_histories[user_id]
                            del self.conversation_last_active[user_id]
                        
                        if to_remove:
                            print(f"[CLEANUP] Removed {len(to_remove)} old conversation histories")
                    
                    # Limit inquiry conversations
                    if hasattr(self, 'max_inquiry_messages'):
                        for conv_key, messages in self.inquiry_conversations.items():
                            if len(messages) > self.max_inquiry_messages:
                                # Keep only last N messages
                                self.inquiry_conversations[conv_key] = messages[-self.max_inquiry_messages:]
                                print(f"[CLEANUP] Trimmed inquiry conversation {conv_key}")
                    
                    print(f"[CLEANUP] Cleanup completed. Active conversations: {len(self.conversation_histories)}")
                    
                except Exception as e:
                    print(f"[CLEANUP] Error: {e}")
        
        cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True, name="Cleanup")
        cleanup_thread.start()
        print(f"[CLEANUP] Đã khởi động cleanup thread")
    
    def _load_config(self):
        """Load routing config từ khai.txt"""
        if not os.path.exists(CONFIG_FILE):
            print(f"[CONFIG] Không tìm thấy file {CONFIG_FILE}")
            return
        
        with open(CONFIG_FILE, "r", encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "|" not in line:
                    continue
                
                parts = line.split("|", 1)
                if len(parts) == 2:
                    input_id = parts[0].strip()
                    output_id = parts[1].strip()
                    if input_id and output_id:
                        self.routing_map[input_id] = output_id
                        print(f"[CONFIG] Route: {input_id} → {output_id}")
        
        print(f"[CONFIG] Đã load {len(self.routing_map)} route(s)")
    
    def _load_training_data(self):
        """Load training prompt từ file"""
        if os.path.exists(self.training_file):
            try:
                with open(self.training_file, "r", encoding="utf-8") as f:
                    prompt = f.read().strip()
                    print(f"[AI] Đã load training data: {prompt[:50]}...")
                    return prompt
            except Exception as e:
                print(f"[AI] Lỗi load training data: {e}")
        return None

    def _save_training_data(self, prompt, append=True):
        """Lưu training prompt vào file - Mặc định APPEND thay vì overwrite"""
        try:
            if append:
                # APPEND: Thêm vào cuối file
                with open(self.training_file, "a", encoding="utf-8") as f:
                    f.write("\n" + prompt)
                print(f"[AI] Đã thêm training data mới (append)")
            else:
                # OVERWRITE: Ghi đè hoàn toàn
                with open(self.training_file, "w", encoding="utf-8") as f:
                    f.write(prompt)
                print(f"[AI] Đã ghi đè training data")
            
            # Reload lại toàn bộ file
            self.system_prompt = self._load_training_data()
            return True
        except Exception as e:
            print(f"[AI] Lỗi lưu training data: {e}")
            return False
    
    def _load_room_owners(self):
        """Load mapping room_code -> owner_id từ idphong.txt"""
        if not os.path.exists(self.idphong_file):
            print(f"[INQUIRY] Không tìm thấy file {self.idphong_file}")
            return
        
        try:
            with open(self.idphong_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "|" not in line:
                        continue
                    
                    parts = line.split("|", 1)
                    if len(parts) == 2:
                        owner_id = parts[0].strip()
                        room_code = parts[1].strip()
                        if owner_id and room_code:
                            self.room_owner_map[room_code] = owner_id
                            print(f"[INQUIRY] Mapping: {room_code} → Owner {owner_id}")
            
            print(f"[INQUIRY] Đã load {len(self.room_owner_map)} room owner(s)")
        except Exception as e:
            print(f"[INQUIRY] Lỗi load room owners: {e}")
    
    def _extract_room_code_from_text(self, text):
        """Trích xuất mã phòng từ text (ví dụ: '4A', '10B')"""
        import re
        # Pattern: số + chữ cái (ví dụ: 4A, 10B, 3C)
        match = re.search(r'\b(\d+[A-Z])\b', text, re.IGNORECASE)
        if match:
            return match.group(1).upper()
        return None
    
    def _create_inquiry_session(self, customer_id, owner_id, room_code):
        """Tạo session kết nối khách <-> chủ phòng"""
        # Session cho customer
        self.inquiry_sessions[customer_id] = {
            "other_id": owner_id,
            "room_code": room_code,
            "role": "customer",
            "created_at": time.time()
        }
        
        # Session cho owner (bidirectional)
        self.inquiry_sessions[owner_id] = {
            "other_id": customer_id,
            "room_code": room_code,
            "role": "owner",
            "created_at": time.time()
        }
        
        # Tạo conversation history key
        conv_key = f"{customer_id}_{owner_id}"
        if conv_key not in self.inquiry_conversations:
            self.inquiry_conversations[conv_key] = []
        
        print(f"[INQUIRY] Tạo session: Customer {customer_id} <-> Owner {owner_id} (Room {room_code})")
    
    def _send_inquiry_to_owner(self, customer_id, owner_id, room_code):
        """Gửi inquiry cho chủ phòng"""
        try:
            # Tìm thông tin phòng
            rooms_file = "rooms_db.json"
            room_info = None
            
            if os.path.exists(rooms_file):
                with open(rooms_file, "r", encoding="utf-8") as f:
                    rooms = json.load(f)
                    for room in rooms:
                        raw_text = room.get("raw_text", "")
                        if raw_text.startswith(room_code):
                            room_info = room
                            break
            
            # Tạo tin nhắn
            inquiry_msg = "Cho mình hỏi phòng này còn không ạ?\n\n"
            
            if room_info:
                addr = room_info.get("address", "")
                price = room_info.get("price", "")
                raw_text = room_info.get("raw_text", "")
                
                inquiry_msg += f"🏡 Phòng {room_code}\n"
                inquiry_msg += f"📍 {addr}\n"
                inquiry_msg += f"💰 {price}\n"
                if raw_text:
                    inquiry_msg += f"\n📝 {raw_text[:200]}..."
            else:
                inquiry_msg += f"🏡 Phòng {room_code}"
            
            # Gửi cho owner
            self.send(Message(text=inquiry_msg), owner_id, ThreadType.USER)
            print(f"[INQUIRY] Đã gửi inquiry cho owner {owner_id}")
            
            # Lưu vào conversation history
            conv_key = f"{customer_id}_{owner_id}"
            self.inquiry_conversations[conv_key].append({
                "from": "system",
                "message": inquiry_msg,
                "timestamp": time.time()
            })
            
            # Gửi ảnh nếu có
            if room_info:
                photos = room_info.get("photos", [])
                
                # Fallback backward compatibility
                if not photos and "media" in room_info:
                     for m in room_info.get("media", []):
                        if isinstance(m, str): photos.append({"url": m, "type": "photo"})
                        elif isinstance(m, dict) and m.get("type") == "photo": photos.append(m)
                
                if photos:
                    # Gửi ảnh trong thread riêng
                    threading.Thread(
                        target=self._send_photos_grouped,
                        args=(photos[:5], owner_id, ThreadType.USER),  # Giới hạn 5 ảnh
                        daemon=True
                    ).start()
                    print(f"[INQUIRY] Đã gửi {len(photos[:5])} ảnh cho owner")
        
        except Exception as e:
            print(f"[INQUIRY] Lỗi gửi inquiry: {e}")
            import traceback
            print(f"[INQUIRY] Traceback: {traceback.format_exc()}")


    def _load_rooms_for_ai(self, district_name=None):
        """Trả về danh sách các quận khả dụng hoặc chuyển sang chế độ tìm kiếm"""
        districts_folder = "districts_ok"
        
        if not os.path.exists(districts_folder):
            return "Hiện tại hệ thống đang bảo trì dữ liệu, cậu quay lại sau nha!"

        if not district_name:
            # Chỉ trả về danh sách các quận để AI biết đường mà hỏi
            all_files = os.listdir(districts_folder)
            districts = []
            for f in all_files:
                if f.endswith(".json"):
                    name = f.replace(".json", "")
                    try:
                        with open(os.path.join(districts_folder, f), "r", encoding="utf-8") as rf:
                            count = len(json.load(rf))
                        districts.append(f"{name} ({count} phòng)")
                    except:
                        districts.append(name)
            
            return f"Các khu vực tớ đang có phòng: {', '.join(districts)}. Cậu muốn tìm ở đâu và tài chính thế nào ạ?"

        return f"Dữ liệu cho {district_name} đã sẵn sàng. Cậu hãy dùng lệnh [SEARCH: {district_name}, giá] để tớ lọc phòng nha."


    def _get_matching_rooms(self, district_name, target_price_str):
        """Hàm lõi để tìm danh sách phòng phù hợp, trả về (danh sách phòng, nhãn khu vực)"""
        districts_folder = "districts_ok"
        
        def remove_accents(s):
            import unicodedata
            s = str(s).lower().strip()
            s = unicodedata.normalize('NFKD', s)
            s = "".join([c for c in s if not unicodedata.combining(c)])
            s = s.replace('đ', 'd')
            return s.replace(" ", "")

        d_key = remove_accents(district_name)
        
        aliases = {
            "haibatrung": "haibatrung", "hbt": "haibatrung", 
            "caugiay": "caugiay", "cg": "caugiay",
            "thanhxuan": "thanhxuan", "tx": "thanhxuan",
            "hadong": "hadong", "hd": "hadong",
            "bactuliem": "bactuliem", "btl": "bactuliem",
            "namtuliem": "namtuliem", "ntl": "namtuliem",
            "hoangmai": "hoangmai", "hm": "hoangmai",
            "longbien": "longbien", "lb": "longbien",
            "dongda": "dongda", "dd": "dongda",
            "badinh": "badinh", "bd": "badinh",
            "tayho": "tayho", "th": "tayho"
        }
        
        is_district_search = d_key in aliases or os.path.exists(os.path.join(districts_folder, f"{d_key}.json"))
        
        all_files_to_scan = []
        if is_district_search:
            d_key = aliases.get(d_key, d_key)
            filepath = os.path.join(districts_folder, f"{d_key}.json")
            if os.path.exists(filepath):
                all_files_to_scan.append(filepath)
        else:
            for f in os.listdir(districts_folder):
                if f.endswith(".json"):
                    all_files_to_scan.append(os.path.join(districts_folder, f))

        if not all_files_to_scan:
            return [], district_name

        try:
            import re
            is_under_logic = any(kw in target_price_str.lower() for kw in ["dưới", "tối đa", "max", "<", "đổ lại"])
            clean_price = target_price_str.lower().strip()
            clean_price = clean_price.replace("tr triệu", "tr").replace("triệu", "tr").replace("m", "tr").replace("c", "tr").replace("củ", "tr")
            clean_price = clean_price.replace(",", ".")
            clean_price = "".join(re.findall(r'[\d.]', clean_price))
            
            if clean_price.count(".") > 1:
                clean_price = clean_price.replace(".", "")
            target_val = float(clean_price) if clean_price else 0
            if target_val > 0:
                if target_val < 100: target_val *= 1000000
                elif 100 <= target_val < 10000: target_val *= 1000
                target_val = int(target_val)
            
            matches = []
            keyword_norm = remove_accents(district_name)
            loc_label = district_name if is_district_search else f"khu vực '{district_name}'"

            for filepath in all_files_to_scan:
                current_d_key = os.path.basename(filepath).replace(".json", "")
                with open(filepath, "r", encoding="utf-8") as f:
                    all_rooms = json.load(f)

                for room in all_rooms:
                    if not is_district_search:
                        addr_norm = remove_accents(room.get("address", ""))
                        if keyword_norm not in addr_norm:
                            continue

                    p1_str = str(room.get("price1", "")).replace(".", "")
                    p2_str = str(room.get("price2", "")).replace(".", "")
                    
                    try:
                        p_min = int(p1_str) if p1_str.isdigit() else None
                        p_max = int(p2_str) if p2_str.isdigit() else None
                    except: p_min = p_max = None
                    
                    if p_min is None or p_max is None: continue

                    is_match = False
                    deviation = 300000
                    if is_under_logic:
                        if p_min <= target_val: is_match = True
                    else:
                        if (p_min - deviation) <= target_val <= (p_max + deviation):
                            is_match = True
                    
                    if is_match:
                        room["district_file"] = f"{current_d_key}.json"
                        matches.append(room)
            
            return matches, loc_label
            
        except Exception as e:
            print(f"[_get_matching_rooms] Lỗi: {e}")
            return [], district_name

    def _search_rooms_numeric(self, district_name, target_price_str):
        """Wrapper cũ để tương thích (nếu cần), thực tế handle_ai_reply sẽ gọi gộp"""
        matches, loc_label = self._get_matching_rooms(district_name, target_price_str)
        if not matches:
            return [f"Tiếc quá, tớ chưa có dữ liệu phòng phù hợp tại {loc_label}."]
        
        return self._format_search_results(matches, loc_label)

    def _format_search_results(self, matches, loc_label):
        """Định dạng danh sách phòng thành các tin nhắn chunk"""
        try:
            results_chunks = []
            current_chunk = f"Tớ tìm thấy {len(matches)} căn phù hợp tại {loc_label}:\n\n"
            
            if not hasattr(self, 'loaded_rooms_cache'): self.loaded_rooms_cache = {}
            if not hasattr(self, 'room_id_map'): self.room_id_map = {}
            
            # Reset ID Map khi bắt đầu một kết quả mới để số thứ tự luôn từ 1
            self.room_id_map.clear()

            for i, room in enumerate(matches[:60], 1):
                short_id = str(i)
                room_id = room["id"]
                self.loaded_rooms_cache[room_id] = room
                self.room_id_map[short_id] = room_id
                
                room_txt = f"ID PHÒNG : {short_id}\n"
                room_txt += f"{room['address']} | {room.get('price_display', room['price'])}\n\n"
                
                if (i-1) > 0 and (i-1) % 15 == 0:
                    results_chunks.append(current_chunk.strip())
                    current_chunk = room_txt
                else:
                    current_chunk += room_txt

            if current_chunk:
                if len(matches) > 60:
                    current_chunk += f"\n... và còn {len(matches) - 60} căn khác nữa. Cậu điều chỉnh khoảng giá để lọc kỹ hơn nha!"
                results_chunks.append(current_chunk.strip())

            return results_chunks
        except Exception as e:
            print(f"[_format_search_results] Lỗi: {e}")
            return ["Tớ gặp chút lỗi khi định dạng dữ liệu, cậu thử lại sau nha!"]
    

    def _call_openrouter_api(self, user_message, user_id):
        """Gọi API OpenRouter để lấy câu trả lời - MỖI USER CÓ LỊCH SỬ RIÊNG"""
        if not self.openrouter_api_key or "sk-xxx" in self.openrouter_api_key:
            print("[AI] Chưa cấu hình API Key")
            return None
            
        if not self.system_prompt:
            print("[AI] Chưa có dữ liệu training (system prompt)")
            return None

        # No more dynamic room loading in system prompt as per user request
        full_system_prompt = self.system_prompt


        # Lấy hoặc tạo conversation history cho user này
        if user_id not in self.conversation_histories:
            self.conversation_histories[user_id] = []
            print(f"[AI] Tạo conversation mới cho user {user_id}")
        
        # Thêm tin nhắn mới của user vào lịch sử
        self.conversation_histories[user_id].append({
            "role": "user",
            "content": user_message
        })
        
        # Giới hạn độ dài lịch sử (giữ N tin nhắn gần nhất)
        if len(self.conversation_histories[user_id]) > self.max_history_length:
            # Giữ lại N tin nhắn cuối
            self.conversation_histories[user_id] = self.conversation_histories[user_id][-self.max_history_length:]
            print(f"[AI] Đã trim history của user {user_id} xuống {self.max_history_length} tin")
        
        # Build messages array: system prompt + conversation history
        messages = [{"role": "system", "content": full_system_prompt}]
        messages.extend(self.conversation_histories[user_id])
        
        print(f"[AI] User {user_id}: Gửi {len(self.conversation_histories[user_id])} tin nhắn trong history")

        headers = {
            "Authorization": f"Bearer {self.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost",
            "X-Title": "khaicute-bot"
        }
        
        data = {
            "model": "stepfun/step-3.5-flash:free",
            "messages": messages
        }
        
        print(f"[AI] Đang gửi request tới OpenRouter API cho user {user_id}...")
        try:
            response = requests.post(self.openrouter_api_url, headers=headers, json=data, timeout=30)
            if response.status_code == 200:
                result = response.json()
                # Parse response standard OpenAI compatible
                if "choices" in result and len(result["choices"]) > 0:
                    ai_response = result["choices"][0]["message"]["content"]
                    
                    # Lưu câu trả lời của AI vào lịch sử
                    self.conversation_histories[user_id].append({
                        "role": "assistant",
                        "content": ai_response
                    })
                    
                    # Trim lại nếu vượt quá giới hạn
                    if len(self.conversation_histories[user_id]) > self.max_history_length:
                        self.conversation_histories[user_id] = self.conversation_histories[user_id][-self.max_history_length:]
                    
                    print(f"[AI] Đã lưu response vào history của user {user_id}")
                    return ai_response
            else:
                print(f"[AI] API Error: {response.text}")
        except Exception as e:
            print(f"[AI] Exception calling API: {e}")
        
        return None
    
    def _auto_execute_showanh(self, display_id, thread_id, thread_type):
        """Tự động thực thi lệnh !showanh với display ID"""
        try:
            # Load rooms if not cached
            if not hasattr(self, 'room_id_map') or not hasattr(self, 'loaded_rooms_cache'):
                self._load_rooms_for_ai()
            
            # Map display ID to original ID
            original_id = self.room_id_map.get(display_id)
            if not original_id:
                self.send(Message(text=f"❌ Không tìm thấy căn {display_id}"), thread_id, thread_type)
                print(f"[AUTO_SHOWANH] Không tìm thấy display_id {display_id} trong room_id_map")
                return
            
            # Get room summary from cache
            room_summary = self.loaded_rooms_cache.get(original_id)
            if not room_summary:
                self.send(Message(text=f"❌ Lỗi: Không tìm thấy dữ liệu phòng"), thread_id, thread_type)
                return
            
            # 1. Faster path: reuse district_file cached during search
            district_file = room_summary.get("district_file")
            room_full = None
            
            if district_file:
                full_path = os.path.join("districts_full", district_file)
                if os.path.exists(full_path):
                    try:
                        with open(full_path, "r", encoding="utf-8") as f:
                            full_rooms = json.load(f)
                            for r in full_rooms:
                                if r.get("id") == original_id:
                                    room_full = r
                                    break
                    except Exception as e:
                        print(f"[AUTO_SHOWANH] Lỗi đọc file cached {district_file}: {e}")

            # 2. Fallback: Search all files if not cached (legacy)
            if not room_full:
                print(f"[AUTO_SHOWANH] Fallback search for {original_id}")
                districts_folder = "districts_full"
                for filename in os.listdir(districts_folder):
                    if filename.endswith(".json"):
                        filepath = os.path.join(districts_folder, filename)
                        try:
                            with open(filepath, "r", encoding="utf-8") as f:
                                rooms = json.load(f)
                                for r in rooms:
                                    if r.get("id") == original_id:
                                        room_full = r
                                        break
                            if room_full: break
                        except: pass
            
            if not room_full:
                self.send(Message(text=f"❌ Không tìm thấy dữ liệu chi tiết cho phòng này."), thread_id, thread_type)
                return

            # Prepare Info Text
            addr = room_summary.get("address", "")
            price = room_summary.get("price", "")
            full_text = room_full.get("text", "")
            symbol = room_full.get("symbol") or "N/A"
            
            # Cleanse text
            clean_text = full_text.replace("NỘI ĐÔ LAND", "Bít Chà Cute").replace("Nội Đô Land", "Bít Chà Cute")
            clean_text = "\n".join([line for line in clean_text.split("\n") if "đẩy cho" not in line.lower() or "bít chà" in line.lower()])

            info_text = f"🏠 THÔNG TIN CĂN {symbol}\n"
            info_text += f"📍 Địa chỉ: {addr}\n"
            info_text += f"💰 Giá: {price}\n\n"
            info_text += f"📝 Chi tiết:\n{clean_text}"
            
            # 1. Gửi thông tin chữ trước (cho khách đọc trước)
            self.send(Message(text=info_text), thread_id, thread_type)
            time.sleep(0.5)

            # 2. Xử lý ảnh và video (gửi gộp group)
            photos = room_full.get("photos", [])
            videos = room_full.get("videos", [])
            
            if photos or videos:
                # Gửi ảnh và video theo group layout trong thread riêng
                threading.Thread(target=self._send_photos_grouped, args=(photos, thread_id, thread_type, None, videos), daemon=True).start()
                msg = f"📸 Đang gửi {len(photos)} ảnh"
                if videos: msg += f" và {len(videos)} video"
                print(f"[AUTO_SHOWANH] {msg}")
            else:
                self.send(Message(text="⚠️ Phòng này không có ảnh và video."), thread_id, thread_type)
                
        except Exception as e:
            print(f"[AUTO_SHOWANH] Lỗi: {e}")
            self.send(Message(text=f"❌ Lỗi khi hiển thị phòng."), thread_id, thread_type)
    


    
    def _safe_int(self, value, default):
        """Chuyển sang int an toàn"""
        try:
            return int(value)
        except Exception:
            return default
    
    def _flush_media_buffer(self, buffer_key):
        """Gửi tất cả ảnh/video trong buffer"""
        # Kiểm tra bot có đang chạy không
        if not self.is_running:
            print(f"[FLUSH] Bot đã dừng, bỏ qua flush buffer {buffer_key}")
            return
        
        with self.buffer_lock:
            if buffer_key not in self.media_buffers:
                return
            
            buffer = self.media_buffers.pop(buffer_key)
        
        dest_id = buffer.get("dest_id")
        photos = buffer.get("photos", [])
        videos = buffer.get("videos", [])
        
        if not dest_id:
            return
        
        # Sort theo timestamp
        photos.sort(key=lambda x: x.get("timestamp", 0))
        videos.sort(key=lambda x: x.get("timestamp", 0))
        
        dest_ids = [str(d).strip() for d in str(dest_id).split(",") if str(d).strip()]
        # FIX: Chỉ lấy ID đầu tiên
        if dest_ids:
            dest_ids = [dest_ids[0]]
        
        print(f"[FLUSH] Gửi {len(photos)} ảnh, {len(videos)} video → {dest_ids}")
        
        for d_id in dest_ids:
            # Gửi ảnh và video (group layout sequential)
            self._send_photos_grouped(photos, d_id, videos=videos)
    
    def _send_photos_grouped(self, photos, dest_id, thread_type=ThreadType.GROUP, message=None, videos=None):
        """Gửi nhiều ảnh với group layout - tải song song - kèm video sau đó"""
        if not photos and not videos:
            return
        
        image_paths = []
        if photos:
            # Filter photos to ensure only those with valid URLs are processed
            valid_photos = [p for p in photos if p.get("url")]
            if valid_photos:
                def download_photo(idx, photo):
                    """Tải 1 ảnh - chạy trong thread riêng"""
                    url = photo.get("url")
                    try:
                        resp = requests.get(url, stream=True, timeout=15)
                        resp.raise_for_status()
                        temp_path = f"temp_ntk_{int(time.time() * 1000)}_{idx}_{threading.current_thread().ident}.jpg"
                        with open(temp_path, "wb") as f:
                            for chunk in resp.iter_content(chunk_size=8192):
                                if chunk:
                                    f.write(chunk)
                        return {
                            "idx": idx,
                            "path": temp_path,
                            "width": photo.get("width", 2560),
                            "height": photo.get("height", 2560),
                        }
                    except Exception as e:
                        print(f"[DOWNLOAD] Lỗi tải ảnh {idx}: {e}")
                        return None
                
                try:
                    # Tải tất cả ảnh SONG SONG
                    futures = []
                    for idx, photo in enumerate(valid_photos):
                        future = self.executor.submit(download_photo, idx, photo)
                        futures.append(future)
                    
                    # Đợi tất cả hoàn thành
                    for future in as_completed(futures):
                        result = future.result()
                        if result:
                            image_paths.append(result)
                    
                    if image_paths:
                        # Sắp xếp lại theo idx
                        image_paths.sort(key=lambda x: x["idx"])
                        
                        # Extract list paths
                        paths_to_send = [item["path"] for item in image_paths]
                        
                        print(f"[FORWARD] Bắt đầu gửi {len(paths_to_send)} ảnh (Multi) tới {dest_id}...")
                        try:
                            self.sendMultiLocalImage(
                                paths_to_send, 
                                dest_id, 
                                thread_type,
                                width=image_paths[0]["width"],
                                height=image_paths[0]["height"],
                                message=message
                            )
                        except Exception as e:
                            print(f"[FORWARD] Lỗi sendMultiLocalImage fallback: {e}")
                            for idx, item in enumerate(image_paths):
                                 self.sendLocalImage(item["path"], dest_id, thread_type)
                                 time.sleep(1.0)
                finally:
                    # Xóa file tạm
                    for item in image_paths:
                        try:
                            if os.path.exists(item["path"]):
                                os.remove(item["path"])
                        except: pass

        # Gửi video SAU KHI đã gửi xong ảnh (đảm bảo thứ tự)
        if videos:
            print(f"[FORWARD] Bắt đầu gửi {len(videos)} video tới {dest_id}...")
            for video in videos:
                try:
                    self.sendRemoteVideo(
                        video["url"],
                        video.get("thumb") or video["url"],
                        video.get("duration", 1000),
                        dest_id,
                        thread_type,
                        width=video.get("width", 1280),
                        height=video.get("height", 720)
                    )
                    time.sleep(0.5)
                except Exception as e:
                    print(f"[FORWARD] Lỗi gửi video: {e}")
    
    def _add_to_buffer(self, source_id, author_id, dest_id, media_type, media_data):
        """Thêm ảnh/video vào buffer để gom lại"""
        # Kiểm tra bot có đang chạy không
        if not self.is_running:
            print(f"[BUFFER] Bot đã dừng, bỏ qua buffer {media_type}")
            return
        
        buffer_key = (source_id, author_id)
        
        with self.buffer_lock:
            if buffer_key not in self.media_buffers:
                self.media_buffers[buffer_key] = {
                    "photos": [],
                    "videos": [],
                    "dest_id": dest_id,
                    "last_update": time.time(),
                    "timer": None,
                }
            
            buffer = self.media_buffers[buffer_key]
            media_data["timestamp"] = time.time()
            
            if media_type == "photo":
                buffer["photos"].append(media_data)
            else:
                buffer["videos"].append(media_data)
            
            buffer["last_update"] = time.time()
            
            # Cancel timer cũ
            if buffer.get("timer"):
                buffer["timer"].cancel()
            
            # Đặt timer mới - đợi thêm ảnh
            timer = threading.Timer(
                self.buffer_timeout,
                self._flush_media_buffer,
                args=(buffer_key,)
            )
            timer.start()
            buffer["timer"] = timer
            
            total = len(buffer["photos"]) + len(buffer["videos"])
            print(f"[BUFFER] {media_type} #{total} từ {author_id} (đợi {self.buffer_timeout}s)")
    
    def _forward_message(self, message, message_object, source_id, dest_id, author_id):
        """Forward tin nhắn từ source → dest"""
        try:
            msg_type = getattr(message_object, "msgType", None)
            content = getattr(message_object, "content", {}) or {}
            
            if not isinstance(content, dict):
                content = {}
            
            # Parse params
            params = {}
            params_raw = content.get("params")
            if params_raw:
                try:
                    params = json.loads(params_raw)
                except:
                    pass
            
            # Text message
            if msg_type == "webchat" or (isinstance(message, str) and message and msg_type not in ["chat.photo", "chat.video", "chat.video.msg", "chat.sticker"]):
                text = message if isinstance(message, str) else ""
                if not text:
                    if isinstance(content, str):
                        text = content
                    elif isinstance(content, dict):
                        text = content.get("text", "") or content.get("title", "")
                
                if text:
                    dest_ids = [str(d).strip() for d in str(dest_id).split(",") if str(d).strip()]
                    # FIX: Chỉ gửi 1
                    if dest_ids:
                        d_id = dest_ids[0]
                        self.send(Message(text=text), d_id, ThreadType.GROUP)
                        print(f"[FORWARD] Text: {text[:50]}... → {d_id}")
            
            # Photo - gom vào buffer theo (source_id, author_id)
            elif msg_type == "chat.photo":
                photo_url = content.get("hd") or content.get("href")
                if photo_url:
                    width = self._safe_int(params.get("width"), 2560)
                    height = self._safe_int(params.get("height"), 2560)
                    
                    self._add_to_buffer(source_id, author_id, dest_id, "photo", {
                        "url": photo_url,
                        "width": width,
                        "height": height,
                    })
            
            # Video - gom vào buffer
            elif msg_type in ["chat.video", "chat.video.msg"]:
                video_url = content.get("href")
                thumb_url = content.get("thumb") or content.get("hd")
                
                if video_url:
                    duration = self._safe_int(params.get("duration"), 1000)
                    width = self._safe_int(params.get("width"), 1280)
                    height = self._safe_int(params.get("height"), 720)
                    
                    self._add_to_buffer(source_id, author_id, dest_id, "video", {
                        "url": video_url,
                        "thumb": thumb_url,
                        "duration": duration,
                        "width": width,
                        "height": height,
                    })
            
            # Sticker - gửi ngay
            elif msg_type == "chat.sticker":
                sticker_id = content.get("id")
                sticker_cat_id = content.get("catId")
                sticker_type = content.get("type", 3)
                
                if sticker_id and sticker_cat_id:
                    dest_ids = [str(d).strip() for d in str(dest_id).split(",") if str(d).strip()]
                    # FIX: Chỉ gửi 1
                    if dest_ids:
                        d_id = dest_ids[0]
                        self.sendSticker(sticker_type, sticker_id, sticker_cat_id, d_id, ThreadType.GROUP)
                        print(f"[FORWARD] Sticker → {d_id}")
        
        except Exception as e:
            print(f"[FORWARD] Lỗi: {e}")
            import traceback
            print(f"[FORWARD] Traceback: {traceback.format_exc()}")
    
    def onMessage(self, mid, author_id, message, message_object, thread_id, thread_type):
        """Xử lý tin nhắn đến"""
        # Cập nhật thời gian tin nhắn cuối (cho heartbeat)
        self.last_message_time = time.time()
        
        try:
            thread_id_str = str(thread_id)
            author_id_str = str(author_id)

            # Ignore self messages to prevent loop
            if author_id_str == self.uid:
                return
            
            # Ignore group messages (Only reply to IB)
            # User request: "tao muốn ai ib cx rep" & "chỉ tin nhắn riêng chứ k phải tin nhắn [group]"
            if thread_type != ThreadType.USER:
                return
            
            # Log
            msg_type = getattr(message_object, "msgType", "")
            msg_preview = str(message)[:50] if message else msg_type
            print(f"{Fore.GREEN}[MSG] {thread_id}: {msg_preview}...{Style.RESET_ALL}")
            
            if isinstance(message, str) and message.strip().startswith("!"):
                parts = message.strip().split(maxsplit=1)
                cmd = parts[0]
                
                # Command: !set <zalo_id>
                if cmd == "!set":
                    if len(parts) == 2:
                        target_id = parts[1].strip()
                        if target_id:
                            # Bắt đầu uptime notifications
                            self._start_uptime_notifications(target_id)
                            
                            # Gửi xác nhận
                            try:
                                confirm_msg = f"✅ Đã set uptime notification cho ID: {target_id}\n🕐 Sẽ gửi thông báo mỗi 5 phút vào nhóm này"
                                self.send(Message(text=confirm_msg), thread_id_str, ThreadType.GROUP)
                                print(f"[CMD] Đã set uptime target: {target_id}")
                            except Exception as e:
                                print(f"[CMD] Lỗi gửi xác nhận: {e}")
                    else:
                        try:
                            self.send(Message(text="❌ Sử dụng: !set <zalo_id>"), thread_id_str, ThreadType.GROUP)
                        except:
                            pass
                    return # Stop processing
                
                # Command: !train <instruction>
                elif cmd == "!train":
                    if len(parts) == 2:
                        training_text = parts[1].strip()
                        if training_text:
                            if self._save_training_data(training_text):
                                self.send(Message(text="✅ Đã cập nhật dữ liệu training cho AI!"), thread_id_str, ThreadType.GROUP)
                            else:
                                self.send(Message(text="❌ Lỗi khi lưu dữ liệu training."), thread_id_str, ThreadType.GROUP)
                        else:
                             self.send(Message(text="❌ Vui lòng nhập nội dung training."), thread_id_str, ThreadType.GROUP)
                    else:
                        self.send(Message(text="❌ Sử dụng: !train <nội dung hướng dẫn AI>"), thread_id_str, ThreadType.GROUP)
                    return # Stop processing

                # Command: !clear - Xóa lịch sử chat với AI
                elif cmd == "!clear":
                    if thread_id_str in self.conversation_histories:
                        del self.conversation_histories[thread_id_str]
                        self.send(Message(text="✅ Đã xóa lịch sử chat! Bắt đầu cuộc trò chuyện mới."), thread_id_str, ThreadType.USER)
                        print(f"[CMD] Đã xóa conversation history của user {thread_id_str}")
                    else:
                        self.send(Message(text="ℹ️ Chưa có lịch sử chat nào."), thread_id_str, ThreadType.USER)
                    return # Stop processing

                # Command: !trainreset - Xóa toàn bộ training data và bắt đầu lại
                elif cmd == "!trainreset":
                    if len(parts) == 2:
                        new_prompt = parts[1].strip()
                        if new_prompt:
                            if self._save_training_data(new_prompt, append=False):  # Ghi đè
                                self.send(Message(text="✅ Đã reset và tạo training data mới!"), thread_id_str, ThreadType.USER)
                            else:
                                self.send(Message(text="❌ Lỗi khi reset training data."), thread_id_str, ThreadType.USER)
                        else:
                            self.send(Message(text="❌ Vui lòng nhập nội dung training."), thread_id_str, ThreadType.USER)
                    else:
                        self.send(Message(text="❌ Sử dụng: !trainreset <nội dung mới>"), thread_id_str, ThreadType.USER)
                    return # Stop processing

                # Command: !trainshow - Xem toàn bộ training data hiện tại
                elif cmd == "!trainshow":
                    if self.system_prompt:
                        # Giới hạn độ dài để tránh tin nhắn quá dài
                        preview = self.system_prompt[:1000]
                        if len(self.system_prompt) > 1000:
                            preview += f"\n\n... (còn {len(self.system_prompt) - 1000} ký tự nữa)"
                        self.send(Message(text=f"📋 TRAINING DATA HIỆN TẠI:\n\n{preview}"), thread_id_str, ThreadType.USER)
                    else:
                        self.send(Message(text="ℹ️ Chưa có training data."), thread_id_str, ThreadType.USER)
                    return # Stop processing

                # Command: !end - Kết thúc inquiry session
                elif cmd == "!end":
                    if thread_id_str in self.inquiry_sessions:
                        session = self.inquiry_sessions[thread_id_str]
                        other_id = session["other_id"]
                        room_code = session["room_code"]
                        
                        # Xóa session của cả 2 bên
                        del self.inquiry_sessions[thread_id_str]
                        if other_id in self.inquiry_sessions:
                            del self.inquiry_sessions[other_id]
                        
                        # Thông báo cho cả 2 bên
                        self.send(Message(text="✅ Đã kết thúc cuộc trò chuyện. Cảm ơn bạn!"), thread_id_str, ThreadType.USER)
                        self.send(Message(text="✅ Cuộc trò chuyện đã kết thúc."), other_id, ThreadType.USER)
                        
                        print(f"[INQUIRY] Đã kết thúc session: {thread_id_str} <-> {other_id} (Room {room_code})")
                    else:
                        self.send(Message(text="ℹ️ Bạn không đang trong cuộc trò chuyện nào."), thread_id_str, ThreadType.USER)
                    return # Stop processing

                # Command: !showanh <id/số thứ tự>
                elif cmd == "!showanh":
                    import re
                    # Hỗ trợ: !showanh 1, !showanh room_123, !showanh Căn 1
                    # Gom lại parts còn lại thành 1 string để match
                    arg_str = " ".join(parts[1:]) if len(parts) > 1 else ""
                    
                    match = re.search(r'(?:Căn\s*)?([a-zA-Z0-9_]+)', arg_str, re.IGNORECASE)
                    
                    if match:
                        input_id = match.group(1)
                        rooms_file = "rooms_db.json"
                        
                        if not os.path.exists(rooms_file):
                            self.send(Message(text="❌ Chưa có dữ liệu phòng."), thread_id_str, ThreadType.GROUP)
                            return
                        
                        try:
                            # Use the standardized auto execution logic for consistency
                            # It handles ID mapping, optimized full data lookup, and "guianh format"
                            self._auto_execute_showanh(input_id, thread_id_str, thread_type)
                        except Exception as e:
                            self.send(Message(text=f"❌ Lỗi: {e}"), thread_id_str, thread_type)
                    else:
                        self.send(Message(text="❌ Sử dụng: !showanh <room_id>"), thread_id_str, thread_type)
                    return # Stop processing
            
            # ═══════════════════════════════════════════════════════════
            # INQUIRY SYSTEM: Check nếu user đang trong inquiry session
            # ═══════════════════════════════════════════════════════════
            if thread_id_str in self.inquiry_sessions:
                session = self.inquiry_sessions[thread_id_str]
                other_id = session["other_id"]
                room_code = session["room_code"]
                role = session["role"]
                
                print(f"[INQUIRY] User {thread_id_str} ({role}) đang trong session với {other_id} (Room {room_code})")
                
                # Forward tin nhắn sang bên kia
                if message and isinstance(message, str):
                    # Lưu vào conversation history
                    if role == "customer":
                        conv_key = f"{thread_id_str}_{other_id}"
                        from_label = "customer"
                    else:  # owner
                        conv_key = f"{other_id}_{thread_id_str}"
                        from_label = "owner"
                    
                    self.inquiry_conversations[conv_key].append({
                        "from": from_label,
                        "message": message,
                        "timestamp": time.time()
                    })
                    
                    # Forward message
                    self.send(Message(text=message), other_id, ThreadType.USER)
                    print(f"[INQUIRY] Forwarded message: {thread_id_str} → {other_id}")
                
                # Forward media nếu có
                msg_type = getattr(message_object, "msgType", None)
                if msg_type == "chat.photo":
                    content = getattr(message_object, "content", {}) or {}
                    photo_url = content.get("hd") or content.get("href")
                    if photo_url:
                        # Gửi ảnh (simplified, có thể improve sau)
                        print(f"[INQUIRY] Forwarding photo: {thread_id_str} → {other_id}")
                        # TODO: Implement photo forwarding
                
                return  # Stop processing, không chạy AI
            
            # ═══════════════════════════════════════════════════════════
            # NORMAL PROCESSING (không phải inquiry session)
            # ═══════════════════════════════════════════════════════════
            
            # Kiểm tra có route không
            dest_id = self.routing_map.get(thread_id_str)
            
            # Fallback: Nếu không có trong map, lấy route đầu tiên làm default
            # Điều này giúp bot trả lời mọi user, forward về cùng 1 nhóm admin
            if not dest_id and self.routing_map:
                dest_id = next(iter(self.routing_map.values()))
            
            if dest_id:
                
                # 1. Forward tin nhắn gốc cho Admin (như cũ)
                self._forward_message(message, message_object, thread_id_str, dest_id, author_id_str)
                
                if self.system_prompt and message and isinstance(message, str):
                    # Chạy trong thread riêng để không block bot
                    def handle_ai_reply():
                        try:
                            # Hiển thị "đang soạn tin..." cho user
                            print(f"[AI] Hiển thị typing indicator cho user {thread_id_str}")
                            self.setTyping(thread_id_str, ThreadType.USER)
                            
                            print(f"[AI] Đang xử lý tin nhắn từ user {thread_id_str}: {message[:20]}...")
                            ai_reply = self._call_openrouter_api(message, thread_id_str)  # Truyền user_id
                            
                            if ai_reply:
                                # Check for various tags in AI reply
                                import re
                                inquiry_match = re.search(r'\[INQUIRY:([A-Z0-9]+)\]', ai_reply, re.IGNORECASE)
                                search_match = re.search(r'\[SEARCH:\s*([^,]+),\s*([^\]]+)\]', ai_reply, re.IGNORECASE)
                                auto_cmd_match = re.search(r'\[AUTO_SHOWANH:\s*(\d+)\]', ai_reply, re.IGNORECASE)
                                load_district_match = None # Legacy
                                
                                # Priority 1: AUTO_SHOWANH (Khách chọn xem ảnh cụ thể)
                                if auto_cmd_match:
                                    display_id = auto_cmd_match.group(1)
                                    print(f"[AI] Phát hiện AUTO_SHOWANH: {display_id}")
                                    
                                    clean_reply = re.sub(r'\[AUTO_SHOWANH:\s*\d+\]', '', ai_reply, flags=re.IGNORECASE).strip()
                                    if clean_reply:
                                        self.send(Message(text=clean_reply), thread_id_str, thread_type)
                                    
                                    self._auto_execute_showanh(display_id, thread_id_str, thread_type)
                                    
                                    dest_ids = [str(d).strip() for d in str(dest_id).split(",") if str(d).strip()]
                                    if dest_ids:
                                        self.send(Message(text=f"🤖 [AI Reply + AUTO]: {ai_reply}"), dest_ids[0], ThreadType.GROUP)

                                # Priority 2: INQUIRY (khách hỏi về phòng)
                                elif inquiry_match:
                                    room_code = inquiry_match.group(1).upper()
                                    print(f"[INQUIRY] Phát hiện INQUIRY với room_code: {room_code}")
                                    
                                    # Remove tag from visible text
                                    clean_reply = re.sub(r'\[INQUIRY:\s*[A-Z0-9]+\]', '', ai_reply, flags=re.IGNORECASE).strip()
                                    
                                    # Send AI's text response
                                    if clean_reply:
                                        self.send(Message(text=clean_reply), thread_id_str, thread_type)
                                        print(f"[INQUIRY] Reply text -> {thread_id_str}")
                                    
                                    # Check if room owner exists
                                    if room_code in self.room_owner_map:
                                        owner_id = self.room_owner_map[room_code]
                                        
                                        # Create inquiry session
                                        self._create_inquiry_session(thread_id_str, owner_id, room_code)
                                        
                                        # Send inquiry to owner
                                        self._send_inquiry_to_owner(thread_id_str, owner_id, room_code)
                                        
                                        print(f"[INQUIRY] Đã kết nối customer {thread_id_str} với owner {owner_id}")
                                    else:
                                        # Không tìm thấy owner
                                        self.send(
                                            Message(text="Xin lỗi, phòng này chưa có thông tin liên hệ. Vui lòng liên hệ 0876480130."),
                                            thread_id_str,
                                            thread_type
                                        )
                                        print(f"[INQUIRY] Không tìm thấy owner cho room {room_code}")
                                    
                                    # Forward cho admin
                                    dest_ids = [str(d).strip() for d in str(dest_id).split(",") if str(d).strip()]
                                    if dest_ids:
                                        self.send(Message(text=f"🤖 [AI Reply + INQUIRY]: {ai_reply}"), dest_ids[0], ThreadType.GROUP)

                                # Priority 3: SEARCH (AI yêu cầu lọc phòng bằng Python)
                                elif search_match:
                                    print(f"[AI] Phát hiện SEARCH tag(s) trong reply")
                                    
                                    # Tìm tất cả các tag SEARCH
                                    all_search_tags = re.findall(r'\[SEARCH:\s*([^,]+),\s*([^\]]+)\]', ai_reply, re.IGNORECASE)
                                    
                                    all_rooms = []
                                    all_labels = []
                                    
                                    for district, price in all_search_tags:
                                        matches, label = self._get_matching_rooms(district.strip(), price.strip())
                                        all_rooms.extend(matches)
                                        all_labels.append(label)
                                    
                                    # Loại bỏ các phòng trùng lặp dựa trên ID
                                    seen_ids = set()
                                    unique_rooms = []
                                    for r in all_rooms:
                                        if r.get("id") not in seen_ids:
                                            unique_rooms.append(r)
                                            seen_ids.add(r.get("id"))
                                    
                                    # Gộp nhãn khu vực (loại bỏ trùng lặp giữ nguyên thứ tự)
                                    unique_labels = list(dict.fromkeys(all_labels))
                                    merged_label = " và ".join(unique_labels)
                                    
                                    # Định dạng kết quả cuối cùng
                                    if unique_rooms:
                                        all_matches_info = self._format_search_results(unique_rooms, merged_label)
                                    else:
                                        all_matches_info = [f"Tiếc quá, tớ chưa thấy căn nào phù hợp tại {merged_label}."]

                                    # Gửi tin nhắn clean của AI (loại bỏ tất cả các tag SEARCH)
                                    clean_reply = re.sub(r'\[SEARCH:\s*[^\]]+\]', '', ai_reply, flags=re.IGNORECASE).strip()
                                    if clean_reply:
                                        self.send(Message(text=clean_reply), thread_id_str, thread_type)
                                    
                                    # Gửi các kết quả tìm kiếm đã gộp
                                    import time
                                    for info in all_matches_info:
                                        self.send(Message(text=info), thread_id_str, thread_type)
                                        
                                        # LƯU VÀO HISTORY
                                        if thread_id_str in self.conversation_histories:
                                            self.conversation_histories[thread_id_str].append({"role": "assistant", "content": info})
                                            
                                        time.sleep(1) # Delay tránh rớt tin
                                
                                else:
                                    # Normal response without auto-command
                                    self.send(Message(text=ai_reply), thread_id_str, thread_type)
                                    print(f"[AI] Reply text -> {thread_id_str}")
                                    
                                    # Forward câu trả lời của AI cho Admin
                                    dest_ids = [str(d).strip() for d in str(dest_id).split(",") if str(d).strip()]
                                    if dest_ids:
                                        self.send(Message(text=f"🤖 [AI Reply]: {ai_reply}"), dest_ids[0], ThreadType.GROUP)
                            else:
                                print(f"[AI] Không có câu trả lời (hoặc lỗi)")
                        except Exception as e:
                            print(f"[AI] Lỗi trong handle_ai_reply: {e}")
                            import traceback
                            print(f"[AI] Traceback: {traceback.format_exc()}")
                    
                    threading.Thread(target=handle_ai_reply, daemon=True).start()


            
        except Exception as e:
            print(f"[ERROR] {e}")


if __name__ == "__main__":
    print("🚀 Khởi động NTK Bot (1:1 Forward với Group Layout)...")
    
    while True:
        bot = None
        try:
            bot = NTKBot(API_KEY, SECRET_KEY, IMEISUP, COOKIESUP)
            print("[MAIN] Đã kết nối, bắt đầu listen...")
            
            # Chạy listen trong thread riêng
            def listen_thread():
                try:
                    bot.listen(thread=False, delay=0)
                except Exception as e:
                    print(f"[MAIN] Listen lỗi: {e}")
            
            listen_t = threading.Thread(target=listen_thread, daemon=True)
            listen_t.start()
            
            # Đợi cho đến khi heartbeat set is_running = False
            while bot.is_running:
                time.sleep(1)
            
            print("[MAIN] 🔄 Restart bot...")
        
        except KeyboardInterrupt:
            print("[MAIN] Dừng bot (Ctrl+C)")
            if bot:
                bot.is_running = False
                bot._cleanup()
            break
        
        except Exception as e:
            print(f"[MAIN] Lỗi: {e}")
            import traceback
            print(f"[MAIN] Traceback: {traceback.format_exc()}")
        
        finally:
            if bot:
                if bot.is_running:
                    bot.is_running = False
                    bot._cleanup()
            print("[MAIN] Đợi 5 giây trước khi restart...")
            time.sleep(5)


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

from config import API_KEY, SECRET_KEY, IMEI, SESSION_COOKIES, QWEN_API_KEY, QWEN_API_URL
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
        
        # Qwen API Config
        self.qwen_api_key = QWEN_API_KEY
        self.qwen_api_url = QWEN_API_URL
        self.training_file = "training_prompt.txt"
        self.system_prompt = self._load_training_data()

        
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
        
        # Uptime tracking
        self.start_time = time.time()
        self.uptime_target_id = None
        self.uptime_timer = None
    
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
            self.send(Message(text=uptime_msg), self.uptime_target_id, ThreadType.USER)
            print(f"[UPTIME] Đã gửi: {uptime_msg} → {self.uptime_target_id}")
            
        except Exception as e:
            print(f"[UPTIME] Lỗi gửi thông báo: {e}")
        
        # Đặt lịch gửi tiếp theo sau 10 phút
        if self.is_running and self.uptime_target_id:
            self.uptime_timer = threading.Timer(600, self._send_uptime_notification)  # 600s = 10 phút
            self.uptime_timer.start()
            print(f"[UPTIME] Đã đặt lịch gửi tiếp theo sau 10 phút")
    
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
        
        # Bắt đầu timer mới - gửi lần đầu sau 10 phút
        self.uptime_timer = threading.Timer(600, self._send_uptime_notification)
        self.uptime_timer.start()
        print("[UPTIME] Đã khởi động uptime timer (gửi sau 10 phút)")
    
    def _start_heartbeat(self):
        """
        Khởi động thread heartbeat với logic restart đơn giản:
        - Check mỗi 30 giây
        - Nếu 5 phút không có tin nhắn mới → chuẩn bị restart
        - Đợi thêm 1 phút sau tin cuối cùng mới thực sự restart (đảm bảo không có tin đang xử lý)
        """
        def heartbeat_worker():
            restart_pending = False
            restart_wait_start = 0
            
            while self.is_running:
                try:
                    time.sleep(30)  # Check mỗi 30 giây
                    
                    if not self.is_running:
                        break
                    
                    current_time = time.time()
                    time_since_last = current_time - self.last_message_time
                    
                    # Kiểm tra buffer có đang xử lý không
                    with self.buffer_lock:
                        buffers_active = len(self.media_buffers)
                    
                    if time_since_last > 300:  # 5 phút không có tin nhắn
                         # [MODIFIED] Không restart nữa, chỉ log
                         pass
                    else:
                        # Có tin nhắn gần đây
                        print(f"[HEARTBEAT] ✓ Bot hoạt động bình thường (tin cuối: {int(time_since_last)}s trước)")
                        
                except Exception as e:
                    print(f"[HEARTBEAT] Lỗi: {e}")
                    import traceback
                    print(f"[HEARTBEAT] Traceback: {traceback.format_exc()}")
            
            print(f"[HEARTBEAT] Thread kết thúc")
        
        self.heartbeat_thread = threading.Thread(target=heartbeat_worker, daemon=True, name="Heartbeat")
        self.heartbeat_thread.start()
        print(f"[HEARTBEAT] Đã khởi động heartbeat thread")
    
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

    def _save_training_data(self, prompt):
        """Lưu training prompt vào file"""
        try:
            with open(self.training_file, "w", encoding="utf-8") as f:
                f.write(prompt)
            self.system_prompt = prompt
            print(f"[AI] Đã lưu training data mới")
            return True
        except Exception as e:
            print(f"[AI] Lỗi lưu training data: {e}")
            return False

    def _load_rooms_for_ai(self):
        """Load rooms_db.json và format thành string cho AI"""
        rooms_file = "rooms_db.json"
        if not os.path.exists(rooms_file):
            return "Hiện tại chưa có dữ liệu phòng."
        
        try:
            with open(rooms_file, "r", encoding="utf-8") as f:
                rooms = json.load(f)
            
            if not rooms:
                return "Hiện tại chưa có dữ liệu phòng."
            
            # Cache room theo ID gốc
            self.loaded_rooms_cache = {r.get("id"): r for r in rooms if r.get("id")}
            # Cache room theo số thứ tự (1, 2, 3...) -> "1": room_obj
            self.room_simple_map = {}
            
            # Format rút gọn tối đa để tiết kiệm token
            # Chỉ lấy full address, bỏ quận/phường riêng lẻ. Mô tả cắt ngắn còn 100 chars
            rooms_text = "DS phòng (Mã căn|Địa chỉ|Giá|Mô tả):\n"
            for i, room in enumerate(rooms, 1):
                r_id = room.get("id", "N/A")
                simple_id = str(i)
                self.room_simple_map[simple_id] = room
                
                # SỬA LỖI: address có thể là string hoặc dict
                addr_raw = room.get("address", "N/A")
                if isinstance(addr_raw, dict):
                    addr = addr_raw.get("full", "N/A")
                else:
                    addr = str(addr_raw)
                
                price = room.get("price", "N/A")
                # Xử lý mô tả: bỏ xuống dòng, cắt ngắn
                raw_desc = room.get("raw_text", "")
                desc = " ".join(raw_desc.split()).replace("\n", " ")[:100]
                
                rooms_text += f"- Căn {simple_id} | {addr} | {price}tr | {desc}...\n"
            
            return rooms_text
        except Exception as e:
            print(f"[AI] Lỗi load rooms db: {e}")
            return "Lỗi khi đọc dữ liệu phòng."

    def _call_qwen_api(self, user_message):
        """Gọi API Qwen để lấy câu trả lời"""
        if not self.qwen_api_key or "sk-xxx" in self.qwen_api_key:
            print("[AI] Chưa cấu hình API Key")
            return None
            
        if not self.system_prompt:
            print("[AI] Chưa có dữ liệu training (system prompt)")
            return None

        # Load room data
        rooms_context = self._load_rooms_for_ai()
        print(f"[AI] Đã load thông tin phòng (độ dài: {len(rooms_context)})")
        
        # Ghép system prompt với dữ liệu phòng
        full_system_prompt = f"""{self.system_prompt}

[DỮ LIỆU PHÒNG CỦA BẠN]:
{rooms_context}

[HƯỚNG DẪN QUAN TRỌNG]:
1. Sử dụng thông tin trên để tư vấn. Chỉ tư vấn phòng có trong danh sách.
2. Gọi tên phòng là "Căn 1", "Căn 2"... (tương ứng Mã căn).
3. KHÔNG DÙNG định dạng in đậm (**...**) trong câu trả lời. Viết text bình thường.
4. Nếu khách quan tâm, bảo họ: "Bạn gõ !showanh <số căn> để xem ảnh".
   Ví dụ: "Bạn gõ !showanh 1 để xem ảnh Căn 1 nhé."
"""

        headers = {
            "Authorization": f"Bearer {self.qwen_api_key}",
            "Content-Type": "application/json"
        }
        
        data = {
            "model": "qwen-plus",
            "messages": [
                {"role": "system", "content": full_system_prompt},
                {"role": "user", "content": user_message}
            ]
        }
        
        print(f"[AI] Đang gửi request tới Qwen API...")
        try:
            response = requests.post(self.qwen_api_url, headers=headers, json=data, timeout=30)
            if response.status_code == 200:
                result = response.json()
                # Parse response standard OpenAI compatible
                if "choices" in result and len(result["choices"]) > 0:
                    return result["choices"][0]["message"]["content"]
            else:
                print(f"[AI] API Error: {response.text}")
        except Exception as e:
            print(f"[AI] Exception calling API: {e}")
        
        return None

    
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
        
        print(f"[FLUSH] Gửi {len(photos)} ảnh, {len(videos)} video → {dest_id}")
        
        # Gửi ảnh với group layout
        if photos:
            self._send_photos_grouped(photos, dest_id)
        
        # Gửi video
        for video in videos:
            try:
                self.sendRemoteVideo(
                    video["url"],
                    video.get("thumb") or video["url"],
                    video.get("duration", 1000),
                    dest_id,
                    ThreadType.GROUP,
                    width=video.get("width", 1280),
                    height=video.get("height", 720)
                )
                print(f"[FORWARD] Video → {dest_id}")
            except Exception as e:
                print(f"[FORWARD] Lỗi gửi video: {e}")
    
    def _send_photos_grouped(self, photos, dest_id, thread_type=ThreadType.GROUP):
        """Gửi nhiều ảnh với group layout - tải song song"""
        if not photos:
            return
        
        def download_photo(idx, photo):
            """Tải 1 ảnh - chạy trong thread riêng"""
            url = photo.get("url")
            if not url:
                return None
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
        
        image_paths = []
        try:
            # Tải tất cả ảnh SONG SONG
            futures = []
            for idx, photo in enumerate(photos):
                future = self.executor.submit(download_photo, idx, photo)
                futures.append(future)
            
            # Đợi tất cả hoàn thành
            for future in as_completed(futures):
                result = future.result()
                if result:
                    image_paths.append(result)
            
            if not image_paths:
                return
            
            # Sắp xếp lại theo idx
            image_paths.sort(key=lambda x: x["idx"])
            
            # Extract list paths
            paths_to_send = [item["path"] for item in image_paths]
            
            if paths_to_send:
                print(f"[FORWARD] Bắt đầu gửi {len(paths_to_send)} ảnh (Multi) tới {dest_id} (Type: {thread_type})...")
                try:
                    # Sử dụng sendMultiLocalImage như bot.py
                    self.sendMultiLocalImage(
                        paths_to_send, 
                        dest_id, 
                        thread_type,
                        width=image_paths[0]["width"], # Lấy width/height của ảnh đầu làm mẫu
                        height=image_paths[0]["height"]
                    )
                    print(f"[FORWARD] Hoàn tất gửi {len(paths_to_send)} ảnh (grouped) tới {dest_id}")
                except Exception as e:
                    print(f"[FORWARD] Lỗi sendMultiLocalImage: {e}")
                    # Fallback sent từng ảnh nếu lỗi
                    print(f"[FORWARD] Fallback sang gửi từng ảnh...")
                    for idx, item in enumerate(image_paths):
                         self.sendLocalImage(item["path"], dest_id, thread_type)
                         time.sleep(1.0)
            else:
                print("[FORWARD] Không có ảnh để gửi.")
        
        finally:
            # Xóa file tạm
            for item in image_paths:
                try:
                    if os.path.exists(item["path"]):
                        os.remove(item["path"])
                except:
                    pass
    
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
                    self.send(Message(text=text), dest_id, ThreadType.GROUP)
                    print(f"[FORWARD] Text: {text[:50]}... → {dest_id}")
            
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
                    self.sendSticker(sticker_type, sticker_id, sticker_cat_id, dest_id, ThreadType.GROUP)
                    print(f"[FORWARD] Sticker → {dest_id}")
        
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
                                confirm_msg = f"✅ Đã set uptime notification cho ID: {target_id}\n🕐 Sẽ gửi thông báo mỗi 10 phút"
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
                            # Load on demand nếu chưa có trong cache
                            if not hasattr(self, 'loaded_rooms_cache') or not hasattr(self, 'room_simple_map'):
                                self._load_rooms_for_ai()
                            
                            # 1. Thử tìm theo số thứ tự (simple_id)
                            room = self.room_simple_map.get(input_id)
                            
                            # 2. Nếu không thấy, thử tìm theo ID gốc (fallback)
                            if not room:
                                room = self.loaded_rooms_cache.get(input_id)
                            
                            # Nếu tìm thấy, lấy thông tin để hiển thị
                            if room:
                                r_id = room.get("id")
                                # Gửi thông tin phòng trước
                                raw_text = room.get("raw_text", "")
                                addr = room.get("address", "")
                                if isinstance(addr, dict): addr = addr.get("full", "")
                                price = room.get("price", "")
                                
                                info_text = f"🏠 THÔNG TIN PHÒNG {r_id}\n"
                                info_text += f"- Địa chỉ: {addr}\n"
                                info_text += f"- Giá: {price} triệu\n"
                                if raw_text:
                                    info_text += f"\n📝 Mô tả:\n{raw_text}"
                                else:
                                    info_text += "\n(Không có mô tả chi tiết)"
                                
                                self.send(Message(text=info_text), thread_id_str, thread_type)
                                time.sleep(0.5) # Delay xíu trước khi gửi ảnh

                                media = room.get("media", [])
                                # SỬA LỖI: media là list url string hoặc dict
                                photos = []
                                for m in media:
                                    if isinstance(m, str):
                                        # Là URL ảnh
                                        photos.append({"url": m, "type": "photo"})
                                    elif isinstance(m, dict) and m.get("type") == "photo":
                                        photos.append(m)
                                
                                if photos:
                                    self.send(Message(text=f"📸 Đang gửi {len(photos)} ảnh..."), thread_id_str, thread_type)
                                    # Chạy gửi ảnh trong thread riêng để ko block
                                    threading.Thread(target=self._send_photos_grouped, args=(photos, thread_id_str, thread_type), daemon=True).start()
                                else:
                                    self.send(Message(text=f"⚠️ Phòng {r_id} không có ảnh."), thread_id_str, thread_type)
                            else:
                                self.send(Message(text=f"❌ Không tìm thấy phòng có ID: {r_id}"), thread_id_str, thread_type)
                        except Exception as e:
                            self.send(Message(text=f"❌ Lỗi: {e}"), thread_id_str, thread_type)
                    else:
                        self.send(Message(text="❌ Sử dụng: !showanh <room_id>"), thread_id_str, thread_type)
                    return # Stop processing
            
            
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
                        print(f"[AI] Đang xử lý tin nhắn: {message[:20]}...")
                        ai_reply = self._call_qwen_api(message)
                        if ai_reply:
                            # Gửi tin nhắn text (AI trả lời)
                            self.send(Message(text=ai_reply), thread_id_str, thread_type)
                            print(f"[AI] Reply text -> {thread_id_str}")
                            
                            # Forward câu trả lời của AI cho Admin
                            self.send(Message(text=f"🤖 [AI Reply]: {ai_reply}"), dest_id, ThreadType.GROUP)
                        else:
                             print(f"[AI] Không có câu trả lời (hoặc lỗi)")
                    
                    threading.Thread(target=handle_ai_reply, daemon=True).start()


            
        except Exception as e:
            print(f"[ERROR] {e}")


if __name__ == "__main__":
    print("🚀 Khởi động NTK Bot (1:1 Forward với Group Layout)...")
    
    while True:
        bot = None
        try:
            bot = NTKBot(API_KEY, SECRET_KEY, IMEI, SESSION_COOKIES)
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


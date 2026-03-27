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
import random
import queue
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

from config import API_KEY, SECRET_KEY, ACCOUNTS
from zlapi import ZaloAPI
from zlapi._client import logger as zlapi_logger
from zlapi.models import Message, ThreadType
from colorama import Fore, Style, init
import inspect

init(autoreset=True)

# Monkey-patch zlapi logger to show which account is affected
original_warning = zlapi_logger.warning

def custom_warning(msg, *args, **kwargs):
    if "Another connection is opened" in (msg or ""):
        stack = inspect.stack()
        acc_info = "Unknown"
        for frame_info in stack:
            f_locals = frame_info.frame.f_locals
            caller_self = f_locals.get('self')
            if caller_self and hasattr(caller_self, 'uid'):
                # Cố gắng tìm số điện thoại nếu có
                phone = getattr(caller_self, '_phone_number', '') or getattr(caller_self, 'uid', 'Unknown')
                acc_info = phone
                break
        print(f"{Fore.RED}{Style.BRIGHT}[!] CẢNH BÁO: Tài khoản {acc_info} bị thoát do đăng nhập ở nơi khác!{Style.RESET_ALL}")
    return original_warning(msg, *args, **kwargs)

zlapi_logger.warning = custom_warning

CONFIG_FILE = "khai.txt"
MESSAGE_LOG_FILE = "messages_log.json"


class NTKBot(ZaloAPI):
    def __init__(self, api_key, secret_key, primary_account, secondary_accounts=[]):
        # account structure: {"imei": "...", "session_cookies": {...}}
        super().__init__(api_key, secret_key, imei=primary_account["imei"], session_cookies=primary_account["session_cookies"])
        
        # Lưu lại phone cho dễ log
        self._phone_number = getattr(self._state, '_config', {}).get('phone_number', primary_account.get('phone', 'Primary'))
        
        # Danh sách các bot để gửi tin (bao gồm cả bot chính)
        self.senders = [self]
        for acc in secondary_accounts:
            try:
                bot_secondary = ZaloAPI(api_key, secret_key, imei=acc["imei"], session_cookies=acc["session_cookies"])
                # Thử lấy phone number cho acc phụ
                bot_secondary._phone_number = getattr(bot_secondary._state, '_config', {}).get('phone_number', acc.get('phone', 'Secondary'))
                self.senders.append(bot_secondary)
                print(f"[INIT] Đã thêm acc phụ [{bot_secondary._phone_number}]: {acc['imei'][:10]}...")
            except Exception as e:
                print(f"[INIT] Lỗi thêm acc phụ {acc.get('imei')}: {e}")
        
        # Flag để kiểm tra bot có đang chạy không
        self.is_running = True
        
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
        
        # Sticky Sender sessions: (source_id, author_id) -> {"idx": int, "timestamp": float}
        self.sender_sessions = {}
        self.session_lock = threading.Lock()
        self.session_timeout = 15.0  # 15 giây "dính" vào một account
        self.last_assigned_idx = -1  # Khởi tạo để lần đầu tiên sẽ là index 0
        
        # Uptime tracking
        self.start_time = time.time()
        self.uptime_target_id = None
        self.uptime_timer = None
        
        # Message logging (đa luồng) - gom tin nhắn theo session
        self.message_queue = queue.Queue()
        self.log_thread = None
        self.log_buffers = {}  # {(source_id, author_id): {"messages": [], "timer": Timer, ...}}
        self.log_buffer_lock = threading.Lock()
        self.log_buffer_timeout = 3.0  # 3 giây để gom tin nhắn
        self._start_message_logger()

    def get_random_sender_info(self):
        """Lấy ngẫu nhiên một instance bot và index của nó"""
        idx = random.randrange(len(self.senders))
        return self.senders[idx], idx

    def _get_sticky_sender_info(self, source_id, author_id):
        """Lấy sender 'dính' cho user trong session, hoặc xoay vòng (Round Robin) chọn mới"""
        session_key = (source_id, author_id)
        current_time = time.time()
        
        with self.session_lock:
            if session_key in self.sender_sessions:
                session = self.sender_sessions[session_key]
                # Nếu còn trong hạn timeout, dùng lại đúng acc cũ
                if current_time - session["timestamp"] < self.session_timeout:
                    session["timestamp"] = current_time
                    idx = session["idx"]
                    return self.senders[idx], idx
            
            # Nếu chưa có hoặc hết hạn, thực hiện xoay vòng (Round Robin)
            self.last_assigned_idx = (self.last_assigned_idx + 1) % len(self.senders)
            idx = self.last_assigned_idx
            
            self.sender_sessions[session_key] = {
                "idx": idx,
                "timestamp": current_time
            }
            return self.senders[idx], idx
    
    def _start_message_logger(self):
        """Khởi động thread để ghi log tin nhắn vào JSON file (đa luồng)"""
        def logger_worker():
            while self.is_running:
                try:
                    # Đợi tin nhắn từ queue với timeout để có thể dừng thread
                    try:
                        msg_data = self.message_queue.get(timeout=1.0)
                    except queue.Empty:
                        continue
                    
                    # Đọc file hiện tại hoặc tạo mới
                    messages = []
                    if os.path.exists(MESSAGE_LOG_FILE):
                        try:
                            with open(MESSAGE_LOG_FILE, "r", encoding="utf-8") as f:
                                messages = json.load(f)
                        except (json.JSONDecodeError, IOError):
                            messages = []
                    
                    # Thêm tin nhắn mới (đã gom sẵn)
                    messages.append(msg_data)
                    
                    # Ghi lại file
                    with open(MESSAGE_LOG_FILE, "w", encoding="utf-8") as f:
                        json.dump(messages, f, ensure_ascii=False, indent=2)
                    
                    self.message_queue.task_done()
                    msg_count = len(msg_data.get("messages", []))
                    print(f"[LOG] Đã lưu {msg_count} tin nhắn gom vào {MESSAGE_LOG_FILE}")
                    
                except Exception as e:
                    print(f"[LOG] Lỗi ghi log: {e}")
            
            print("[LOG] Logger thread kết thúc")
        
        self.log_thread = threading.Thread(target=logger_worker, daemon=True, name="MessageLogger")
        self.log_thread.start()
        print("[LOG] Đã khởi động message logger thread")
    
    def _flush_log_buffer(self, buffer_key):
        """Ghi log buffer đã gom vào queue để lưu file"""
        with self.log_buffer_lock:
            if buffer_key not in self.log_buffers:
                return
            buffer = self.log_buffers.pop(buffer_key)
        
        source_id, author_id = buffer_key
        messages = buffer.get("messages", [])
        dest_id = buffer.get("dest_id", "")
        
        if not messages:
            return
        
        # Tạo record gom
        log_entry = {
            "timestamp": buffer.get("start_time", datetime.now().isoformat()),
            "source_id": source_id,
            "author_id": author_id,
            "dest_id": dest_id,
            "messages": messages
        }
        
        try:
            self.message_queue.put_nowait(log_entry)
        except Exception as e:
            print(f"[LOG] Lỗi đưa log gom vào queue: {e}")
    
    def _log_message(self, msg_type, source_id, author_id, dest_id, content_data):
        """Gom tin nhắn vào buffer theo session, sau timeout sẽ lưu 1 record"""
        buffer_key = (source_id, author_id)
        
        with self.log_buffer_lock:
            if buffer_key not in self.log_buffers:
                self.log_buffers[buffer_key] = {
                    "messages": [],
                    "dest_id": dest_id,
                    "start_time": datetime.now().isoformat(),
                    "timer": None
                }
            
            buffer = self.log_buffers[buffer_key]
            
            # Tạo message entry
            msg_entry = {"type": msg_type}
            msg_entry.update(content_data)
            buffer["messages"].append(msg_entry)
            
            # Reset timer
            if buffer.get("timer"):
                buffer["timer"].cancel()
            
            timer = threading.Timer(
                self.log_buffer_timeout,
                self._flush_log_buffer,
                args=(buffer_key,)
            )
            timer.start()
            buffer["timer"] = timer
    
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
            
            # Gửi tin nhắn - dùng random sender
            sender = self.get_random_sender()
            sender.send(Message(text=uptime_msg), self.uptime_target_id, ThreadType.USER)
            print(f"[UPTIME] Đã gửi bởi {getattr(sender, '_imei', 'unknown')[:8]}: {uptime_msg} → {self.uptime_target_id}")
            
        except Exception as e:
            print(f"[UPTIME] Lỗi gửi thông báo: {e}")
        
        # Đặt lịch gửi tiếp theo sau 10 phút
        if self.is_running and self.uptime_target_id:
            self.uptime_timer = threading.Timer(400, self._send_uptime_notification)  # 600s = 10 phút
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
        self.uptime_timer = threading.Timer(400, self._send_uptime_notification)
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
                        if not restart_pending:
                            # Bắt đầu đếm thời gian restart
                            restart_pending = True
                            restart_wait_start = current_time
                            print(f"[HEARTBEAT] ⚠️ 5 phút không có tin nhắn, chuẩn bị restart...")
                            print(f"[HEARTBEAT] Đợi thêm 1 phút sau tin cuối để đảm bảo xử lý xong...")
                        else:
                            # Đang đợi restart
                            time_waiting = current_time - restart_wait_start
                            
                            # Kiểm tra có đang xử lý gì không
                            if buffers_active > 0:
                                # Có buffer đang xử lý → reset đợi
                                print(f"[HEARTBEAT] Có {buffers_active} buffer đang xử lý, đợi...")
                                restart_wait_start = current_time  # Reset thời gian đợi
                            elif time_waiting >= 60:  # Đã đợi thêm 1 phút và không có gì đang xử lý
                                print(f"[HEARTBEAT] 🔄 RESTART: Đã đợi đủ 1 phút, không có tin đang xử lý, restart bot...")
                                self._cleanup()  # Dọn dẹp trước khi restart
                                self.is_running = False
                                break
                            else:
                                print(f"[HEARTBEAT] Đợi restart: {int(time_waiting)}/60 giây...")
                    else:
                        # Có tin nhắn gần đây
                        if restart_pending:
                            print(f"[HEARTBEAT] ✓ Có tin nhắn mới, hủy restart")
                            restart_pending = False
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
                    outputs_raw = parts[1].strip()
                    if input_id and outputs_raw:
                        # Parse danh sách ID đầu ra: id1,id2...
                        output_ids = [o.strip() for o in outputs_raw.split(",")]
                        self.routing_map[input_id] = output_ids
                        print(f"[CONFIG] Route: {input_id} → {output_ids}")
        
        print(f"[CONFIG] Đã load {len(self.routing_map)} route(s)")
    
    def _safe_int(self, value, default):
        """Chuyển sang int an toàn"""
        try:
            return int(value)
        except Exception:
            return default
    
    def _flush_media_buffer(self, buffer_key):
        """Gửi tất cả tin nhắn, ảnh, video, sticker trong buffer"""
        if not self.is_running:
            return
        
        with self.buffer_lock:
            if buffer_key not in self.media_buffers:
                return
            buffer = self.media_buffers.pop(buffer_key)
        
        source_id = buffer.get("source_id")
        author_id = buffer.get("author_id")
        sender_idx = buffer.get("sender_idx", 0)
        photos = buffer.get("photos", [])
        videos = buffer.get("videos", [])
        
        if not source_id:
            return
        
        # Sử dụng sender đã được định danh cho batch này
        sender = self.senders[sender_idx]
        dest_ids = self.routing_map.get(source_id, [])
        if not dest_ids:
            return
        dest_id = dest_ids[sender_idx] if sender_idx < len(dest_ids) else dest_ids[0]

        print(f"[FLUSH] Batch từ {source_id} bởi {getattr(sender, '_phone_number', 'Acc')} → {dest_id}")
        
        # Tải và gửi ảnh (vẫn giữ logic group layout nhưng dùng cố định 1 sender)
        if photos:
            photos.sort(key=lambda x: x.get("timestamp", 0))
            self._send_media_batch(sender, dest_id, photos, "photo")
            
        # Tải và gửi video
        if videos:
            videos.sort(key=lambda x: x.get("timestamp", 0))
            self._send_media_batch(sender, dest_id, videos, "video")
    
    def _send_media_batch(self, sender, dest_id, items, media_type):
        """Gửi lô ảnh/video bằng một sender cố định"""
        if media_type == "photo":
            image_items = self._download_photos_parallel(items)
            if not image_items: return
            
            group_layout_id = str(int(time.time() * 1000))
            total = len(image_items)
            
            for idx, item in enumerate(image_items):
                try:
                    upload_result = sender._uploadImage(item["path"], dest_id, ThreadType.GROUP)
                    if not upload_result.get("normalUrl"): continue
                    
                    payload = {"params": {
                        "photoId": upload_result.get("photoId", int(time.time()*2000)),
                        "clientId": upload_result.get("clientFileId", int(time.time()*1000)),
                        "desc": "", "width": item["width"], "height": item["height"],
                        "groupLayoutId": group_layout_id, "totalItemInGroup": total,
                        "isGroupLayout": 1, "idInGroup": idx, 
                        "rawUrl": upload_result["normalUrl"],
                        "thumbUrl": upload_result.get("thumbUrl", upload_result["normalUrl"]),
                        "hdUrl": upload_result.get("hdUrl", upload_result["normalUrl"]),
                        "imei": getattr(sender, "_imei", ""), "grid": str(dest_id), "oriUrl": upload_result["normalUrl"],
                        "jcp": json.dumps({"sendSource": 1, "convertible": "jxl"})
                    }}
                    sender.sendLocalImage(item["path"], dest_id, ThreadType.GROUP, width=item["width"], height=item["height"], custom_payload=payload)
                    os.remove(item["path"])
                except: pass
            print(f"[FORWARD] {total} ảnh (grouped) bởi {getattr(sender, '_phone_number', 'Acc')} → {dest_id}")
            
        elif media_type == "video":
            for v in items:
                try:
                    sender.sendRemoteVideo(
                        v["url"], v.get("thumb") or v["url"],
                        v.get("duration", 1000), dest_id, ThreadType.GROUP,
                        width=v.get("width", 1280), height=v.get("height", 720)
                    )
                    print(f"[FORWARD] Video bởi {getattr(sender, '_phone_number', 'Acc')} → {dest_id}")
                except: pass

    def _download_photos_parallel(self, photos):
        """Tải các ảnh trong list song song và trả về danh sách local path"""
        def download_one(idx, photo):
            url = photo.get("url")
            if not url: return None
            try:
                resp = requests.get(url, stream=True, timeout=15)
                resp.raise_for_status()
                path = f"temp_fl_{int(time.time()*1000)}_{idx}.jpg"
                with open(path, "wb") as f:
                    for chunk in resp.iter_content(8192): f.write(chunk)
                return {"idx": idx, "path": path, "width": photo.get("width", 2560), "height": photo.get("height", 2560)}
            except: return None

        results = []
        futures = [self.executor.submit(download_one, i, p) for i, p in enumerate(photos)]
        for f in as_completed(futures):
            res = f.result()
            if res: results.append(res)
        results.sort(key=lambda x: x["idx"])
        return results
    
    
    def _add_to_buffer(self, source_id, author_id, media_type, media_data):
        """Thêm ảnh/video vào buffer để gom lại"""
        if not self.is_running:
            return
        
        buffer_key = (source_id, author_id)
        
        with self.buffer_lock:
            if buffer_key not in self.media_buffers:
                # Lấy sticky sender ngay lúc bắt đầu batch
                sender_obj, sender_idx = self._get_sticky_sender_info(source_id, author_id)
                
                self.media_buffers[buffer_key] = {
                    "photos": [],
                    "videos": [],
                    "source_id": source_id,
                    "author_id": author_id,
                    "sender_idx": sender_idx,
                    "timer": None,
                }
            
            buffer = self.media_buffers[buffer_key]
            media_data["timestamp"] = time.time()
            
            if media_type == "photo": buffer["photos"].append(media_data)
            elif media_type == "video": buffer["videos"].append(media_data)
            
            if buffer.get("timer"):
                buffer["timer"].cancel()
            
            timer = threading.Timer(
                self.buffer_timeout,
                self._flush_media_buffer,
                args=(buffer_key,)
            )
            timer.start()
            buffer["timer"] = timer
            
            total = len(buffer["photos"]) + len(buffer["videos"])
            print(f"[BUFFER] {media_type} từ {author_id} (Batch media: {total})")
    
    def _forward_message(self, message, message_object, source_id, author_id):
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
            
            # Text message - Gửi ngay (Sticky)
            if msg_type == "webchat" or (isinstance(message, str) and message and msg_type not in ["chat.photo", "chat.video", "chat.video.msg", "chat.sticker"]):
                text = message if isinstance(message, str) else ""
                if not text:
                    if isinstance(content, str): text = content
                    elif isinstance(content, dict): text = content.get("text", "") or content.get("title", "")
                
                if text:
                    sender, s_idx = self._get_sticky_sender_info(source_id, author_id)
                    dest_ids = self.routing_map.get(source_id, [])
                    if dest_ids:
                        dest_id = dest_ids[s_idx] if s_idx < len(dest_ids) else dest_ids[0]
                        sender.send(Message(text=text), dest_id, ThreadType.GROUP)
                        print(f"[FORWARD] Text (Sticky) bởi {getattr(sender, '_phone_number', 'Acc')} → {dest_id}")
                        # Log tin nhắn text
                        self._log_message("text", source_id, author_id, dest_id, {"text": text})
            
            # Photo - gom vào buffer
            elif msg_type == "chat.photo":
                photo_url = content.get("hd") or content.get("href")
                if photo_url:
                    width = self._safe_int(params.get("width"), 2560)
                    height = self._safe_int(params.get("height"), 2560)
                    self._add_to_buffer(source_id, author_id, "photo", {"url": photo_url, "width": width, "height": height})
                    # Log tin nhắn ảnh
                    dest_ids = self.routing_map.get(source_id, [])
                    dest_id = dest_ids[0] if dest_ids else ""
                    self._log_message("photo", source_id, author_id, dest_id, {
                        "url": photo_url, "width": width, "height": height
                    })
            
            # Video - gom vào buffer
            elif msg_type in ["chat.video", "chat.video.msg"]:
                video_url = content.get("href")
                if video_url:
                    video_data = {
                        "url": video_url, "thumb": content.get("thumb") or content.get("hd"),
                        "duration": self._safe_int(params.get("duration"), 1000),
                        "width": self._safe_int(params.get("width"), 1280),
                        "height": self._safe_int(params.get("height"), 720)
                    }
                    self._add_to_buffer(source_id, author_id, "video", video_data)
                    # Log tin nhắn video
                    dest_ids = self.routing_map.get(source_id, [])
                    dest_id = dest_ids[0] if dest_ids else ""
                    self._log_message("video", source_id, author_id, dest_id, video_data)
            
            # Sticker - gửi ngay (Sticky)
            elif msg_type == "chat.sticker":
                if content.get("id") and content.get("catId"):
                    sender, s_idx = self._get_sticky_sender_info(source_id, author_id)
                    dest_ids = self.routing_map.get(source_id, [])
                    if dest_ids:
                        dest_id = dest_ids[s_idx] if s_idx < len(dest_ids) else dest_ids[0]
                        sender.sendSticker(content.get("type", 3), content.get("id"), content.get("catId"), dest_id, ThreadType.GROUP)
                        print(f"[FORWARD] Sticker (Sticky) bởi {getattr(sender, '_phone_number', 'Acc')} → {dest_id}")
                        # Log tin nhắn sticker
                        self._log_message("sticker", source_id, author_id, dest_id, {
                            "type": content.get("type", 3),
                            "id": content.get("id"),
                            "catId": content.get("catId")
                        })
        
        except Exception as e:
            print(f"[FORWARD] Lỗi: {e}")
    
    def onMessage(self, mid, author_id, message, message_object, thread_id, thread_type):
        """Xử lý tin nhắn đến"""
        # Cập nhật thời gian tin nhắn cuối (cho heartbeat)
        self.last_message_time = time.time()
        
        try:
            thread_id_str = str(thread_id)
            author_id_str = str(author_id)
            
            # Log
            msg_type = getattr(message_object, "msgType", "")
            msg_preview = str(message)[:50] if message else msg_type
            print(f"{Fore.GREEN}[MSG] {thread_id}: {msg_preview}...{Style.RESET_ALL}")
            
            # Xử lý lệnh !set
            if isinstance(message, str) and message.strip().startswith("!set"):
                parts = message.strip().split(maxsplit=1)
                if len(parts) == 2:
                    target_id = parts[1].strip()
                    if target_id:
                        # Bắt đầu uptime notifications
                        self._start_uptime_notifications(target_id)
                        
                        # Gửi xác nhận - dùng chính bot này để trả lời lệnh
                        try:
                            confirm_msg = f"✅ Đã set uptime notification cho ID: {target_id}\n🕐 Sẽ gửi thông báo mỗi 10 phút"
                            self.send(Message(text=confirm_msg), thread_id_str, ThreadType.GROUP)
                            print(f"[CMD] Đã set uptime target: {target_id}")
                        except Exception as e:
                            print(f"[CMD] Lỗi gửi xác nhận: {e}")
                else:
                    # Thiếu ID
                    try:
                        self.send(Message(text="❌ Sử dụng: !set <zalo_id>"), thread_id_str, ThreadType.GROUP)
                    except:
                        pass
                return  # Không forward lệnh !set
            
            # Kiểm tra có route không
            if thread_id_str in self.routing_map:
                self._forward_message(message, message_object, thread_id_str, author_id_str)
            
        except Exception as e:
            print(f"[ERROR] {e}")


if __name__ == "__main__":
    print("🚀 Khởi động NTK Bot (1:1 Forward với Group Layout)...")
    
    while True:
        bot = None
        try:
            if not ACCOUNTS:
                print("[MAIN] ❌ Không có account nào trong config.py")
                break
                
            primary = ACCOUNTS[0]
            secondaries = ACCOUNTS[1:]
            
            bot = NTKBot(API_KEY, SECRET_KEY, primary, secondaries)
            print(f"[MAIN] Đã kết nối với nick chính: {getattr(bot, '_phone_number', 'Unknown')}")
            print("[MAIN] Bắt đầu listen...")
            
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


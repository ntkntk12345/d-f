import os
import sys
import time
import json
import re
import queue
import threading
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from config import API_KEY, SECRET_KEY, IMEI, SESSION_COOKIES
from zlapi import ZaloAPI
from zlapi.models import Message, ThreadType
from colorama import Fore, Style, init

init(autoreset=True)


INPUT_GROUPS_FILE = "dauvao.txt"
OUTPUT_GROUPS_FILE = "daura.txt"
KEYWORDS_FILE = "key.txt"


class Client(ZaloAPI):
    def __init__(self, api_key, secret_key, imei, session_cookies):
        super().__init__(api_key, secret_key, imei=imei, session_cookies=session_cookies)

        # Cấu hình route tin nhắn từ file
        self.input_groups = set()  # danh sách nhóm đầu vào (id hoặc tên)
        self.input_group_tags = {}  
        self.output_groups_raw = []  # danh sách nhóm đầu ra (tên hoặc id)
        self.district_names = []  # danh sách tên quận/huyện (dòng không có "|")
        self.keywords = []  # danh sách keyword
        self.keyword_to_output_target = {}  # keyword -> tên nhóm / id nhóm đầu ra
        self.group_name_cache = {}  # name (lower) -> group_id
        self.group_id_to_name_cache = {}  # group_id -> group_name (cache để tránh fetch mỗi lần)
        self.group_cache_lock = threading.Lock()  # Lock cho cache
        self._load_routing_config()
        
        # Buffer system với session-based - tách theo (group_id, user_id)
        # { (group_id, user_id): {
        #     "current_keyword": str hoặc None (keyword hiện tại của session)
        #     "current_dest_id": str hoặc None (dest_id của session hiện tại)
        #     "session_start_time": float (thời gian bắt đầu session)
        #     "session_texts": [{"text": str, "timestamp": float}],  # Texts thuộc session hiện tại
        #     "session_media": [{"type": "photo"/"video", "data": {...}, "timestamp": float}],  # Media thuộc session hiện tại
        #     "last_event_time": float,
        #     "timeout_timer": Timer (10s timeout)
        # } }
        self.buffers = {}
        self.buffer_locks = {}  # Lock cho mỗi buffer để thread-safe
        self.session_timeout = 10.0  # 10 giây timeout cho session
        self.flush_queue = queue.Queue()  # Queue để xử lý tuần tự các buffer đang chờ flush
        self.flush_worker_running = False
        self.message_log_file = "message_log.json"  # File JSON để lưu tất cả tin nhắn
        
        # Queue system để đảm bảo gửi tuần tự theo nhóm đầu ra
        # { dest_group_id: queue.Queue() }
        self.send_queues = {}
        self.worker_threads = {}  # Worker thread per dest_group_id
        self.executor = ThreadPoolExecutor(max_workers=20)  # Thread pool để tải ảnh/video song song và xử lý flush buffer
        self.flush_executor = ThreadPoolExecutor(max_workers=10)  # Thread pool riêng để flush buffer song song
        self.sticker_sent = set()  # Track đã gửi sticker cho (dest_id, session_id) để tránh gửi lại
        self.last_keyword_per_dest = {}  # Track keyword cuối cùng cho mỗi dest_id: {dest_id: keyword}
        
        # Heartbeat để theo dõi bot có đang hoạt động
        self.last_message_time = time.time()  # Thời gian nhận tin nhắn cuối cùng
        self.heartbeat_thread = None
        self._start_heartbeat()
    
    def _start_heartbeat(self):
        """Khởi động thread heartbeat để kiểm tra bot có đang hoạt động."""
        def heartbeat_worker():
            consecutive_warnings = 0
            while True:
                try:
                    time.sleep(60)  # Check mỗi 60 giây
                    current_time = time.time()
                    time_since_last = current_time - self.last_message_time
                    
                    if time_since_last > 300:  # 5 phút không có tin nhắn
                        consecutive_warnings += 1
                        print(f"[HEARTBEAT] ⚠️ Cảnh báo ({consecutive_warnings}): Không nhận tin nhắn trong {int(time_since_last)} giây")
                        print(f"[HEARTBEAT] Số buffer đang chờ: {len(self.buffers)}")
                        print(f"[HEARTBEAT] Số queue đang hoạt động: {len(self.send_queues)}")
                        
                        # Nếu quá 15 phút không có tin nhắn, có thể connection bị mất
                        if time_since_last > 900:  # 15 phút
                            print(f"[HEARTBEAT] ⚠️⚠️⚠️ CẢNH BÁO NGHIÊM TRỌNG: Không nhận tin nhắn trong {int(time_since_last)} giây!")
                            print(f"[HEARTBEAT] Có thể connection bị mất, kiểm tra lại...")
                            # Thử kiểm tra connection
                            try:
                                test_groups = self.fetchAllGroups()
                                if test_groups:
                                    print(f"[HEARTBEAT] Connection vẫn OK, có thể không có tin nhắn mới")
                                else:
                                    print(f"[HEARTBEAT] ⚠️ Không lấy được danh sách nhóm, connection có thể bị mất")
                            except Exception as conn_e:
                                print(f"[HEARTBEAT] ⚠️ Lỗi kiểm tra connection: {conn_e}")
                            
                            # Nếu quá 1380 giây (23 phút) không có tin nhắn → reboot lại
                            if time_since_last > 1380:  # 23 phút
                                print(f"[HEARTBEAT] 🔄 REBOOT: Không nhận tin nhắn trong {int(time_since_last)} giây, reboot lại bot...")
                                try:
                                    self.is_running = False  # Trigger restart
                                    print(f"[HEARTBEAT] Đã set is_running = False, bot sẽ restart...")
                                except Exception as reboot_e:
                                    print(f"[HEARTBEAT] Lỗi khi trigger reboot: {reboot_e}")
                    else:
                        if consecutive_warnings > 0:
                            print(f"[HEARTBEAT] ✓ Bot đã hoạt động lại (tin nhắn cuối: {int(time_since_last)}s trước)")
                            consecutive_warnings = 0
                        else:
                            print(f"[HEARTBEAT] ✓ Bot đang hoạt động (tin nhắn cuối: {int(time_since_last)}s trước)")
                except Exception as e:
                    print(f"[HEARTBEAT] Lỗi heartbeat: {e}")
                    import traceback
                    print(f"[HEARTBEAT] Traceback: {traceback.format_exc()}")
        
        self.heartbeat_thread = threading.Thread(target=heartbeat_worker, daemon=True, name="Heartbeat")
        self.heartbeat_thread.start()
        print(f"[HEARTBEAT] Đã khởi động heartbeat thread")

    # ====== HÀM HỖ TRỢ ROUTING ======
    def _load_lines(self, path):
        if not os.path.exists(path):
            return []
        with open(path, "r", encoding="utf-8-sig") as f:  # utf-8-sig tự động loại bỏ BOM
            return [line.strip() for line in f.readlines() if line.strip()]

    def _load_routing_config(self):
        # Nhóm đầu vào: mỗi dòng có thể là ID hoặc tên nhóm, kèm tag: "Group Name|TAG"
        self.input_groups = set()
        self.input_group_tags = {}
        for line in self._load_lines(INPUT_GROUPS_FILE):
            parts = [p.strip() for p in line.split("|", 1)]
            base = parts[0] if parts else ""
            tag = parts[1] if len(parts) > 1 else ""
            if base:
                self.input_groups.add(base)
                if tag:
                    self.input_group_tags[base.lower()] = tag
        print(f"[CONFIG] Đã load {len(self.input_groups)} nhóm đầu vào: {self.input_groups}")
        print(f"[CONFIG] Đã load {len(self.input_group_tags)} tag: {self.input_group_tags}")

        # Nhóm đầu ra: dùng để xác định nơi gửi
        self.output_groups_raw = self._load_lines(OUTPUT_GROUPS_FILE)
        # Các dòng KHÔNG có "|" được coi là tên quận/huyện
        self.district_names = [line for line in self.output_groups_raw if "|" not in line]

        # Keyword: mỗi dòng là một keyword (vd: haiha)
        # Load keywords và normalize để match
        raw_keywords = self._load_lines(KEYWORDS_FILE)
        self.keywords = []
        self.keywords_normalized_map = {}  # normalized -> original keyword
        for k in raw_keywords:
            if k:
                k_norm = self._normalize_for_match(k)
                self.keywords.append(k)  # Giữ keyword gốc
                if k_norm:
                    self.keywords_normalized_map[k_norm] = k

        # Mapping keyword -> đích đầu ra
        # Ưu tiên: nếu có dòng "keyword|group_id_or_name" trong daura.txt
        self.keyword_to_output_target = {}
        for line in self.output_groups_raw:
            if "|" in line:
                kw, target = [p.strip() for p in line.split("|", 1)]
                if kw:
                    # Lưu cả keyword gốc và normalized
                    kw_norm = self._normalize_for_match(kw)
                    self.keyword_to_output_target[kw.lower()] = target
                    if kw_norm:
                        self.keyword_to_output_target[kw_norm] = target

        # Nếu chưa có mapping rõ ràng, mặc định keyword trùng tên nhóm đầu ra
        for kw in self.keywords:
            kw_lower = kw.lower()
            kw_norm = self._normalize_for_match(kw)
            if kw_lower not in self.keyword_to_output_target and kw_norm not in self.keyword_to_output_target:
                # Tìm đúng tên (phân biệt hoa thường) trong file daura
                for name in self.output_groups_raw:
                    if "|" not in name:  # Chỉ lấy tên nhóm, không lấy mapping
                        name_norm = self._normalize_for_match(name)
                        if name.lower() == kw_lower or name_norm == kw_norm:
                            self.keyword_to_output_target[kw_lower] = name
                            if kw_norm:
                                self.keyword_to_output_target[kw_norm] = name
                            break

    def _build_group_name_cache(self):
        """
        Tạo cache name -> id cho tất cả nhóm đã tham gia.
        Có thể hơi chậm lần đầu, nên chỉ gọi khi cần.
        """
        if self.group_name_cache:
            return
        
        print(f"[CACHE] Đang build cache group name -> id...")
        try:
            all_groups = self.fetchAllGroups()
            group_ids = list(all_groups.gridVerMap.keys())
            print(f"[CACHE] Tìm thấy {len(group_ids)} nhóm")
            
            for gid in group_ids:
                try:
                    info = self.fetchGroupInfo(gid)
                    name = info.gridInfoMap.get(gid, {}).get("name", None)
                    if name:
                        # Lưu cả tên gốc (lowercase) và normalized
                        name_lower = name.lower()
                        name_norm = self._normalize_for_match(name)
                        self.group_name_cache[name_lower] = gid
                        if name_norm and name_norm != name_lower:
                            self.group_name_cache[name_norm] = gid
                except Exception as e:
                    continue
            
            print(f"[CACHE] Đã build cache với {len(self.group_name_cache)} entries")
        except Exception as e:
            print(f"[CACHE] Lỗi build cache: {e}")
            import traceback
            print(f"[CACHE] Traceback: {traceback.format_exc()}")

    def _resolve_output_thread_id(self, target_name_or_id):
        """
        Nhận vào 1 chuỗi: nếu là ID thì trả luôn,
        nếu là tên nhóm thì map sang ID bằng cache.
        """
        if not target_name_or_id:
            return None
        
        # Nếu là ID (toàn số, khá dài)
        if str(target_name_or_id).isdigit():
            print(f"[RESOLVE] Target '{target_name_or_id}' là ID, trả về trực tiếp")
            return str(target_name_or_id)

        # Tên nhóm -> ID
        self._build_group_name_cache()
        
        # Thử tìm với tên gốc (lowercase)
        target_lower = str(target_name_or_id).lower()
        gid = self.group_name_cache.get(target_lower)
        if gid:
            print(f"[RESOLVE] Tìm thấy group_id '{gid}' cho target '{target_name_or_id}' (key: '{target_lower}')")
            return gid
        
        # Thử tìm với normalized (bỏ dấu)
        target_norm = self._normalize_for_match(target_name_or_id)
        for name, group_id in self.group_name_cache.items():
            name_norm = self._normalize_for_match(name)
            if name_norm == target_norm:
                print(f"[RESOLVE] Tìm thấy group_id '{group_id}' cho target '{target_name_or_id}' (normalized match: '{name}' -> '{name_norm}')")
                return group_id
        
        # Thử tìm trong output_groups_raw (có thể target là tên trong file daura.txt)
        for output_name in self.output_groups_raw:
            if "|" not in output_name:  # Chỉ lấy tên nhóm, không lấy mapping
                if output_name.lower() == target_lower or self._normalize_for_match(output_name) == target_norm:
                    # Tìm group_id từ cache với tên này
                    gid = self.group_name_cache.get(output_name.lower())
                    if gid:
                        print(f"[RESOLVE] Tìm thấy group_id '{gid}' cho target '{target_name_or_id}' (từ output_groups_raw: '{output_name}')")
                        return gid
        
        print(f"[RESOLVE] Không tìm thấy group_id cho target '{target_name_or_id}'")
        print(f"[RESOLVE] Cache có {len(self.group_name_cache)} nhóm: {list(self.group_name_cache.keys())[:10]}...")
        return None


    def _safe_int(self, value, default):
        """Chuyển sang int an toàn, tránh ValueError/TypeError làm crash bot."""
        try:
            return int(value)
        except Exception:
            return default

    def _get_or_create_buffer(self, group_id, user_id):
        """Lấy hoặc tạo buffer cho (group_id, user_id)."""
        buffer_key = (group_id, user_id)
        if buffer_key not in self.buffers:
            self.buffers[buffer_key] = {
                "current_keyword": None,  # Keyword hiện tại của session
                "current_dest_id": None,  # Dest_id hiện tại của session
                "session_start_time": None,  # Thời gian bắt đầu session
                "session_texts": [],  # Texts thuộc session hiện tại
                "session_media": [],  # Media thuộc session hiện tại
                "last_event_time": time.time(),
                "timeout_timer": None,
                "is_flushing": False,  # Flag để tránh flush 2 lần
                "is_flushed": False,  # Flag để đánh dấu đã flush
                "last_flush_time": 0,  # Thời gian flush lần cuối (để check ảnh đến sau flush)
                "last_flush_keyword": None,  # Keyword của session vừa flush (để tạo lại nếu cần)
                "last_flush_dest_id": None,  # Dest_id của session vừa flush (để tạo lại nếu cần)
            }
            self.buffer_locks[buffer_key] = threading.Lock()
        return self.buffers[buffer_key], self.buffer_locks[buffer_key]
    
    def _cleanup_buffer(self, buffer_key):
        """Xóa buffer và timer."""
        if buffer_key in self.buffers:
            buffer = self.buffers[buffer_key]
            if buffer.get("timeout_timer"):
                try:
                    buffer["timeout_timer"].cancel()
                except Exception:
                    pass
            del self.buffers[buffer_key]
        if buffer_key in self.buffer_locks:
            del self.buffer_locks[buffer_key]

    def _get_or_create_queue(self, dest_id):
        """Lấy hoặc tạo queue cho dest_id (đầu ra) và đảm bảo có worker thread."""
        if dest_id not in self.send_queues:
            self.send_queues[dest_id] = queue.Queue()
            self.queue_locks[dest_id] = threading.Lock()
            # Tạo worker thread để xử lý queue tuần tự
            worker = threading.Thread(
                target=self._queue_worker,
                args=(dest_id,),
                daemon=True,
                name=f"QueueWorker-{dest_id}"
            )
            worker.start()
            self.worker_threads[dest_id] = worker
        return self.send_queues[dest_id]

    def _queue_worker(self, dest_id):
        """Worker thread xử lý queue tuần tự cho 1 dest_id (đầu ra)."""
        q = self.send_queues[dest_id]
        session_counter = 0  # Đếm session để gửi sticker
        
        while True:
            try:
                # Đợi task từ queue (blocking)
                task = q.get(timeout=10)  # Timeout 10 giây, nếu không có task thì kiểm tra lại
                if task is None:  # Signal để dừng
                    break
                try:
                    task_type = task.get("type")
                    
                    if task_type == "text":
                        # Không gửi sticker ở đây nữa - chỉ gửi khi có keyword mới
                        # Sau đó mới gửi text (đã format: thêm tag và xóa emoji)
                        try:
                            source_group_id = task.get("source_group_id")
                            source_group_name = task.get("source_group_name")  # Có thể không có
                            formatted_text = self._format_text(task["text"], source_group_id, source_group_name)
                            
                            if formatted_text:  # Chỉ gửi nếu còn text sau khi format
                                msg = Message(text=formatted_text)
                                self.send(msg, dest_id, ThreadType.GROUP)
                                print(f"[QUEUE] Đã gửi text từ {source_group_id or '?'} → {dest_id} (tag: {self._get_input_tag(source_group_id, source_group_name) or 'không có'})")
                                # Delay 2 giây sau khi gửi text
                                time.sleep(2)
                            else:
                                print(f"[QUEUE] Text rỗng sau khi format, bỏ qua")
                        except Exception as e:
                            print(f"[QUEUE] Lỗi gửi text tới {dest_id}: {e}")
                    
                    elif task_type == "photo_batch":
                        # Gửi batch ảnh
                        photos = task.get("photos", [])
                        if photos:
                            try:
                                self._send_photos_batch(dest_id, photos)
                                print(f"[QUEUE] Đã gửi {len(photos)} ảnh → {dest_id}")
                                # Delay 2 giây sau khi gửi ảnh
                                time.sleep(2)
                            except Exception as e:
                                print(f"[QUEUE] Lỗi gửi photo_batch tới {dest_id}: {e}")
                    
                    elif task_type == "video_batch":
                        # Gửi batch video
                        videos = task.get("videos", [])
                        if videos:
                            try:
                                self._send_videos_batch(dest_id, videos)
                                print(f"[QUEUE] Đã gửi {len(videos)} video → {dest_id}")
                                # Delay 2 giây sau khi gửi video
                                time.sleep(2)
                            except Exception as e:
                                print(f"[QUEUE] Lỗi gửi video_batch tới {dest_id}: {e}")
                
                except Exception as e:
                    print(f"[QUEUE] Lỗi xử lý task trong queue {dest_id}: {e}")
                    import traceback
                    print(f"[QUEUE] Traceback: {traceback.format_exc()}")
                finally:
                    q.task_done()
            
            except queue.Empty:
                # Timeout, kiểm tra xem có còn cần thiết không
                continue
            except Exception as e:
                print(f"[QUEUE] Lỗi worker thread {dest_id}: {e}")
                time.sleep(1)
    
    def _send_photos_batch(self, dest_id, photos):
        """Gửi batch ảnh theo thứ tự, sử dụng group layout nếu có nhiều ảnh."""
        if not photos:
            return
        
        # Sắp xếp theo id_in_group hoặc timestamp
        photos_sorted = sorted(photos, key=lambda x: x.get("id_in_group", x.get("timestamp", 0)))
        
        # Tải ảnh song song
        image_paths = []
        try:
            for photo in photos_sorted:
                url = photo.get("url")
                if not url:
                    continue
                try:
                    resp = requests.get(url, stream=True, timeout=20)
                    resp.raise_for_status()
                    temp_path = f"temp_forward_photo_{int(time.time() * 1000)}_{hash(url) % 10000}.jpg"
                    with open(temp_path, "wb") as f:
                        for chunk in resp.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                    image_paths.append({
                        "path": temp_path,
                        "width": photo.get("width", 2560),
                        "height": photo.get("height", 2560),
                        "id_in_group": photo.get("id_in_group", len(image_paths)),
                    })
                except Exception as e:
                    print(f"[QUEUE] Lỗi tải ảnh {url[:50]}...: {e}")
            
            if not image_paths:
                return
            
            # Gửi với group layout
            group_layout_id = str(int(time.time() * 1000))
            total_items = len(image_paths)
            
            for idx, item in enumerate(image_paths):
                image_path = item["path"]
                width = item["width"]
                height = item["height"]
                id_in_group = item["id_in_group"]
                
                if not os.path.exists(image_path):
                    continue
                
                try:
                    # Upload ảnh
                    upload_image = self._uploadImage(image_path, dest_id, ThreadType.GROUP)
                    normal_url = upload_image.get("normalUrl", "")
                    thumb_url = upload_image.get("thumbUrl", normal_url)
                    hd_url = upload_image.get("hdUrl", normal_url)
                    
                    # Tạo payload với group layout
                    payload = {
                        "params": {
                            "photoId": upload_image.get("photoId", int(time.time() * 2000)),
                            "clientId": upload_image.get("clientFileId", int(time.time() * 1000)),
                            "desc": "",
                            "width": int(width),
                            "height": int(height),
                            "groupLayoutId": group_layout_id,
                            "totalItemInGroup": total_items,
                            "isGroupLayout": 1,
                            "idInGroup": int(id_in_group),
                            "rawUrl": normal_url,
                            "thumbUrl": thumb_url,
                            "hdUrl": hd_url,
                            "thumbSize": "53932",
                            "fileSize": "247671",
                            "hdSize": "344622",
                            "zsource": -1,
                            "jcp": json.dumps({"sendSource": 1, "convertible": "jxl"}),
                            "ttl": 0,
                            "imei": self._imei,
                            "grid": str(dest_id),
                            "oriUrl": normal_url,
                        }
                    }
                    
                    # Gửi với custom payload
                    self.sendLocalImage(image_path, dest_id, ThreadType.GROUP, width=int(width), height=int(height), custom_payload=payload)
                    
                    # Delay nhỏ giữa các ảnh
                    if idx < total_items - 1:
                        time.sleep(0.1)
                
                except Exception as e:
                    print(f"[QUEUE] Lỗi gửi ảnh {idx+1}/{total_items}: {e}")
        
        finally:
            # Dọn file tạm
            for item in image_paths:
                try:
                    if os.path.exists(item["path"]):
                        os.remove(item["path"])
                except Exception:
                    pass
    
    def _send_videos_batch(self, dest_id, videos):
        """Gửi batch video theo thứ tự."""
        if not videos:
            return
        
        # Sắp xếp theo id_in_group hoặc timestamp
        videos_sorted = sorted(videos, key=lambda x: x.get("id_in_group", x.get("timestamp", 0)))
        
        for video in videos_sorted:
            media_url = video.get("url")
            thumb_url = video.get("thumb")
            duration = video.get("duration", 1000)
            width = self._safe_int(video.get("width"), 1280)
            height = self._safe_int(video.get("height"), 720)
            
            if not media_url:
                continue
            
            try:
                self.sendRemoteVideo(
                    media_url,
                    thumb_url or media_url,
                    duration,
                    dest_id,
                    ThreadType.GROUP,
                    width=int(width),
                    height=int(height),
                )
                print(f"[QUEUE] Đã gửi video (w={width}, h={height}) → {dest_id}")
            except Exception as e:
                print(f"[QUEUE] Lỗi gửi video: {e}")

    def _download_media_parallel(self, urls_with_meta):
        """
        Tải nhiều ảnh/video song song bằng ThreadPoolExecutor.
        urls_with_meta: list of {"url": str, "type": "photo"/"video", "meta": {...}}
        Returns: list of {"path": str, "meta": {...}} hoặc {"url": str, "meta": {...}} cho video
        """
        results = []
        
        def download_one(item):
            url = item["url"]
            item_type = item.get("type", "photo")
            try:
                if not url:
                    return None
                if item_type == "photo":
                    resp = requests.get(url, stream=True, timeout=20)
                    resp.raise_for_status()
                    temp_path = f"temp_forward_photo_{int(time.time() * 1000)}_{hash(url) % 10000}.jpg"
                    with open(temp_path, "wb") as f:
                        for chunk in resp.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                    return {"path": temp_path, "meta": item.get("meta", {})}
                else:  # video - không tải về, giữ URL
                    return {"url": url, "meta": item.get("meta", {})}
            except Exception as e:
                print(f"[DOWNLOAD] Lỗi tải {item_type} từ {url}: {e}")
                return None
        
        # Submit tất cả tasks
        futures = [self.executor.submit(download_one, item) for item in urls_with_meta]
        
        # Đợi tất cả hoàn thành
        for future in as_completed(futures):
            result = future.result()
            if result:
                results.append(result)
        
        return results

    def _send_batch_and_cleanup_sync(self, batch_key, batch):
        """
        Gửi batch media đồng bộ (chạy trong worker thread).
        batch_key: (thread_id, author_id, session_id, group_layout_id)
        """
        image_paths = []
        photo_meta = []
        videos_data = []
        try:
            photos = batch.get("photos", [])
            videos = batch.get("videos", [])
            
            # Sắp xếp photos và videos theo id_in_group để đảm bảo thứ tự đúng (0, 1, 2, ...)
            photos.sort(key=lambda x: x.get("id_in_group", 999999))
            videos.sort(key=lambda x: x.get("id_in_group", 999999))
            
            # Chuẩn bị danh sách để tải song song
            download_items = []
            for item in photos:
                download_items.append({
                    "url": item.get("url"),
                    "type": "photo",
                    "meta": {
                        "width": item.get("width") or 0,
                        "height": item.get("height") or 0,
                        "id_in_group": item.get("id_in_group", 999999)
                    }
                })
            
            # Tải ảnh song song
            if download_items:
                download_results = self._download_media_parallel(download_items)
                # Sắp xếp lại theo id_in_group để giữ thứ tự đúng
                download_results.sort(key=lambda x: x.get("meta", {}).get("id_in_group", 999999))
                
                # Đảm bảo số lượng ảnh tải về khớp với số lượng ảnh cần gửi
                successful_downloads = 0
                for result in download_results:
                    if "path" in result and os.path.exists(result["path"]):
                        image_paths.append(result["path"])
                        photo_meta.append({
                            "width": result["meta"].get("width", 0),
                            "height": result["meta"].get("height", 0),
                            "id_in_group": result["meta"].get("id_in_group", 999999),
                        })
                        successful_downloads += 1
                    else:
                        print(f"[ROUTING] Cảnh báo: Ảnh không tải được, bỏ qua")
                
                if successful_downloads != len(photos):
                    print(f"[ROUTING] Cảnh báo: Chỉ tải được {successful_downloads}/{len(photos)} ảnh")
            
            # Chuẩn bị video data (không cần tải về) - đã sort theo id_in_group ở trên
            for video_item in videos:
                videos_data.append({
                    "url": video_item.get("url"),
                    "thumb": video_item.get("thumb"),
                    "duration": video_item.get("duration", 1000),
                })

            # Gửi tới tất cả dest_ids (có thể là set hoặc list)
            dest_ids = batch.get("dest_ids", [])
            if isinstance(dest_ids, set):
                dest_ids = list(dest_ids)
            for dest in dest_ids:
                if not dest or dest == batch_key[0]:
                    continue
                
                # Tạo danh sách media items gộp cả ảnh và video, sort theo id_in_group
                media_items = []
                # Thêm ảnh vào danh sách (chỉ thêm ảnh đã tải thành công)
                for idx, photo_item in enumerate(photos):
                    if idx < len(image_paths) and image_paths[idx] and os.path.exists(image_paths[idx]):
                        media_items.append({
                            "type": "photo",
                            "id_in_group": photo_item.get("id_in_group", 999999),
                            "image_path": image_paths[idx],
                            "meta": photo_meta[idx] if idx < len(photo_meta) else {"width": photo_item.get("width", 2560), "height": photo_item.get("height", 2560), "id_in_group": photo_item.get("id_in_group", 999999)},
                        })
                    else:
                        print(f"[ROUTING] Cảnh báo: Bỏ qua ảnh {idx+1}/{len(photos)} vì không tải được")
                # Thêm video vào danh sách
                for video_item in videos:
                    video_width = video_item.get("width", 1280)
                    video_height = video_item.get("height", 720)
                    print(f"[ROUTING] Thêm video vào media_items: width={video_width}, height={video_height}, id_in_group={video_item.get('id_in_group', 999999)}")
                    media_items.append({
                        "type": "video",
                        "id_in_group": video_item.get("id_in_group", 999999),
                        "url": video_item.get("url"),
                        "thumb": video_item.get("thumb"),
                        "duration": video_item.get("duration", 1000),
                        "width": video_width,
                        "height": video_height,
                    })
                
                # Sort theo id_in_group để đảm bảo thứ tự đúng
                media_items.sort(key=lambda x: x.get("id_in_group", 999999))
                
                # Gộp và gửi media theo đúng thứ tự id_in_group
                # Gộp các ảnh liên tiếp thành 1 group, gộp các video liên tiếp thành 1 group
                photo_items_to_send = []  # List các ảnh liên tiếp để gộp
                video_items_to_send = []  # List các video liên tiếp để gộp
                last_type = None
                original_group_layout_id = batch_key[3] if len(batch_key) > 3 else None
                
                for item in media_items:
                    current_type = item["type"]
                    
                    # Nếu chuyển từ ảnh sang video hoặc ngược lại, gửi batch hiện tại trước
                    if last_type is not None and last_type != current_type:
                        # Gửi batch ảnh nếu có
                        if photo_items_to_send:
                            try:
                                self._send_photos_with_group_layout(
                                    photo_items_to_send,
                                    dest,
                                    ThreadType.GROUP,
                                    group_layout_id=original_group_layout_id,
                                )
                                print(
                                    f"[ROUTING] Đã forward {len(photo_items_to_send)} ảnh (gộp group) từ {batch_key[0]} → {dest}"
                                )
                            except Exception as e:
                                print(f"[ROUTING] Lỗi gửi batch ảnh tới {dest}: {e}")
                            photo_items_to_send = []
                        
                        # Gửi batch video nếu có
                        if video_items_to_send:
                            for video_item in video_items_to_send:
                                try:
                                    media_url = video_item["url"]
                                    thumb_url = video_item["thumb"]
                                    duration = video_item["duration"]
                                    video_width = self._safe_int(video_item.get("width"), 1280)
                                    video_height = self._safe_int(video_item.get("height"), 720)
                                    if media_url:
                                        self.sendRemoteVideo(
                                            media_url,
                                            thumb_url or media_url,
                                            duration,
                                            dest,
                                            ThreadType.GROUP,
                                            width=int(video_width),
                                            height=int(video_height),
                                        )
                                        print(f"[ROUTING] Đã forward video (id_in_group={video_item['id_in_group']}, w={video_width}, h={video_height}) từ {batch_key[0]} → {dest}")
                                except Exception as e:
                                    print(f"[ROUTING] Lỗi gửi video (id_in_group={video_item['id_in_group']}) tới {dest}: {e}")
                            video_items_to_send = []
                    
                    # Thêm item vào batch tương ứng
                    if current_type == "photo" and item.get("image_path"):
                        photo_items_to_send.append(item)
                    elif current_type == "video":
                        video_items_to_send.append(item)
                    
                    last_type = current_type
                
                # Gửi batch cuối cùng (nếu còn)
                if photo_items_to_send:
                    try:
                        self._send_photos_with_group_layout(
                            photo_items_to_send,
                            dest,
                            ThreadType.GROUP,
                            group_layout_id=original_group_layout_id,
                        )
                        print(
                            f"[ROUTING] Đã forward {len(photo_items_to_send)} ảnh (gộp group) từ {batch_key[0]} → {dest}"
                        )
                    except Exception as e:
                        print(f"[ROUTING] Lỗi gửi batch ảnh tới {dest}: {e}")
                
                if video_items_to_send:
                    for video_item in video_items_to_send:
                        try:
                            media_url = video_item["url"]
                            thumb_url = video_item["thumb"]
                            duration = video_item["duration"]
                            video_width = self._safe_int(video_item.get("width"), 1280)
                            video_height = self._safe_int(video_item.get("height"), 720)
                            if media_url:
                                self.sendRemoteVideo(
                                    media_url,
                                    thumb_url or media_url,
                                    duration,
                                    dest,
                                    ThreadType.GROUP,
                                    width=int(video_width),
                                    height=int(video_height),
                                )
                                print(f"[ROUTING] Đã forward video (id_in_group={video_item['id_in_group']}, w={video_width}, h={video_height}) từ {batch_key[0]} → {dest}")
                        except Exception as e:
                            print(f"[ROUTING] Lỗi gửi video (id_in_group={video_item['id_in_group']}) tới {dest}: {e}")
        finally:
            # Dọn file tạm
            for p in image_paths:
                try:
                    if os.path.exists(p):
                        os.remove(p)
                except Exception:
                    pass
            # Không xóa batch ở đây vì đã xóa trong _send_batch_and_cleanup rồi

    def _send_photos_with_group_layout(self, photo_items, dest_id, thread_type, group_layout_id=None):
        """
        Gửi nhiều ảnh với group layout, mỗi ảnh có width/height riêng.
        photo_items: List các dict với keys: image_path, meta (chứa width, height, id_in_group)
        group_layout_id: ID của group layout (nếu None sẽ tạo mới)
        """
        if not photo_items:
            return
        
        # Sử dụng group_layout_id từ batch gốc hoặc tạo mới
        if group_layout_id is None:
            group_layout_id = str(int(time.time() * 1000))
        else:
            # Đảm bảo group_layout_id là string
            group_layout_id = str(group_layout_id)
        total_items = len(photo_items)
        
        # Gửi từng ảnh với custom payload để giữ group layout
        for idx, item in enumerate(photo_items):
            image_path = item.get("image_path")
            meta = item.get("meta", {})
            width = self._safe_int(meta.get("width"), 2560)
            height = self._safe_int(meta.get("height"), 2560)
            id_in_group = self._safe_int(meta.get("id_in_group"), idx)
            
            if not image_path or not os.path.exists(image_path):
                continue
            
            try:
                # Upload ảnh trước
                upload_image = self._uploadImage(image_path, dest_id, thread_type)
                normal_url = upload_image.get("normalUrl", "")
                thumb_url = upload_image.get("thumbUrl", normal_url)
                hd_url = upload_image.get("hdUrl", normal_url)
                
                # Tạo custom payload với width/height riêng cho từng ảnh
                payload = {
                    "params": {
                        "photoId": upload_image.get("photoId", int(time.time() * 2000)),
                        "clientId": upload_image.get("clientFileId", int(time.time() * 1000)),
                        "desc": "",
                        "width": int(width),
                        "height": int(height),
                        "groupLayoutId": group_layout_id,
                        "totalItemInGroup": total_items,
                        "isGroupLayout": 1,
                        "idInGroup": int(id_in_group),
                        "rawUrl": normal_url,
                        "thumbUrl": thumb_url,
                        "hdUrl": hd_url,
                        "thumbSize": "53932",
                        "fileSize": "247671",
                        "hdSize": "344622",
                        "zsource": -1,
                        "jcp": json.dumps({"sendSource": 1, "convertible": "jxl"}),
                        "ttl": 0,
                        "imei": self._imei
                    }
                }
                
                if thread_type == ThreadType.GROUP:
                    payload["params"]["grid"] = str(dest_id)
                    payload["params"]["oriUrl"] = upload_image["normalUrl"]
                
                # Gửi với custom payload
                self.sendLocalImage(image_path, dest_id, thread_type, width=int(width), height=int(height), custom_payload=payload)
                print(f"[ROUTING] Đã gửi ảnh {idx+1}/{total_items} (w={width}, h={height}, id_in_group={id_in_group}) → {dest_id}")
                
                # Delay nhỏ giữa các ảnh để Zalo nhận diện chúng là cùng một group (50-100ms)
                if idx < total_items - 1:  # Không delay sau ảnh cuối
                    time.sleep(0.1)  # 100ms delay
            except Exception as e:
                print(f"[ROUTING] Lỗi gửi ảnh {idx+1}/{total_items} tới {dest_id}: {e}")

    def _send_single_photo_sync(self, media_url, dest_id, width, height):
        """Gửi ảnh đơn đồng bộ (chạy trong worker thread)."""
        temp_path = None
        try:
            resp = requests.get(media_url, stream=True, timeout=20)
            resp.raise_for_status()
            temp_path = f"temp_forward_photo_{int(time.time() * 1000)}.jpg"
            with open(temp_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            self.sendLocalImage(
                temp_path,
                dest_id,
                ThreadType.GROUP,
                width=width or 0,
                height=height or 0,
            )
            print(f"[ROUTING] Đã forward ảnh từ → {dest_id} (w={width}, h={height})")
        except Exception as e:
            print(f"[ROUTING] Lỗi gửi ảnh đơn tới {dest_id}: {e}")
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

    def _send_single_video_sync(self, media_url, thumb_url, duration, dest_id, width=1280, height=720):
        """Gửi video đơn đồng bộ (chạy trong worker thread)."""
        try:
            self.sendRemoteVideo(
                media_url,
                thumb_url or media_url,
                duration,
                dest_id,
                ThreadType.GROUP,
                width=int(width),
                height=int(height),
            )
            print(f"[ROUTING] Đã forward video từ → {dest_id} (w={width}, h={height})")
        except Exception as e:
            print(f"[ROUTING] Lỗi forward video tới {dest_id}: {e}")

    def _send_sticker(self, dest_id):
        """Gửi sticker vào nhóm đầu ra (dest_id) để đánh dấu bắt đầu tin nhắn mới."""
        try:
            print(f"[STICKER] Đang gửi sticker vào nhóm đầu ra (dest_id={dest_id})")
            sticker_id = 99112
            sticker_cat_id = 12694
            sticker_type = 3  # Type của sticker (thường là 3)
            
            # Dùng sendSticker với signature đúng: sendSticker(stickerType, stickerId, cateId, thread_id, thread_type)
            if hasattr(self, 'sendSticker'):
                try:
                    result = self.sendSticker(sticker_type, sticker_id, sticker_cat_id, dest_id, ThreadType.GROUP)
                    print(f"[STICKER] ✓ Đã gửi sticker vào nhóm đầu ra (dest_id={dest_id}), result={result}")
                except Exception as e:
                    print(f"[STICKER] ✗ Lỗi gửi sticker tới nhóm đầu ra (dest_id={dest_id}): {e}")
                    import traceback
                    print(f"[STICKER] Traceback: {traceback.format_exc()}")
            else:
                print(f"[STICKER] ✗ Không có method sendSticker")
        except Exception as e:
            print(f"[STICKER] ✗ Lỗi gửi sticker tới nhóm đầu ra (dest_id={dest_id}): {e}")
            import traceback
            print(f"[STICKER] Traceback: {traceback.format_exc()}")

    def _send_batch_and_cleanup(self, batch_key, batch):
        """
        Đưa batch media vào queue để gửi tuần tự theo dest_id (đầu ra).
        batch_key: (thread_id, author_id, session_id, group_layout_id)
        """
        # Kiểm tra xem batch đã được gửi chưa (tránh gửi 2 lần)
        if batch_key not in self.media_batch_context:
            print(f"[QUEUE] Batch {batch_key} đã được gửi rồi, bỏ qua")
            return
        
        # Kiểm tra batch có media không
        photos = batch.get("photos", [])
        videos = batch.get("videos", [])
        if not photos and not videos:
            print(f"[QUEUE] Batch {batch_key} không có media, bỏ qua")
            self.media_batch_context.pop(batch_key, None)
            return
        
        thread_id, author_id = batch_key[0], batch_key[1]
        dest_ids = batch.get("dest_ids", [])
        if isinstance(dest_ids, set):
            dest_ids = list(dest_ids)
        
        if not dest_ids:
            print(f"[QUEUE] Batch {batch_key} không có dest_ids, bỏ qua")
            self.media_batch_context.pop(batch_key, None)
            return
        
        # Loại bỏ duplicate ảnh/video trong batch (theo URL)
        seen_urls = set()
        unique_photos = []
        for photo in photos:
            url = photo.get("url")
            if url and url not in seen_urls:
                seen_urls.add(url)
                unique_photos.append(photo)
        
        seen_urls = set()
        unique_videos = []
        for video in videos:
            url = video.get("url")
            if url and url not in seen_urls:
                seen_urls.add(url)
                unique_videos.append(video)
        
        # Cập nhật batch với danh sách đã loại bỏ duplicate
        if len(unique_photos) != len(photos) or len(unique_videos) != len(videos):
            print(f"[QUEUE] Đã loại bỏ duplicate: ảnh {len(photos)} → {len(unique_photos)}, video {len(videos)} → {len(unique_videos)}")
            batch["photos"] = unique_photos
            batch["videos"] = unique_videos
        
        # Xóa batch khỏi context TRƯỚC KHI đưa vào queue để tránh gửi 2 lần
        self.media_batch_context.pop(batch_key, None)
        
        # Đưa vào queue của từng dest_id
        for dest_id in dest_ids:
            if not dest_id or dest_id == thread_id:
                continue
            q = self._get_or_create_queue(dest_id)
            q.put({
                "type": "batch",
                "batch_key": batch_key,
                "batch": batch,
            })
        print(f"[QUEUE] Đã đưa batch vào queue cho session {batch_key[2]} (thread_id={thread_id}, author_id={author_id}) → {len(dest_ids)} dest_id(s)")

    def _flush_expired_batches(self, now_ts=None):
        """Đưa các batch đã hết hạn vào queue (dù chưa đủ số lượng), tránh mất media."""
        if not self.media_batch_context:
            return
        now_ts = now_ts or time.time()
        for batch_key, batch in list(self.media_batch_context.items()):
            if batch.get("expire", 0) <= now_ts:
                # Đưa vào queue thay vì gửi trực tiếp
                self._send_batch_and_cleanup(batch_key, batch)

    def _bump_route_session(self, thread_id, author_id, reason=""):
        """
        Tăng phiên route cho 1 người trong nhóm.
        Dùng khi nhận sticker mở bài hoặc khi có text match keyword mới để tách phiên, tránh lẫn media.
        """
        old_state = self.route_sessions.get((thread_id, author_id), {"id": 0, "updated_at": 0})
        old_session_id = old_state["id"]
        
        state = {"id": old_state["id"] + 1, "updated_at": time.time()}
        self.route_sessions[(thread_id, author_id)] = state
        
        # Khi đã chuyển phiên, bỏ context/batch cũ để media còn treo không bị gửi nhầm
        self.last_route_context.pop((thread_id, author_id), None)
        self._cleanup_batches_for(thread_id, author_id)
        
        # Xóa tracking sticker của session cũ (để session mới có thể gửi sticker)
        # Xóa tất cả sticker key có session_id cũ
        to_remove = [k for k in self.sticker_sent if k[1] == old_session_id]
        for k in to_remove:
            self.sticker_sent.discard(k)
        
        print(f"[ROUTING] Reset phiên #{state['id']} cho {thread_id}/{author_id}. Lý do: {reason}")
        return state["id"]

    def _get_route_session_id(self, thread_id, author_id):
        return self.route_sessions.get((thread_id, author_id), {}).get("id", 0)

    def _get_group_name_cached(self, thread_id, timeout=2.0, max_retries=2):
        """
        Lấy tên nhóm từ cache hoặc fetch với timeout và retry.
        Tránh block quá lâu khi fetchGroupInfo.
        """
        # Kiểm tra cache trước
        with self.group_cache_lock:
            if thread_id in self.group_id_to_name_cache:
                return self.group_id_to_name_cache[thread_id]
        
        # Nếu không có trong cache, fetch với retry
        for retry in range(max_retries):
            result = [None]  # Dùng list để có thể modify trong nested function
            exception_occurred = [False]
            exception_msg = [None]
            
            def fetch_group():
                try:
                    group_info = self.fetchGroupInfo(thread_id)
                    group = group_info.gridInfoMap.get(thread_id, {})
                    name = group.get("name") if isinstance(group, dict) else getattr(group, "name", None)
                    if name:
                        result[0] = name
                        # Cache lại
                        with self.group_cache_lock:
                            self.group_id_to_name_cache[thread_id] = name
                            self.group_name_cache[name.lower()] = thread_id
                except Exception as e:
                    exception_occurred[0] = True
                    exception_msg[0] = str(e)
            
            # Chạy trong thread riêng với timeout
            fetch_thread = threading.Thread(target=fetch_group, daemon=True)
            fetch_thread.start()
            fetch_thread.join(timeout=timeout)
            
            if fetch_thread.is_alive():
                # Thread vẫn chạy sau timeout
                if retry < max_retries - 1:
                    print(f"[CACHE] Timeout khi fetch group name {thread_id} (lần {retry+1}), retry...")
                    continue
                else:
                    print(f"[CACHE] Timeout khi fetch group name {thread_id} sau {max_retries} lần, bỏ qua")
                    return None
            
            if not exception_occurred[0] and result[0]:
                return result[0]
            elif retry < max_retries - 1:
                print(f"[CACHE] Lỗi fetch group name {thread_id} (lần {retry+1}): {exception_msg[0]}, retry...")
                time.sleep(0.5)  # Đợi một chút trước khi retry
            else:
                print(f"[CACHE] Lỗi fetch group name {thread_id} sau {max_retries} lần: {exception_msg[0]}")
        
        return None
    
    def _is_from_input_group(self, thread_id, group_name):
        """
        Chỉ xử lý những nhóm có trong dauvao.txt
        (so sánh theo id hoặc tên nhóm).
        """
        if not self.input_groups:
            return False
        if thread_id in self.input_groups:
            return True
        if group_name and group_name in self.input_groups:
            return True
        return False

    def _get_input_tag(self, thread_id, group_name):
        """
        Lấy tag (kí hiệu) gắn vào đầu tin khi forward, dựa trên config dauvao.txt.
        """
        if not self.input_group_tags:
            return ""
        # Ưu tiên id
        thread_id_str = str(thread_id) if thread_id else ""
        if thread_id_str and thread_id_str.lower() in self.input_group_tags:
            return self.input_group_tags[thread_id_str.lower()]
        if group_name and group_name.lower() in self.input_group_tags:
            return self.input_group_tags[group_name.lower()]
        return ""
    
    def _format_text(self, text, source_group_id=None, group_name=None):
        """
        Format text: thêm tag và xóa emoji/ký tự đặc biệt.
        """
        if not text:
            return text
        
        # Lấy tag từ input group
        tag = ""
        if source_group_id:
            # Tìm group_name từ cache hoặc source_group_id
            if not group_name:
                # Thử tìm trong cache
                for name, gid in self.group_name_cache.items():
                    if str(gid) == str(source_group_id):
                        # Tìm tên gốc (không normalized)
                        for raw_name in self.input_groups:
                            if raw_name.lower() == name or self._normalize_for_match(raw_name) == name:
                                group_name = raw_name
                                break
                        break
            
            tag = self._get_input_tag(source_group_id, group_name)
        
        # Thêm tag vào đầu text nếu có
        if tag:
            text = f"{tag} {text}"
        
        # Xóa emoji và ký tự đặc biệt: 🌷🌷🌷, %, và các emoji khác
        import re
        # Xóa emoji (Unicode emoji ranges)
        emoji_pattern = re.compile(
            "["
            "\U0001F600-\U0001F64F"  # emoticons
            "\U0001F300-\U0001F5FF"  # symbols & pictographs
            "\U0001F680-\U0001F6FF"  # transport & map symbols
            "\U0001F1E0-\U0001F1FF"  # flags
            "\U00002702-\U000027B0"
            "\U000024C2-\U0001F251"
            "]+",
            flags=re.UNICODE
        )
        text = emoji_pattern.sub('', text)
        
        # Xóa dòng có "hh" (hoa hồng) hoặc "%"
        lines = text.split('\n')
        filtered_lines = []
        for line in lines:
            line_lower = line.lower()
            # Bỏ qua dòng có "hh" hoặc "%"
            if 'hh' in line_lower or '%' in line:
                continue
            filtered_lines.append(line)
        text = '\n'.join(filtered_lines)
        
        # Xóa ký tự % nếu đứng một mình hoặc lặp lại (nếu còn sót)
        text = re.sub(r'%\s*%*', '', text)
        
        # Xóa khoảng trắng thừa (nhưng giữ nguyên xuống dòng \n)
        # Thay thế nhiều khoảng trắng liên tiếp (không phải \n) bằng 1 khoảng trắng
        text = re.sub(r'[ \t]+', ' ', text)  # Chỉ thay thế space và tab, không thay \n
        # Xóa khoảng trắng ở đầu/cuối mỗi dòng (nhưng giữ \n)
        text = re.sub(r' +(\n|$)', r'\1', text)  # Xóa space trước \n hoặc cuối text
        text = re.sub(r'(\n|^) +', r'\1', text)  # Xóa space sau \n hoặc đầu text
        text = text.strip()  # Xóa khoảng trắng ở đầu và cuối toàn bộ text
        
        return text
    
    def _normalize_for_match(self, text):
        """Chuẩn hóa text để so sánh: lowercase, bỏ dấu, bỏ khoảng trắng thừa."""
        if not text:
            return ""
        # Chuyển về lowercase
        text = str(text).lower()
        # Bỏ dấu tiếng Việt
        text = unicodedata.normalize('NFD', text)
        text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
        # Bỏ khoảng trắng thừa
        text = re.sub(r'\s+', ' ', text).strip()
        return text
    
    def _extract_keyword(self, text):
        """Parse keyword từ text, trả về keyword đầu tiên tìm thấy hoặc None."""
        if not text or not self.keywords:
            return None
        
        text_norm = self._normalize_for_match(text)
        
        # Tìm keyword dài nhất trước (ưu tiên keyword dài hơn)
        matched_keywords = []
        for kw in self.keywords:
            if not kw:
                continue
            kw_norm = self._normalize_for_match(kw)
            if kw_norm and kw_norm in text_norm:
                matched_keywords.append((kw, len(kw_norm)))
        
        if matched_keywords:
            # Trả về keyword dài nhất (ưu tiên match chính xác hơn)
            matched_keywords.sort(key=lambda x: x[1], reverse=True)
            result = matched_keywords[0][0]
            print(f"[KEYWORD] Tìm thấy keyword: '{result}' trong text")
            return result
        
        # Fallback: kiểm tra tên quận/huyện từ district_names
        if self.district_names:
            for district in self.district_names:
                d_norm = self._normalize_for_match(district)
                if d_norm and d_norm in text_norm:
                    print(f"[KEYWORD] Tìm thấy district: '{district}' trong text")
                    return district
        
        return None
    
    def _enqueue_message(self, dest_group_id, source_group_id, text, photos, videos, source_group_name=None):
        """Đưa message vào queue để gửi tuần tự."""
        # Đảm bảo có queue và worker
        if dest_group_id not in self.send_queues:
            self.send_queues[dest_group_id] = queue.Queue()
            worker = threading.Thread(
                target=self._queue_worker,
                args=(dest_group_id,),
                daemon=True,
                name=f"QueueWorker-{dest_group_id}"
            )
            worker.start()
            self.worker_threads[dest_group_id] = worker
        
        q = self.send_queues[dest_group_id]
        
        # Tìm group_name từ cache nếu chưa có
        if not source_group_name and source_group_id:
            source_group_id_str = str(source_group_id)
            # Tìm trong cache
            for name, gid in self.group_name_cache.items():
                if str(gid) == source_group_id_str:
                    # Tìm tên gốc (không normalized)
                    for raw_name in self.input_groups:
                        if raw_name.lower() == name or self._normalize_for_match(raw_name) == name:
                            source_group_name = raw_name
                            break
                    if not source_group_name:
                        source_group_name = name
                    break
        
        # Đưa text vào queue
        if text:
            q.put({
                "type": "text",
                "text": text,
                "source_group_id": source_group_id,
                "source_group_name": source_group_name,
            })
        
        # Đưa photos vào queue (giữ nguyên thứ tự)
        if photos:
            q.put({
                "type": "photo_batch",
                "photos": photos.copy(),  # Copy để tránh thay đổi sau khi flush
            })
        
        # Đưa videos vào queue (giữ nguyên thứ tự)
        if videos:
            q.put({
                "type": "video_batch",
                "videos": videos.copy(),  # Copy để tránh thay đổi sau khi flush
            })
    
    def _resolve_keyword_to_dest_id(self, keyword):
        """Resolve keyword thành dest_group_id. Trả về (dest_id, target) hoặc (None, None)."""
        if not keyword:
            return None, None
        
        keyword_norm = self._normalize_for_match(keyword)
        keyword_lower = keyword.lower()
        target = None
        
        # Tìm trong keyword_to_output_target
        if keyword_lower in self.keyword_to_output_target:
            target = self.keyword_to_output_target[keyword_lower]
        elif keyword_norm in self.keyword_to_output_target:
            target = self.keyword_to_output_target[keyword_norm]
        else:
            for kw, tg in self.keyword_to_output_target.items():
                kw_norm = self._normalize_for_match(kw)
                if kw_norm == keyword_norm or kw == keyword_lower:
                    target = tg
                    break
        
        # Nếu không tìm thấy, thử tìm trong district_names
        if not target:
            for district in self.district_names:
                d_norm = self._normalize_for_match(district)
                if d_norm == keyword_norm or district.lower() == keyword_lower:
                    target = district
                    break
        
        if target:
            resolved_id = self._resolve_output_thread_id(target)
            if resolved_id:
                return str(resolved_id), target
        
        return None, None
    
    def _save_message_to_json(self, group_id, user_id, keyword, items):
        """Lưu tất cả tin nhắn vào JSON file để track."""
        try:
            log_data = []
            if os.path.exists(self.message_log_file):
                try:
                    with open(self.message_log_file, "r", encoding="utf-8") as f:
                        log_data = json.load(f)
                except Exception:
                    log_data = []
            
            session_entry = {
                "timestamp": time.time(),
                "datetime": time.strftime("%Y-%m-%d %H:%M:%S"),
                "group_id": str(group_id),
                "user_id": str(user_id),
                "keyword": keyword,
                "items": items
            }
            
            log_data.append(session_entry)
            
            # Giữ tối đa 1000 entries
            if len(log_data) > 1000:
                log_data = log_data[-1000:]
            
            with open(self.message_log_file, "w", encoding="utf-8") as f:
                json.dump(log_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[JSON] Lỗi lưu message log: {e}")
    
    def _flush_current_session(self, group_id, user_id):
        """Flush session hiện tại - gửi đúng trình tự theo timestamp (text và media xen kẽ)."""
        buffer_key = (group_id, user_id)
        if buffer_key not in self.buffers:
            return
        
        buffer, lock = self._get_or_create_buffer(group_id, user_id)
        
        with lock:
            # Kiểm tra xem session đã được flush chưa (tránh flush 2 lần)
            if buffer.get("is_flushing") or buffer.get("is_flushed"):
                print(f"[FLUSH] Session {buffer_key} đang được flush hoặc đã flush, bỏ qua")
                return
            
            # Đánh dấu đang flush
            buffer["is_flushing"] = True
            
            current_keyword = buffer.get("current_keyword")
            current_dest_id = buffer.get("current_dest_id")
            session_texts = buffer.get("session_texts", []).copy()
            session_media = buffer.get("session_media", []).copy()
            
            # Lưu lại keyword và dest_id trước khi reset (để có thể tạo lại session nếu ảnh đến sau)
            buffer["last_flush_keyword"] = current_keyword
            buffer["last_flush_dest_id"] = current_dest_id
            buffer["last_flush_time"] = time.time()
            
            # Reset session data NGAY trong lock để tránh flush 2 lần
            buffer["current_keyword"] = None
            buffer["current_dest_id"] = None
            buffer["session_start_time"] = None
            buffer["session_texts"] = []
            buffer["session_media"] = []
            buffer["is_flushed"] = True  # Đánh dấu đã flush
            
            # Cancel timer
            if buffer.get("timeout_timer"):
                try:
                    buffer["timeout_timer"].cancel()
                except Exception:
                    pass
            buffer["timeout_timer"] = None
        
        # Xử lý ngoài lock
        if not current_dest_id:
            # Không có session hợp lệ để flush
            print(f"[FLUSH] Không flush session {buffer_key}: không có dest_id")
            return
        
        if not session_texts and not session_media:
            # Không có gì để gửi
            print(f"[FLUSH] Không flush session {buffer_key}: không có texts và media")
            return
        
        try:
            # Tạo danh sách tất cả items (text và media) và sắp xếp theo timestamp
            all_items = []
            
            # Thêm texts
            for text_item in session_texts:
                all_items.append({
                    "type": "text",
                    "text": text_item.get("text", ""),
                    "timestamp": text_item.get("timestamp", 0),
                })
            
            # Thêm media
            for media in session_media:
                media_type = media.get("type")
                media_data = media.get("data", {}).copy()
                all_items.append({
                    "type": media_type,
                    "data": media_data,
                    "timestamp": media.get("timestamp", 0),
                })
            
            # Sắp xếp theo timestamp
            all_items_sorted = sorted(all_items, key=lambda x: x.get("timestamp", 0))
            
            # Lưu vào JSON
            json_items = []
            for item in all_items_sorted:
                if item["type"] == "text":
                    json_items.append({
                        "type": "text",
                        "text": item["text"],
                        "time": time.strftime("%H:%M:%S", time.localtime(item["timestamp"]))
                    })
                else:
                    json_items.append({
                        "type": item["type"],
                        "url": item["data"].get("url", ""),
                        "time": time.strftime("%H:%M:%S", time.localtime(item["timestamp"]))
                    })
            
            # Lưu vào JSON - lưu đầy đủ tất cả items
            if json_items:
                self._save_message_to_json(group_id, user_id, current_keyword, json_items)
                photo_count_json = len([item for item in json_items if item.get('type') == 'photo'])
                video_count_json = len([item for item in json_items if item.get('type') == 'video'])
                text_count_json = len([item for item in json_items if item.get('type') == 'text'])
                print(f"[JSON] Đã lưu {len(json_items)} items vào JSON: {text_count_json} texts, {photo_count_json} photos, {video_count_json} videos")
                items_detail = [f"{item.get('type')}@{item.get('time', 'N/A')}" for item in json_items]
                print(f"[JSON] Chi tiết items: {items_detail}")
            else:
                print(f"[JSON] Không có items để lưu vào JSON")
            
            photo_count = len([m for m in session_media if m.get('type') == 'photo'])
            video_count = len([m for m in session_media if m.get('type') == 'video'])
            print(f"[SESSION] ===== FLUSH SESSION ===== {buffer_key}: keyword='{current_keyword}', {len(session_texts)} texts, {photo_count} photos, {video_count} videos → dest={current_dest_id}")
            print(f"[SESSION] Chi tiết texts: {[t.get('text', '')[:50] + '...' if len(t.get('text', '')) > 50 else t.get('text', '') for t in session_texts]}")
            print(f"[SESSION] Chi tiết media: {len(session_media)} items với timestamps {[time.strftime('%H:%M:%S', time.localtime(m.get('timestamp', 0))) for m in session_media]}")
            
            # Gửi từng item theo đúng trình tự timestamp
            # Gom các media liên tiếp thành batch, nhưng gửi text riêng
            i = 0
            while i < len(all_items_sorted):
                item = all_items_sorted[i]
                
                if item["type"] == "text":
                    # Gửi text riêng
                    self._enqueue_message(
                        current_dest_id,
                        group_id,
                        item["text"],
                        [],
                        []
                    )
                    i += 1
                else:
                    # Gom các media liên tiếp thành batch
                    batch_photos = []
                    batch_videos = []
                    
                    # Lấy tất cả media liên tiếp (không có text ở giữa)
                    while i < len(all_items_sorted):
                        current_item = all_items_sorted[i]
                        if current_item["type"] == "text":
                            break
                        
                        media_data = current_item["data"].copy()
                        if current_item["type"] == "photo":
                            batch_photos.append(media_data)
                        elif current_item["type"] == "video":
                            batch_videos.append(media_data)
                        i += 1
                    
                    # Gửi batch media
                    if batch_photos or batch_videos:
                        # Sắp xếp media trong batch theo id_in_group
                        batch_photos_sorted = sorted(batch_photos, key=lambda x: x.get("id_in_group", x.get("timestamp", 0)))
                        batch_videos_sorted = sorted(batch_videos, key=lambda x: x.get("id_in_group", x.get("timestamp", 0)))
                        
                        self._enqueue_message(
                            current_dest_id,
                            group_id,
                            "",  # Không có text, chỉ gửi media
                            batch_photos_sorted,
                            batch_videos_sorted
                        )
        except Exception as e:
            print(f"[SESSION] Lỗi flush session {buffer_key}: {e}")
            import traceback
            print(f"[SESSION] Traceback: {traceback.format_exc()}")
        finally:
            # Reset flag sau khi flush xong (dù thành công hay lỗi)
            buffer, lock = self._get_or_create_buffer(group_id, user_id)
            with lock:
                buffer["is_flushing"] = False
                # Không reset is_flushed vì cần giữ để tránh flush lại
    
    def _handle_event(self, message, message_object, thread_id, thread_type, group_name, author_id):
        """Xử lý event với logic session-based: keyword mới → flush session cũ, bắt đầu session mới."""
        if thread_type != ThreadType.GROUP:
            return
        
        # Chỉ xử lý trong các nhóm đầu vào
        if not self._is_from_input_group(thread_id, group_name):
            return
        
        try:
            msg_type = getattr(message_object, "msgType", None)
            buffer, lock = self._get_or_create_buffer(thread_id, author_id)
            
            with lock:
                # Cancel timeout timer cũ
                if buffer.get("timeout_timer"):
                    try:
                        buffer["timeout_timer"].cancel()
                    except Exception:
                        pass
                
                # Xử lý theo loại event
                if msg_type == "chat.sticker":
                    # Sticker → chỉ forward, không flush session
                    # Session chỉ flush khi có keyword mới hoặc timeout
                    print(f"[BUFFER] Sticker đến từ {thread_id}/{author_id}, forward sticker (không flush session)")
                    # Forward sticker nếu cần (logic forward sticker đã có ở nơi khác)
                    return
                
                elif msg_type in ["chat.photo", "chat.video", "chat.video.msg"]:
                    # Media - sau keyword thì nhận hết tất cả
                    # Keyword chỉ để nhận diện mở bài (như sang phòng khác)
                    current_keyword = buffer.get("current_keyword")
                    current_dest_id = buffer.get("current_dest_id")
                    
                    if not current_keyword or not current_dest_id:
                        # Chưa có session → có thể keyword chưa đến, đang xử lý, hoặc session vừa bị flush
                        # Kiểm tra xem có text gần đây không (có thể chứa keyword đang xử lý)
                        recent_texts = buffer.get("session_texts", [])
                        last_event_time = buffer.get("last_event_time", 0)
                        last_flush_time = buffer.get("last_flush_time", 0)
                        time_since_last = time.time() - last_event_time
                        time_since_flush = time.time() - last_flush_time
                        
                        # Nếu có text gần đây (trong vòng 0.5 giây) → có thể keyword đang được xử lý
                        # Đợi một chút trong lock rồi check lại (có thể session đã được set)
                        if recent_texts and time_since_last < 0.5:
                            print(f"[BUFFER] Media đến nhưng chưa có session, có {len(recent_texts)} texts gần đây ({time_since_last:.2f}s) - có thể keyword đang xử lý, đợi 0.1s rồi check lại...")
                            # Release lock tạm thời để keyword có thể set session
                            # Sau đó check lại
                            time.sleep(0.1)
                            # Check lại sau khi đợi
                            current_keyword = buffer.get("current_keyword")
                            current_dest_id = buffer.get("current_dest_id")
                            if not current_keyword or not current_dest_id:
                                print(f"[BUFFER] Sau khi đợi vẫn chưa có session, bỏ qua")
                                return
                            print(f"[BUFFER] Sau khi đợi đã có session: keyword='{current_keyword}', dest_id={current_dest_id}")
                        # Nếu session vừa bị flush gần đây (trong vòng 5 giây) → có thể ảnh thuộc session đó
                        # Tạo lại session tạm thời để nhận ảnh (sẽ được flush lại sau)
                        elif last_flush_time > 0 and time_since_flush < 5.0:
                            last_flush_keyword = buffer.get("last_flush_keyword")
                            last_flush_dest_id = buffer.get("last_flush_dest_id")
                            if last_flush_keyword and last_flush_dest_id:
                                print(f"[BUFFER] Media đến sau khi session vừa flush ({time_since_flush:.1f}s trước), tạo lại session với keyword='{last_flush_keyword}' để nhận ảnh")
                                # Tạo lại session với keyword và dest_id cũ
                                buffer["current_keyword"] = last_flush_keyword
                                buffer["current_dest_id"] = last_flush_dest_id
                                buffer["session_start_time"] = time.time()
                                buffer["session_texts"] = []
                                buffer["session_media"] = []
                                buffer["is_flushing"] = False
                                buffer["is_flushed"] = False
                                current_keyword = last_flush_keyword
                                current_dest_id = last_flush_dest_id
                                print(f"[BUFFER] Đã tạo lại session: keyword='{current_keyword}', dest_id={current_dest_id}")
                            else:
                                print(f"[BUFFER] Media đến sau khi session vừa flush nhưng không có keyword, bỏ qua")
                                return
                        else:
                            print(f"[BUFFER] Media đến nhưng chưa có session (keyword={current_keyword}, dest_id={current_dest_id}), bỏ qua")
                            return
                    
                    print(f"[BUFFER] Media đến, session hiện tại: keyword='{current_keyword}', dest_id={current_dest_id}")
                    
                    content = getattr(message_object, "content", {}) or {}
                    if not isinstance(content, dict):
                        content = {}
                    
                    # Parse params
                    params_data = None
                    params_raw = content.get("params")
                    if params_raw:
                        try:
                            params_data = json.loads(params_raw)
                        except Exception:
                            pass
                    
                    id_in_group = None
                    if params_data:
                        id_in_group = self._safe_int(params_data.get("id_in_group"), None)
                    
                    current_ts = time.time()
                    
                    if msg_type == "chat.photo":
                        media_url = content.get("hd") or content.get("href")
                        if media_url:
                            orig_width, orig_height = 2560, 2560
                            if params_data:
                                orig_width = self._safe_int(params_data.get("width"), orig_width)
                                orig_height = self._safe_int(params_data.get("height"), orig_height)
                            
                            # Kiểm tra trùng - CHỈ kiểm tra URL (id_in_group có thể giống nhau giữa các ảnh khác nhau)
                            photo_exists = False
                            duplicate_reason = None
                            for existing in buffer.get("session_media", []):
                                if existing.get("type") == "photo":
                                    existing_data = existing.get("data", {})
                                    existing_url = existing_data.get("url")
                                    # CHỈ kiểm tra URL - nếu URL giống nhau thì mới là trùng
                                    if existing_url and existing_url == media_url:
                                        photo_exists = True
                                        duplicate_reason = f"url trùng: {media_url[:50]}..."
                                        break
                            
                            if not photo_exists:
                                buffer["session_media"].append({
                                    "type": "photo",
                                    "data": {
                                        "url": media_url,
                                        "width": orig_width,
                                        "height": orig_height,
                                        "id_in_group": id_in_group if id_in_group is not None else len([m for m in buffer.get("session_media", []) if m.get("type") == "photo"]),
                                    },
                                    "timestamp": current_ts,
                                })
                                photo_count = len([m for m in buffer.get('session_media', []) if m.get('type') == 'photo'])
                                print(f"[BUFFER] Đã thêm ảnh vào session {thread_id}/{author_id}: {photo_count} ảnh, url={media_url[:50]}..., id_in_group={id_in_group}")
                            else:
                                print(f"[BUFFER] Ảnh bị bỏ qua (trùng): {duplicate_reason}, url={media_url[:50]}...")
                        else:
                            print(f"[BUFFER] Ảnh không có URL, bỏ qua")
                    
                    elif msg_type in ["chat.video", "chat.video.msg"]:
                        media_url = content.get("href")
                        thumb_url = content.get("thumb") or content.get("hd")
                        duration = 1000
                        orig_width, orig_height = 1280, 720
                        if params_data:
                            duration = self._safe_int(params_data.get("duration"), duration)
                            video_width = params_data.get("width")
                            video_height = params_data.get("height")
                            if video_width is not None:
                                orig_width = self._safe_int(video_width, orig_width)
                            if video_height is not None:
                                orig_height = self._safe_int(video_height, orig_height)
                        
                        if media_url:
                            buffer["session_media"].append({
                                "type": "video",
                                "data": {
                                    "url": media_url,
                                    "thumb": thumb_url,
                                    "duration": duration,
                                    "width": orig_width,
                                    "height": orig_height,
                                    "id_in_group": id_in_group if id_in_group is not None else len([m for m in buffer.get("session_media", []) if m.get("type") == "video"]) + 1000,
                                },
                                "timestamp": current_ts,
                            })
                            video_count = len([m for m in buffer.get('session_media', []) if m.get('type') == 'video'])
                            print(f"[BUFFER] Đã thêm video vào session {thread_id}/{author_id}: {video_count} video, url={media_url[:50]}...")
                
                else:
                    # Text message - kiểm tra keyword
                    text_to_check = ""
                    if isinstance(message, str):
                        text_to_check = message
                    else:
                        try:
                            if hasattr(message_object, 'content'):
                                content = getattr(message_object, 'content', None)
                                if isinstance(content, str):
                                    text_to_check = content
                                elif isinstance(content, dict):
                                    text_to_check = content.get('text', '') or content.get('title', '') or str(content)
                        except Exception:
                            pass
                    
                    if not text_to_check:
                        return
                    
                    # Luôn tìm keyword trong text (không phân biệt độ dài)
                    text_length = len(text_to_check)
                    is_long_text = text_length > 30
                    keyword = self._extract_keyword(text_to_check)
                    
                    if keyword:
                        # Có keyword → kiểm tra có phải keyword mới không
                        current_keyword = buffer.get("current_keyword")
                        dest_id, target = self._resolve_keyword_to_dest_id(keyword)
                        
                        if dest_id:
                            # Nếu có keyword mới và khác keyword hiện tại → flush session cũ
                            if current_keyword and current_keyword != keyword:
                                print(f"[SESSION] Keyword mới '{keyword}' khác keyword cũ '{current_keyword}', flush session cũ")
                                # Flush session cũ (ngoài lock)
                                self._flush_current_session(thread_id, author_id)
                            
                            # Kiểm tra xem có phải keyword mới cho dest_id này không (chuyển từ keyword khác)
                            last_keyword_for_dest = self.last_keyword_per_dest.get(dest_id)
                            if last_keyword_for_dest != keyword:
                                # Keyword mới cho dest_id này → gửi sticker
                                print(f"[STICKER] Keyword mới '{keyword}' cho dest_id {dest_id} (keyword cũ: {last_keyword_for_dest}), gửi sticker")
                                try:
                                    self._send_sticker(dest_id)
                                    self.last_keyword_per_dest[dest_id] = keyword
                                except Exception as e:
                                    print(f"[STICKER] Lỗi gửi sticker khi keyword mới: {e}")
                            
                            # Bắt đầu session mới - SET NGAY trong lock để media đến sau có thể nhận được
                            buffer["current_keyword"] = keyword
                            buffer["current_dest_id"] = dest_id
                            buffer["session_start_time"] = time.time()
                            buffer["session_texts"] = [{"text": text_to_check, "timestamp": time.time()}]
                            buffer["session_media"] = []
                            buffer["is_flushing"] = False  # Reset flag khi bắt đầu session mới
                            buffer["is_flushed"] = False  # Reset flag khi bắt đầu session mới
                            print(f"[SESSION] Bắt đầu session mới: keyword='{keyword}' → dest={dest_id} (session đã được set, media đến sau sẽ được nhận)")
                        else:
                            print(f"[SESSION] Tìm thấy keyword '{keyword}' nhưng không resolve được dest_id")
                    else:
                        # Không có keyword → thêm vào session hiện tại (nếu có) hoặc bỏ qua
                        current_keyword = buffer.get("current_keyword")
                        current_dest_id = buffer.get("current_dest_id")
                        
                        if current_keyword and current_dest_id:
                            # Đã có session → thêm vào session hiện tại
                            buffer["session_texts"].append({
                                "text": text_to_check,
                                "timestamp": time.time(),
                            })
                            if is_long_text:
                                print(f"[SESSION] Thêm text dài ({text_length} ký tự) vào session hiện tại: keyword='{current_keyword}', {len(buffer.get('session_texts', []))} texts")
                            else:
                                print(f"[SESSION] Thêm text vào session hiện tại: keyword='{current_keyword}', {len(buffer.get('session_texts', []))} texts")
                        else:
                            # Chưa có session và không có keyword → bỏ qua
                            if is_long_text:
                                print(f"[BUFFER] Text dài ({text_length} ký tự) không có keyword và chưa có session, bỏ qua")
                            else:
                                print(f"[BUFFER] Text không có keyword và chưa có session, bỏ qua")
                            return
                        # Text <= 30 ký tự và không có keyword → thêm vào session hiện tại (nếu có)
                        if buffer.get("current_keyword") and buffer.get("current_dest_id"):
                            buffer["session_texts"].append({
                                "text": text_to_check,
                                "timestamp": time.time(),
                            })
                            print(f"[SESSION] Thêm text vào session hiện tại: keyword='{buffer.get('current_keyword')}', {len(buffer.get('session_texts', []))} texts")
                        else:
                            print(f"[BUFFER] Text không có keyword và chưa có session, bỏ qua")
                            return
                
                # Cập nhật thời gian
                buffer["last_event_time"] = time.time()
                
                # Tạo timeout timer mới (10s)
                def timeout_wrapper():
                    # Flush session hiện tại sau 10s không có event mới
                    print(f"[TIMEOUT] Timeout 10s cho session {thread_id}/{author_id}, flush session...")
                    self.flush_executor.submit(self._flush_current_session, thread_id, author_id)
                
                # Cancel timer cũ nếu có
                if buffer.get("timeout_timer"):
                    try:
                        buffer["timeout_timer"].cancel()
                    except Exception:
                        pass
                
                timer = threading.Timer(
                    self.session_timeout,
                    timeout_wrapper
                )
                timer.start()
                buffer["timeout_timer"] = timer
                print(f"[BUFFER] Đã reset timeout timer cho {thread_id}/{author_id} ({self.session_timeout}s)")
        
        except Exception as e:
            print(f"[BUFFER] Lỗi xử lý event: {e}")
            import traceback
            print(f"[BUFFER] Traceback: {traceback.format_exc()}")

    def _handle_routing(self, message, message_object, thread_id, thread_type, group_name, author_id):
        """
        Xử lý routing với buffer + debounce system.
        Chuyển event vào buffer và đợi debounce để gom đủ dữ liệu.
        """
        # Gọi handle_event để thêm vào buffer
        try:
            self._handle_event(message, message_object, thread_id, thread_type, group_name, author_id)
        except Exception as e:
            print(f"[ROUTING] Lỗi nghiêm trọng trong _handle_routing: {e}")
            import traceback
            print(f"[ROUTING] Traceback: {traceback.format_exc()}")
            # Không raise lại exception để bot tiếp tục hoạt động

    # ====== OVERRIDE EVENT / MESSAGE ======
    def onMessage(self, mid, author_id, message, message_object, thread_id, thread_type):
        """Xử lý tin nhắn đến - có try-except bao quanh để tránh bot đơ khi có exception."""
        # Cập nhật thời gian nhận tin nhắn cuối cùng (cho heartbeat)
        self.last_message_time = time.time()
        
        try:
            # Lấy tên nhóm nếu là group - dùng cache để tránh block
            group_name = None
            if thread_type == ThreadType.GROUP:
                try:
                    # Dùng cache với timeout để tránh block
                    group_name = self._get_group_name_cached(thread_id, timeout=2.0)
                except Exception as e:
                    print(f"[ROUTING] Lỗi lấy tên nhóm {thread_id}: {e}")
                    group_name = None

            # Log tin nhắn (có thể tắt để giảm spam log)
            msg_preview = str(message)[:100] if message else "None"
            print(
                f"{Fore.GREEN}[MSG] Nhận tin nhắn từ {author_id} trong {thread_id} ({group_name or 'N/A'}): {msg_preview}...{Style.NORMAL}"
            )

            # Xử lý lệnh !sticker
            if isinstance(message, str) and message.strip() == "!sticker":
                if thread_type == ThreadType.GROUP:
                    try:
                        self._send_sticker(thread_id)
                        print(f"[COMMAND] Đã gửi sticker vào nhóm {thread_id} theo lệnh !sticker")
                    except Exception as e:
                        print(f"[COMMAND] Lỗi gửi sticker: {e}")
                        import traceback
                        print(f"[COMMAND] Traceback: {traceback.format_exc()}")
                return

            # ROUTING tin nhắn theo keyword / file cấu hình
            # Chạy trong thread riêng để không block onMessage
            try:
                self._handle_routing(message, message_object, thread_id, thread_type, group_name, author_id)
            except Exception as routing_e:
                print(f"[ROUTING] Lỗi trong _handle_routing: {routing_e}")
                import traceback
                print(f"[ROUTING] Traceback: {traceback.format_exc()}")
                # Không raise để bot tiếp tục nhận tin nhắn khác
        except Exception as e:
            print(f"[ROUTING] Lỗi nghiêm trọng trong onMessage: {e}")
            import traceback
            print(f"[ROUTING] Traceback: {traceback.format_exc()}")
            # Không raise lại exception để bot tiếp tục hoạt động


if __name__ == "__main__":
    restart_count = 0
    max_restarts = 100  # Giới hạn số lần restart để tránh loop vô hạn (không dùng nữa, restart vô hạn)
    consecutive_failures = 0
    
    while True:  # Restart vô hạn, không dừng
        try:
            restart_count += 1
            consecutive_failures = 0  # Reset khi khởi động thành công
            print(f"[MAIN] Khởi động bot (lần {restart_count})...")
            
            client = Client(API_KEY, SECRET_KEY, IMEI, SESSION_COOKIES)
            
            # Kiểm tra connection trước khi listen
            try:
                print(f"[MAIN] Kiểm tra connection...")
                # Thử fetch một nhóm để kiểm tra connection
                test_groups = client.fetchAllGroups()
                if test_groups:
                    print(f"[MAIN] Connection OK, đang build cache group name...")
                    # Build cache ngay để có thể resolve target sau này
                    client._build_group_name_cache()
                    print(f"[MAIN] Đã build cache, bắt đầu listen...")
                else:
                    print(f"[MAIN] Cảnh báo: Không lấy được danh sách nhóm")
            except Exception as conn_e:
                print(f"[MAIN] Lỗi kiểm tra connection: {conn_e}")
                print(f"[MAIN] Vẫn tiếp tục listen...")
            
            # Listen với timeout handling
            try:
                client.listen(thread=True, delay=0)
            except Exception as listen_e:
                print(f"[MAIN] Lỗi trong listen: {listen_e}")
                raise  # Re-raise để restart
            
        except KeyboardInterrupt:
            print(f"[MAIN] Dừng bot do người dùng (Ctrl+C)")
            if 'client' in locals():
                try:
                    client.is_running = False
                except:
                    pass
            break
        
        except Exception as e:
            consecutive_failures += 1
            print(f"[MAIN] Lỗi nghiêm trọng (lần thứ {consecutive_failures}): {e}")
            import traceback
            print(f"[MAIN] Traceback: {traceback.format_exc()}")
            
            if 'client' in locals():
                try:
                    client.is_running = False
                    # Cleanup executors
                    if hasattr(client, 'executor'):
                        try:
                            client.executor.shutdown(wait=False)
                        except:
                            pass
                    if hasattr(client, 'flush_executor'):
                        try:
                            client.flush_executor.shutdown(wait=False)
                        except:
                            pass
                except:
                    pass
            
            # Tăng thời gian chờ nếu lỗi liên tiếp
            wait_time = min(5 + consecutive_failures * 2, 30)  # Tối đa 30 giây
            print(f"[MAIN] Đợi {wait_time} giây trước khi restart...")
            time.sleep(wait_time)
    
    # Không dừng bot, tiếp tục restart vô hạn
    # if restart_count >= max_restarts:
    #     print(f"[MAIN] Đã đạt giới hạn restart ({max_restarts} lần), dừng bot")

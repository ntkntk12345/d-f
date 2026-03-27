import os
import time
import json
import re
import queue
import threading
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
        self._load_routing_config()
        # Lưu context lần route gần nhất theo nhóm & theo người gửi để gửi kèm ảnh/video
        # { (thread_id, author_id): {"dest_ids": [str], "expire": timestamp} }
        self.last_route_context = {}
        # Lưu batch media (ảnh + video) theo group layout (gửi nhiều media 1 lần)
        # { (thread_id, author_id, session_id, group_layout_id): {"expected": int, "photos": [...], "videos": [...], "dest_ids": [str], "expire": timestamp} }
        self.media_batch_context = {}
        # Theo dõi phiên route để tách phiên gửi trọ, tránh lẫn ảnh/video
        # { (thread_id, author_id): {"id": int, "updated_at": ts} }
        self.route_sessions = {}
        # Queue system để đảm bảo gửi tuần tự theo session
        # { (thread_id, author_id): queue.Queue() }
        self.send_queues = {}
        self.queue_locks = {}  # Lock cho mỗi queue
        self.worker_threads = {}  # Worker thread per (thread_id, author_id)
        self.executor = ThreadPoolExecutor(max_workers=10)  # Thread pool để tải ảnh/video song song
        self.sticker_sent = set()  # Track đã gửi sticker cho (dest_id, session_id) để tránh gửi lại

    # ====== HÀM HỖ TRỢ ROUTING ======
    def _load_lines(self, path):
        if not os.path.exists(path):
            return []
        with open(path, "r", encoding="utf-8") as f:
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

        # Nhóm đầu ra: dùng để xác định nơi gửi
        self.output_groups_raw = self._load_lines(OUTPUT_GROUPS_FILE)
        # Các dòng KHÔNG có "|" được coi là tên quận/huyện
        self.district_names = [line for line in self.output_groups_raw if "|" not in line]

        # Keyword: mỗi dòng là một keyword (vd: haiha)
        self.keywords = [k.lower() for k in self._load_lines(KEYWORDS_FILE)]

        # Mapping keyword -> đích đầu ra
        # Ưu tiên: nếu có dòng "keyword|group_id_or_name" trong daura.txt
        self.keyword_to_output_target = {}
        for line in self.output_groups_raw:
            if "|" in line:
                kw, target = [p.strip() for p in line.split("|", 1)]
                if kw:
                    self.keyword_to_output_target[kw.lower()] = target

        # Nếu chưa có mapping rõ ràng, mặc định keyword trùng tên nhóm đầu ra
        for kw in self.keywords:
            if kw not in self.keyword_to_output_target and kw in [name.lower() for name in self.output_groups_raw]:
                # tìm đúng tên (phân biệt hoa thường) trong file daura
                for name in self.output_groups_raw:
                    if name.lower() == kw:
                        self.keyword_to_output_target[kw] = name
                        break

    def _build_group_name_cache(self):
        """
        Tạo cache name -> id cho tất cả nhóm đã tham gia.
        Có thể hơi chậm lần đầu, nên chỉ gọi khi cần.
        """
        if self.group_name_cache:
            return
        try:
            all_groups = self.fetchAllGroups()
            group_ids = list(all_groups.gridVerMap.keys())
            for gid in group_ids:
                try:
                    info = self.fetchGroupInfo(gid)
                    name = info.gridInfoMap.get(gid, {}).get("name", None)
                    if name:
                        self.group_name_cache[name.lower()] = gid
                except Exception:
                    continue
        except Exception:
            pass

    def _resolve_output_thread_id(self, target_name_or_id):
        """
        Nhận vào 1 chuỗi: nếu là ID thì trả luôn,
        nếu là tên nhóm thì map sang ID bằng cache.
        """
        # Nếu là ID (toàn số, khá dài)
        if target_name_or_id.isdigit():
            return target_name_or_id

        # Tên nhóm -> ID
        self._build_group_name_cache()
        gid = self.group_name_cache.get(target_name_or_id.lower())
        return gid

    def _normalize_for_match(self, text):
        """Chuẩn hóa text để so khớp keyword: lower + gộp khoảng trắng."""
        if not text:
            return ""
        return re.sub(r"\s+", " ", str(text).lower()).strip()

    def _cleanup_batches_for(self, thread_id, author_id):
        """Xoá batch media cũ khi reset phiên để tránh gộp nhầm."""
        to_del = [k for k in list(self.media_batch_context.keys()) if k[0] == thread_id and k[1] == author_id]
        for k in to_del:
            self.media_batch_context.pop(k, None)

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
        while True:
            try:
                # Đợi task từ queue (blocking)
                task = q.get(timeout=300)  # Timeout 5 phút, nếu không có task thì kiểm tra lại
                if task is None:  # Signal để dừng
                    break
                try:
                    task_type = task.get("type")
                    if task_type == "text":
                        # Gửi sticker TRƯỚC khi gửi text mới (nếu chưa gửi cho session này)
                        session_id = task.get("session_id")
                        if session_id is not None:
                            sticker_key = (dest_id, session_id)
                            if sticker_key not in self.sticker_sent:
                                print(f"[STICKER] Gửi sticker TRƯỚC text cho session {session_id} → {dest_id}")
                                try:
                                    self._send_sticker(dest_id)
                                    self.sticker_sent.add(sticker_key)
                                except Exception as e:
                                    print(f"[STICKER] Lỗi gửi sticker trước text: {e}")
                        
                        # Sau đó mới gửi text
                        try:
                            msg = Message(text=task["text"])
                            self.send(msg, task["dest_id"], ThreadType.GROUP)
                            print(
                                f"[ROUTING] Đã forward tin nhắn (match '{task.get('reason_kw', '')}') từ {task.get('source_thread_id', '?')} → {dest_id}"
                            )
                        except Exception as e:
                            print(f"[QUEUE] Lỗi gửi text tới {dest_id}: {e}")
                    elif task_type == "batch":
                        # Gửi batch media
                        self._send_batch_and_cleanup_sync(task["batch_key"], task["batch"])
                    elif task_type == "single_photo":
                        # Gửi ảnh đơn
                        self._send_single_photo_sync(
                            task["media_url"], dest_id, task["width"], task["height"]
                        )
                    elif task_type == "single_video":
                        # Gửi video đơn
                        self._send_single_video_sync(
                            task["media_url"], task["thumb_url"], task["duration"], dest_id
                        )
                except Exception as e:
                    print(f"[QUEUE] Lỗi xử lý task trong queue {dest_id}: {e}")
                finally:
                    q.task_done()
            except queue.Empty:
                # Timeout, kiểm tra xem có còn cần thiết không
                continue
            except Exception as e:
                print(f"[QUEUE] Lỗi worker thread {dest_id}: {e}")
                time.sleep(1)

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
                for result in download_results:
                    if "path" in result:
                        image_paths.append(result["path"])
                        photo_meta.append({
                            "width": result["meta"].get("width", 0),
                            "height": result["meta"].get("height", 0),
                        })
            
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
                # Thêm ảnh vào danh sách
                for idx, photo_item in enumerate(photos):
                    media_items.append({
                        "type": "photo",
                        "id_in_group": photo_item.get("id_in_group", 999999),
                        "image_path": image_paths[idx] if idx < len(image_paths) else None,
                        "meta": photo_meta[idx] if idx < len(photo_meta) else None,
                    })
                # Thêm video vào danh sách
                for video_item in videos:
                    media_items.append({
                        "type": "video",
                        "id_in_group": video_item.get("id_in_group", 999999),
                        "url": video_item.get("url"),
                        "thumb": video_item.get("thumb"),
                        "duration": video_item.get("duration", 1000),
                    })
                
                # Sort theo id_in_group để đảm bảo thứ tự đúng
                media_items.sort(key=lambda x: x.get("id_in_group", 999999))
                
                # Gom ảnh để gửi gộp 1 lần, video gửi riêng (vì không thể gộp ảnh + video)
                photo_paths_to_send = []
                for item in media_items:
                    if item["type"] == "photo" and item["image_path"]:
                        photo_paths_to_send.append(item["image_path"])
                    else:  # video - gửi trước nếu có ảnh đang chờ
                        # Nếu có ảnh đang chờ, gửi ảnh trước
                        if photo_paths_to_send:
                            try:
                                self.sendMultiLocalImage(
                                    photo_paths_to_send,
                                    dest,
                                    ThreadType.GROUP,
                                )
                                print(
                                    f"[ROUTING] Đã forward {len(photo_paths_to_send)} ảnh (gộp group) từ {batch_key[0]} → {dest}"
                                )
                            except Exception as e:
                                print(f"[ROUTING] Lỗi gửi batch ảnh tới {dest}: {e}")
                            photo_paths_to_send = []
                        
                        # Gửi video
                        try:
                            media_url = item["url"]
                            thumb_url = item["thumb"]
                            duration = item["duration"]
                            if media_url:
                                self.sendRemoteVideo(
                                    media_url,
                                    thumb_url or media_url,
                                    duration,
                                    dest,
                                    ThreadType.GROUP,
                                )
                                print(f"[ROUTING] Đã forward video (id_in_group={item['id_in_group']}) từ {batch_key[0]} → {dest}")
                        except Exception as e:
                            print(f"[ROUTING] Lỗi gửi video (id_in_group={item['id_in_group']}) tới {dest}: {e}")
                
                # Gửi batch ảnh còn lại (nếu có, không có video nào sau đó)
                if photo_paths_to_send:
                    try:
                        self.sendMultiLocalImage(
                            photo_paths_to_send,
                            dest,
                            ThreadType.GROUP,
                        )
                        print(
                            f"[ROUTING] Đã forward {len(photo_paths_to_send)} ảnh (gộp group) từ {batch_key[0]} → {dest}"
                        )
                    except Exception as e:
                        print(f"[ROUTING] Lỗi gửi batch ảnh tới {dest}: {e}")
        finally:
            # Dọn file tạm
            for p in image_paths:
                try:
                    if os.path.exists(p):
                        os.remove(p)
                except Exception:
                    pass
            self.media_batch_context.pop(batch_key, None)

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

    def _send_single_video_sync(self, media_url, thumb_url, duration, dest_id):
        """Gửi video đơn đồng bộ (chạy trong worker thread)."""
        try:
            self.sendRemoteVideo(
                media_url,
                thumb_url or media_url,
                duration,
                dest_id,
                ThreadType.GROUP,
            )
            print(f"[ROUTING] Đã forward video từ → {dest_id}")
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
        thread_id, author_id = batch_key[0], batch_key[1]
        dest_ids = batch.get("dest_ids", [])
        if isinstance(dest_ids, set):
            dest_ids = list(dest_ids)
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
        if thread_id and str(thread_id).lower() in self.input_group_tags:
            return self.input_group_tags[str(thread_id).lower()]
        if group_name and group_name.lower() in self.input_group_tags:
            return self.input_group_tags[group_name.lower()]
        return ""

    def _handle_routing(self, message, message_object, thread_id, thread_type, group_name, author_id):
        """
        Kiểm tra keyword và forward tin nhắn sang nhóm đích.
        - Nếu là tin nhắn text có chứa keyword → forward text và lưu context.
        - Nếu là ảnh / video ngay sau đó (trong 60s, cùng người gửi, cùng nhóm) → forward media (ở đây gửi link kèm).
        """
        if thread_type != ThreadType.GROUP:
            return

        msg_type = getattr(message_object, "msgType", None)
        current_session_id = self._get_route_session_id(thread_id, author_id)

        # Sticker được dùng như điểm mở bài cho 1 trọ mới → reset phiên
        if msg_type == "chat.sticker":
            try:
                # QUAN TRỌNG: Đợi một chút để đảm bảo tất cả ảnh/video của batch đã đến
                # (vì ảnh có thể đến sau text nhưng trước sticker)
                time.sleep(2)  # Đợi 2 giây để đảm bảo tất cả media đã đến
                
                # QUAN TRỌNG: Đợi TẤT CẢ task trong queue xong (bao gồm text + ảnh/video của session cũ)
                # trước khi reset session
                # Lấy dest_ids từ context để đợi queue của từng dest_id
                ctx = self.last_route_context.get((thread_id, author_id))
                dest_ids_to_wait = set()
                if ctx:
                    dest_ids_to_wait.update(ctx.get("dest_ids", []))
                
                current_session_id = self._get_route_session_id(thread_id, author_id)
                
                # Flush TẤT CẢ batch cũ của session hiện tại vào queue (kể cả chưa đủ số lượng)
                batches_to_flush = []
                for batch_key, batch in list(self.media_batch_context.items()):
                    if batch_key[0] == thread_id and batch_key[1] == author_id and batch_key[2] == current_session_id:
                        batches_to_flush.append((batch_key, batch))
                        # Thêm dest_ids từ batch vào danh sách cần đợi
                        batch_dest_ids = batch.get("dest_ids", [])
                        if isinstance(batch_dest_ids, set):
                            batch_dest_ids = list(batch_dest_ids)
                        dest_ids_to_wait.update(batch_dest_ids)
                        print(f"[ROUTING] Sticker: flush batch {batch_key} (đã nhận {len(batch.get('photos', []))} ảnh + {len(batch.get('videos', []))} video / tổng {batch.get('expected', 0)})")
                
                # Đưa tất cả batch vào queue (kể cả chưa đủ)
                for batch_key, batch in batches_to_flush:
                    try:
                        self._send_batch_and_cleanup(batch_key, batch)
                    except Exception as e:
                        print(f"[ROUTING] Lỗi flush batch khi có sticker: {e}")
                
                # Đợi queue rỗng của TẤT CẢ dest_id liên quan
                if dest_ids_to_wait:
                    print(f"[ROUTING] Sticker đến: đợi queue xong của {len(dest_ids_to_wait)} dest_id(s) trước khi reset session")
                    for dest_id in dest_ids_to_wait:
                        q = self.send_queues.get(dest_id)
                        if q:
                            try:
                                # Đợi queue rỗng với timeout
                                start_time = time.time()
                                timeout_seconds = 120  # Timeout tổng 120s
                                stable_count = 0  # Đếm số lần queue size không đổi
                                while True:
                                    current_size = q.qsize()
                                    if current_size == 0:
                                        # Queue rỗng, đợi thêm 0.5s để đảm bảo worker đã xử lý xong task cuối
                                        stable_count += 1
                                        if stable_count >= 5:  # 5 lần check (0.5s) đều rỗng
                                            break
                                    else:
                                        stable_count = 0  # Reset counter nếu queue còn task
                                    
                                    if time.time() - start_time > timeout_seconds:
                                        print(f"[ROUTING] Timeout đợi queue {dest_id} xong sau {timeout_seconds}s (size={current_size}), tiếp tục")
                                        break
                                    time.sleep(0.1)  # Đợi 100ms rồi check lại
                                print(f"[ROUTING] Đã đợi xong queue của dest_id {dest_id} (size={q.qsize()})")
                            except Exception as e:
                                print(f"[ROUTING] Lỗi đợi queue {dest_id} xong khi có sticker: {e}")
                
                # Sau đó mới reset session
                self._bump_route_session(thread_id, author_id, reason="sticker mở bài")
            except Exception as e:
                print(f"[ROUTING] Lỗi xử lý sticker: {e}")
                try:
                    self._bump_route_session(thread_id, author_id, reason="sticker mở bài (có lỗi)")
                except:
                    pass
            return

        # Xử lý trường hợp media dựa trên context trước
        if msg_type in ["chat.photo", "chat.video", "chat.video.msg"]:
            now_ts = time.time()
            # Trước khi xử lý ảnh mới, flush batch cũ đã hết hạn để tránh mất ảnh
            self._flush_expired_batches(now_ts)
            ctx = self.last_route_context.get((thread_id, author_id))
            print(f"[ROUTING] Media đến: ctx={ctx is not None}, expire={ctx.get('expire', 0) if ctx else 0} >= {now_ts}, session_id={ctx.get('session_id') if ctx else None} == {current_session_id}")
            if (
                ctx
                and ctx.get("expire", 0) >= now_ts
                and ctx.get("session_id") == current_session_id
            ):
                dest_ids = ctx.get("dest_ids") or []
                ctx_session_id = ctx.get("session_id", current_session_id)
                for dest_id in dest_ids:
                    if not dest_id or dest_id == thread_id:
                        continue
                    try:
                        content = getattr(message_object, "content", None)

                        # Lấy metadata từ params để kiểm tra group layout
                        group_layout_id = None
                        total_item_in_group = None
                        params_raw = content.get("params")
                        if params_raw:
                            try:
                                params_data = json.loads(params_raw)
                                group_layout_id = params_data.get("group_layout_id")
                                total_item_in_group = params_data.get("total_item_in_group")
                            except Exception:
                                pass

                        # Nếu là group layout (gửi nhiều media 1 lúc) thì gom batch rồi gửi 1 lần
                        if group_layout_id and total_item_in_group and int(total_item_in_group) > 1:
                            batch_key = (thread_id, author_id, ctx_session_id, str(group_layout_id))
                            batch = self.media_batch_context.get(batch_key)
                            if not batch:
                                batch = {
                                    "expected": int(total_item_in_group),
                                    "photos": [],
                                    "videos": [],
                                    "dest_ids": set(),
                                    "expire": now_ts + 60,
                                }
                            
                            batch["dest_ids"].add(dest_id)
                            
                            # Lấy id_in_group để sắp xếp đúng thứ tự
                            id_in_group = None
                            if params_raw:
                                try:
                                    params_data = json.loads(params_raw)
                                    id_in_group = params_data.get("id_in_group")
                                    if id_in_group is not None:
                                        id_in_group = int(id_in_group)
                                except Exception:
                                    pass
                            
                            # 1) Ảnh
                            if msg_type == "chat.photo":
                                media_url = content.get("hd") or content.get("href")
                                if media_url:
                                    orig_width, orig_height = 2560, 2560
                                    if params_raw:
                                        try:
                                            params_data = json.loads(params_raw)
                                            orig_width = int(params_data.get("width", orig_width))
                                            orig_height = int(params_data.get("height", orig_height))
                                        except Exception:
                                            pass
                                    batch["photos"].append({
                                        "url": media_url,
                                        "width": orig_width,
                                        "height": orig_height,
                                        "id_in_group": id_in_group if id_in_group is not None else 999999,  # Đặt lớn để sort sau
                                    })
                            
                            # 2) Video
                            elif msg_type in ["chat.video", "chat.video.msg"]:
                                media_url = content.get("href")
                                thumb_url = content.get("thumb") or content.get("hd")
                                duration = 1000
                                if params_raw:
                                    try:
                                        params_data = json.loads(params_raw)
                                        duration = int(params_data.get("duration", duration))
                                    except Exception:
                                        pass
                                if media_url:
                                    batch["videos"].append({
                                        "url": media_url,
                                        "thumb": thumb_url,
                                        "duration": duration,
                                        "id_in_group": id_in_group if id_in_group is not None else 999999,  # Đặt lớn để sort sau
                                    })
                            
                            self.media_batch_context[batch_key] = batch
                            
                            # Kiểm tra đã đủ số lượng chưa (ảnh + video)
                            total_received = len(batch["photos"]) + len(batch["videos"])
                            print(f"[ROUTING] Batch {batch_key}: đã nhận {total_received}/{batch['expected']} (ảnh={len(batch['photos'])}, video={len(batch['videos'])})")
                            if total_received >= batch["expected"] or now_ts >= batch["expire"]:
                                print(f"[ROUTING] Batch {batch_key} đủ số lượng hoặc hết hạn, đưa vào queue")
                                self._send_batch_and_cleanup(batch_key, batch)
                        
                        else:
                            # Media đơn (không có group layout): đưa vào queue
                            # 1) Ảnh đơn
                            if msg_type == "chat.photo":
                                media_url = content.get("hd") or content.get("href")
                                if media_url:
                                    orig_width, orig_height = 2560, 2560
                                    if params_raw:
                                        try:
                                            params_data = json.loads(params_raw)
                                            orig_width = int(params_data.get("width", orig_width))
                                            orig_height = int(params_data.get("height", orig_height))
                                        except Exception:
                                            pass
                                    q = self._get_or_create_queue(dest_id)
                                    q.put({
                                        "type": "single_photo",
                                        "media_url": media_url,
                                        "dest_id": dest_id,
                                        "width": orig_width,
                                        "height": orig_height,
                                        "source_thread_id": thread_id,
                                    })
                                    print(f"[QUEUE] Đã đưa ảnh đơn vào queue từ {thread_id} → {dest_id}")
                            
                            # 2) Video đơn
                            elif msg_type in ["chat.video", "chat.video.msg"]:
                                media_url = content.get("href")
                                thumb_url = content.get("thumb") or content.get("hd")
                                duration = 1000
                                if params_raw:
                                    try:
                                        params_data = json.loads(params_raw)
                                        duration = int(params_data.get("duration", duration))
                                    except Exception:
                                        pass
                                if media_url:
                                    q = self._get_or_create_queue(dest_id)
                                    q.put({
                                        "type": "single_video",
                                        "media_url": media_url,
                                        "thumb_url": thumb_url,
                                        "duration": duration,
                                        "dest_id": dest_id,
                                        "source_thread_id": thread_id,
                                    })
                                    print(f"[QUEUE] Đã đưa video đơn vào queue từ {thread_id} → {dest_id}")
                            else:
                                # Với loại khác, tạm thời vẫn gửi link
                                media_url = None
                                if isinstance(content, dict):
                                    media_url = content.get("href") or content.get("hd")

                                text_parts = ["[FORWARD MEDIA]"]
                                if media_url:
                                    text_parts.append(media_url)
                                else:
                                    text_parts.append(str(message_object))

                                forward_msg = Message(text="\n".join(text_parts))
                                self.send(forward_msg, dest_id, ThreadType.GROUP)
                                print(f"[ROUTING] Đã forward media (link) từ {thread_id} → {dest_id}")

                    except Exception as e:
                        print(f"[ROUTING] Lỗi khi forward media tới {dest_id}: {e}")
            else:
                # Media đến nhưng không có context hoặc context đã hết hạn
                print(f"[ROUTING] Media đến nhưng không có context hợp lệ: ctx={ctx is not None}, expire={ctx.get('expire', 0) if ctx else 0} < {now_ts if ctx else 'N/A'}, session_id={ctx.get('session_id') if ctx else None} != {current_session_id}")
            # media không tự tạo context, nên return luôn
            return

        # Từ đây trở đi chỉ check keyword cho text
        if not self.keywords or not self.keyword_to_output_target:
            # Debug nhanh để biết có cấu hình chưa
            print("[ROUTING] Không có keyword hoặc mapping keyword -> nhóm đầu ra, bỏ qua.")
            return

        # Chỉ xử lý trong các nhóm đầu vào
        if not self._is_from_input_group(thread_id, group_name):
            # Debug để thấy nhóm hiện tại có nằm trong dauvao.txt không
            print(f"[ROUTING] Nhóm hiện tại (id={thread_id}, name={group_name}) không nằm trong dauvao.txt, bỏ qua.")
            return

        # Lấy nội dung text để check keyword
        text_to_check = ""
        if isinstance(message, str):
            text_to_check = message
        else:
            # Thử lấy từ message_object
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

        text_lower = text_to_check.lower()
        text_norm = self._normalize_for_match(text_to_check)
        print(f"[ROUTING] Đang check text: {text_norm!r} với keywords: {self.keywords}")

        # Tập đích cho riêng tin nhắn text hiện tại (không lẫn với các tin trước)
        current_dest_ids = set()
        # Lưu text để đưa vào queue sau khi match xong (tránh đưa nhiều lần)
        texts_to_send = {}  # {dest_id: {"text": str, "reason_kw": str}}

        # QUAN TRỌNG: Đợi queue xử lý xong session cũ trước khi xử lý text mới
        # Đảm bảo: text + ảnh/video của session cũ gửi xong → mới xử lý text mới
        # Lấy dest_ids từ context cũ để đợi queue của từng dest_id
        ctx = self.last_route_context.get((thread_id, author_id))
        dest_ids_to_wait = set()
        if ctx:
            dest_ids_to_wait.update(ctx.get("dest_ids", []))
        
        current_session_id = self._get_route_session_id(thread_id, author_id)
        
        # Flush tất cả batch cũ của session hiện tại vào queue
        batches_to_flush = []
        for batch_key, batch in list(self.media_batch_context.items()):
            if batch_key[0] == thread_id and batch_key[1] == author_id and batch_key[2] == current_session_id:
                batches_to_flush.append((batch_key, batch))
                # Thêm dest_ids từ batch vào danh sách cần đợi
                batch_dest_ids = batch.get("dest_ids", [])
                if isinstance(batch_dest_ids, set):
                    batch_dest_ids = list(batch_dest_ids)
                dest_ids_to_wait.update(batch_dest_ids)
        
        # Đưa tất cả batch vào queue
        for batch_key, batch in batches_to_flush:
            try:
                self._send_batch_and_cleanup(batch_key, batch)
            except Exception as e:
                print(f"[ROUTING] Lỗi flush batch khi text match keyword: {e}")
        
        # Đợi queue rỗng của TẤT CẢ dest_id liên quan
        if dest_ids_to_wait:
            print(f"[ROUTING] Text match keyword: đợi queue xong của {len(dest_ids_to_wait)} dest_id(s) trước khi xử lý text mới")
            for dest_id in dest_ids_to_wait:
                q = self.send_queues.get(dest_id)
                if q:
                    try:
                        # Đợi queue rỗng với timeout
                        start_time = time.time()
                        timeout_seconds = 120  # Timeout tổng 120s
                        stable_count = 0  # Đếm số lần queue size không đổi
                        while True:
                            current_size = q.qsize()
                            if current_size == 0:
                                # Queue rỗng, đợi thêm 0.5s để đảm bảo worker đã xử lý xong task cuối
                                stable_count += 1
                                if stable_count >= 5:  # 5 lần check (0.5s) đều rỗng
                                    break
                            else:
                                stable_count = 0  # Reset counter nếu queue còn task
                            
                            if time.time() - start_time > timeout_seconds:
                                print(f"[ROUTING] Timeout đợi queue {dest_id} xong sau {timeout_seconds}s (size={current_size}), tiếp tục")
                                break
                            time.sleep(0.1)  # Đợi 100ms rồi check lại
                        if batches_to_flush:
                            print(f"[ROUTING] Đã flush xong {len(batches_to_flush)} batch của session #{current_session_id} và đợi queue {dest_id} xong (size={q.qsize()})")
                    except Exception as e:
                        print(f"[ROUTING] Lỗi đợi queue {dest_id} xong khi text match keyword: {e}")

        # Ưu tiên: match theo keyword chi tiết (phường/xã/đường)
        # Chỉ forward 1 lần cho mỗi dest_id (nếu match nhiều keyword cùng đích)
        matched_keywords = []
        
        for kw in self.keywords:
            if kw and kw in text_norm:
                target = self.keyword_to_output_target.get(kw)
                if not target:
                    print(f"[ROUTING] Tìm thấy keyword '{kw}' nhưng không có nhóm đầu ra trong daura.txt")
                    continue

                out_thread_id = self._resolve_output_thread_id(target)
                if not out_thread_id:
                    print(f"[ROUTING] Target '{target}' (từ '{kw}') không tìm được groupId")
                    continue
                
                # Tránh loop: không forward nếu nhóm đích cũng là nhóm nguồn
                if out_thread_id == thread_id:
                    print(f"[ROUTING] Nhóm đích ({out_thread_id}) trùng nhóm nguồn, bỏ qua để tránh loop.")
                    continue
                
                # Chỉ lưu text 1 lần cho mỗi dest_id
                if out_thread_id not in current_dest_ids:
                    current_dest_ids.add(out_thread_id)
                    matched_keywords.append(kw)
                    
                    # Chuẩn bị text để gửi (chưa đưa vào queue)
                    if out_thread_id not in texts_to_send:
                        prefix_tag = self._get_input_tag(thread_id, group_name)
                        filtered_lines = []
                        for line in str(text_to_check).splitlines():
                            if "%" in line:
                                continue
                            filtered_lines.append(line)
                        cleaned_text = "\n".join(filtered_lines).strip()
                        if cleaned_text:
                            forward_text = f"{prefix_tag} {cleaned_text}" if prefix_tag else cleaned_text
                            texts_to_send[out_thread_id] = {
                                "text": forward_text,
                                "reason_kw": kw,
                            }
                else:
                    # Đã forward rồi, chỉ log
                    print(f"[ROUTING] Keyword '{kw}' match nhưng dest_id {out_thread_id} đã được forward từ keyword khác")

        # Nếu không match keyword chi tiết nào, fallback: kiểm tra tên quận/huyện trong nội dung
        if not current_dest_ids and self.district_names:
            for district in self.district_names:
                d_lower = district.lower()
                d_norm = self._normalize_for_match(district)
                if d_norm and d_norm in text_norm:
                    out_thread_id = self._resolve_output_thread_id(district)
                    if out_thread_id and out_thread_id != thread_id:
                        current_dest_ids.add(out_thread_id)
                        # Chuẩn bị text để gửi
                        if out_thread_id not in texts_to_send:
                            prefix_tag = self._get_input_tag(thread_id, group_name)
                            filtered_lines = []
                            for line in str(text_to_check).splitlines():
                                if "%" in line:
                                    continue
                                filtered_lines.append(line)
                            cleaned_text = "\n".join(filtered_lines).strip()
                            if cleaned_text:
                                forward_text = f"{prefix_tag} {cleaned_text}" if prefix_tag else cleaned_text
                                texts_to_send[out_thread_id] = {
                                    "text": forward_text,
                                    "reason_kw": d_lower,
                                }
                        # Một tin nhắn thường chỉ nên vào 1 quận fallback, break luôn
                        break

        # Sau khi xử lý xong toàn bộ keyword của tin nhắn hiện tại,
        # Đưa text vào queue (chỉ 1 lần cho mỗi dest_id) và tạo session mới
        if current_dest_ids:
            # Tạo session mới TRƯỚC (batch cũ đã được flush và đợi xong ở trên)
            session_id = self._bump_route_session(thread_id, author_id, reason="text match keyword")
            
            # QUAN TRỌNG: Lưu context TRƯỚC KHI đưa text vào queue
            # Để ảnh/video đến sau có thể match context ngay
            self.last_route_context[(thread_id, author_id)] = {
                "dest_ids": list(current_dest_ids),
                "expire": time.time() + 60,  # 60 giây kể từ lần match gần nhất
                "session_id": session_id,
            }
            print(f"[ROUTING] Đã tạo session #{session_id} và lưu context cho {thread_id}/{author_id}, dest_ids={list(current_dest_ids)}")
            
            # Sau đó mới đưa text vào queue với session_id mới (theo từng dest_id)
            for dest_id, text_data in texts_to_send.items():
                q = self._get_or_create_queue(dest_id)
                q.put({
                    "type": "text",
                    "text": text_data["text"],
                    "dest_id": dest_id,
                    "reason_kw": text_data["reason_kw"],
                    "session_id": session_id,  # Dùng session_id mới
                    "source_thread_id": thread_id,
                })
                print(
                    f"[QUEUE] Đã đưa text vào queue (match '{text_data['reason_kw']}', session={session_id}) từ {thread_id} → {dest_id}"
                )

    # ====== OVERRIDE EVENT / MESSAGE ======
    def onMessage(self, mid, author_id, message, message_object, thread_id, thread_type):
        # Lấy tên nhóm nếu là group
        group_name = None
        if thread_type == ThreadType.GROUP:
            try:
                group_info = self.fetchGroupInfo(thread_id)
                group = group_info.gridInfoMap[thread_id]
                group_name = getattr(group, "name", None)
            except Exception:
                group_name = None

        print(
            f"{Fore.GREEN}{Style.BRIGHT}------------------------------\n"
            f"**Message Details:**\n"
            f"- **Message:** {Style.BRIGHT}{message} {Style.NORMAL}\n"
            f"- **Author ID:** {Fore.MAGENTA}{Style.BRIGHT}{author_id} {Style.NORMAL}\n"
            f"- **Thread ID:** {Fore.YELLOW}{Style.BRIGHT}{thread_id}{Style.NORMAL}\n"
            f"- **Thread Name:** {Fore.YELLOW}{Style.BRIGHT}{group_name if group_name else 'N/A'}{Style.NORMAL}\n"
            f"- **Thread Type:** {Fore.BLUE}{Style.BRIGHT}{thread_type}{Style.NORMAL}\n"
            f"- **Message Object:** {Fore.RED}{Style.BRIGHT}{message_object}{Style.NORMAL}\n"
            f"{Fore.GREEN}{Style.BRIGHT}------------------------------\n"
        )

        # Xử lý lệnh !sticker
        if isinstance(message, str) and message.strip() == "!sticker":
            if thread_type == ThreadType.GROUP:
                try:
                    self._send_sticker(thread_id)
                    print(f"[COMMAND] Đã gửi sticker vào nhóm {thread_id} theo lệnh !sticker")
                except Exception as e:
                    print(f"[COMMAND] Lỗi gửi sticker: {e}")
            return

        # ROUTING tin nhắn theo keyword / file cấu hình
        self._handle_routing(message, message_object, thread_id, thread_type, group_name, author_id)


if __name__ == "__main__":
    client = Client(API_KEY, SECRET_KEY, IMEI, SESSION_COOKIES)
    client.listen(thread=True, delay=0)

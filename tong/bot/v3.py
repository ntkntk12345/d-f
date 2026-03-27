"""
Bot2 - Forward tin nhắn từ các nhóm đầu vào → nhiều nhóm đầu ra (theo keyword)
- ACC1 (IMEI1): CHỈ DÙNG ĐỂ LISTEN (nghe tin nhắn)
- ACC2 (IMEI2): DÙNG CHO TẤT CẢ thao tác khác (gửi, fetch, upload...)
- Đọc nhóm đầu vào từ dauvao.txt (format: tên_nhóm|ký_hiệu)
- Đọc keywords từ daura.json để match với nhóm đầu ra
- Xử lý tin nhắn theo quy tắc (xóa hoa hồng, thêm ký hiệu, chỉnh giá...)
- Gửi đến NHIỀU nhóm dựa trên keyword matching
"""

import os
import sys
import re
import time
import json
import queue
import threading
import requests
import random
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# Fix encoding cho Windows console
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from config import API_KEY, SECRET_KEY, IMEI1, SESSION_COOKIES1
from zlapi import ZaloAPI
from zlapi.models import Message, ThreadType
from colorama import Fore, Style, init

init(autoreset=True)

# ==================== CONFIG FILES ====================
DAUVAO_FILE = "dauvao.txt"
DAURA_FILE = "daura.json"  # Keyword mapping for output groups (hierarchical structure)

# ==================== LOAD CONFIG ====================
def load_dauvao():
    """Load mapping từ dauvao.txt: {group_id: ký hiệu}"""
    mapping = {}  # {group_id: symbol}
    group_names = {}  # {group_id: group_name} - để tìm ID sau
    
    if not os.path.exists(DAUVAO_FILE):
        print(f"[CONFIG] Không tìm thấy {DAUVAO_FILE}")
        return mapping, group_names
    
    with open(DAUVAO_FILE, "r", encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or "|" not in line:
                continue
            parts = line.split("|", 1)
            if len(parts) == 2:
                group_name = parts[0].strip()
                symbol = parts[1].strip()
                # Giả sử group_name chính là group_id hoặc sẽ được map sau
                group_names[group_name] = symbol
                print(f"[DAUVAO] {group_name} → {symbol}")
    
    print(f"[DAUVAO] Đã load {len(group_names)} nhóm đầu vào")
    return group_names


def load_daura_keywords():
    """Load keywords từ daura.json với cấu trúc phân cấp
    Format JSON: {
        "District": {
            "type": "district",
            "wards": ["Ward1", "Ward2"],
            "streets": ["Street1", "Street2"]
        }
    }
    Returns: 
        - set of all unique keywords (district + ward + street names)
        - dict mapping keyword to its level (district/ward/street)
    """
    keywords = set()
    keyword_levels = {}  # {keyword: level} - để biết keyword thuộc cấp nào
    
    if not os.path.exists(DAURA_FILE):
        print(f"[CONFIG] Không tìm thấy {DAURA_FILE}")
        return keywords, keyword_levels
    
    try:
        with open(DAURA_FILE, "r", encoding="utf-8-sig") as f:  # Fix BOM error
            data = json.load(f)
        
        for district, info in data.items():
            # Add district name
            keywords.add(district)
            keyword_levels[district] = info.get("type", "district")
            
            # Add wards
            for ward in info.get("wards", []):
                keywords.add(ward)
                keyword_levels[ward] = "ward"
            
            # Add streets
            for street in info.get("streets", []):
                keywords.add(street)
                keyword_levels[street] = "street"
        
        print(f"[DAURA] Đã load {len(keywords)} keywords từ {DAURA_FILE}")
        print(f"[DAURA] Phân cấp: {len([k for k,v in keyword_levels.items() if v in ['district','area']])} quận/khu vực, "
              f"{len([k for k,v in keyword_levels.items() if v=='ward'])} phường/xã, "
              f"{len([k for k,v in keyword_levels.items() if v=='street'])} đường")
        
    except Exception as e:
        print(f"[DAURA] Lỗi load JSON: {e}")
    
    return keywords, keyword_levels


# ==================== QUY TẮC XỬ LÝ ====================
RULES = {
    "1a": {"remove_commission": True, "add_prefix": True, "format_price": "mbkd_only"},
    "2a": {"remove_commission": True, "add_prefix": True},
    "3a": {"add_prefix": True},
    "4a": {"remove_commission": True, "add_prefix": True, "keep_contract_duration": True},
    "5a": {"remove_commission": True, "add_prefix": True},
    "6a": {"remove_commission": True, "add_prefix": True},
    "8a": {"remove_commission": True, "add_prefix": True},
    "9a": {"remove_commission": True, "add_prefix": True},
    "10a": {"remove_commission": True, "add_prefix": True},
    "11a": {"remove_commission": True, "remove_bonus": True, "add_prefix": True, "format_price": True},
    "12a": {"remove_commission": True, "add_prefix": True},
    "13a": {"remove_commission": True, "add_prefix": True},
    "14a": {"remove_commission": True, "add_prefix": True},
    "111a": {"remove_commission": True, "add_prefix": True},  # Khaicute
    "sleepbox": {"add_prefix": True},
    "tdland": {"remove_phone": True, "add_prefix": True, "format_price": True},
    "alophongtro": {"remove_phone": True, "add_prefix": True, "format_price": True},
    "3h": {"add_prefix": True, "format_price": True},
    "avhome": {"add_prefix": True},
    "nv home": {"remove_commission": True, "remove_bonus": True, "add_prefix": True, "format_price": True},
    "agp": {"remove_commission": True, "add_prefix": True},
    "hdhome": {"remove_phone": True, "add_prefix": True, "format_price": True, "remove_links": True},
    "mkland": {"remove_phone": True, "remove_commission": True, "add_prefix": True},
    "tm1": {"remove_commission": True, "add_prefix": True, "format_price": True},
    "tm2": {"remove_commission": True, "add_prefix": True, "format_price": True},
    # Newly added symbols
    "tc home": {"add_prefix": True},  # Routes to MBKD or Nguyên căn based on content
    "tài phát": {"add_prefix": True, "remove_phone": True},  # Routes to MBKD or Nguyên căn
    "tai phát": {"add_prefix": True, "remove_phone": True},  # Typo variant
    "việt quốc": {"add_prefix": True},  # Routes to Nguyên căn
}



# ==================== HÀM XỬ LÝ TIN NHẮN ====================
# ==================== CONSTANTS ====================
# Regex Patterns (Compiled Global)
PHONE_REGEX = re.compile(r'\b0(?:[\.\s]*\d){9,}\b')
CONTACT_KEYWORD_REGEX = re.compile(r'\b(liên\s*hệ|lh|l\.h|sđt|sdt|zalo|call)\b', re.IGNORECASE)
SPECIAL_PATTERNS = [
    re.compile(r'📞\s*SĐT\s*dẫn\s*:?\s*\d+', re.IGNORECASE),
    re.compile(r'SĐT\s*dẫn\s*:?\s*\d+', re.IGNORECASE),
    re.compile(r'❣\s*QUẢN\s*LÝ\s*:', re.IGNORECASE),
    re.compile(r'QUẢN\s*LÝ\s*:.*\d{9,}', re.IGNORECASE),
]

# ==================== HÀM XỬ LÝ TIN NHẮN ====================
def format_price_to_xtr(text):
    """Chuyển giá về dạng Xtr (8.500.000 → 8tr5, 4.3 → 4tr3)"""
    
    # 1. Chuyển full số (8.000.000 -> 8tr)
    def convert_price(match):
        price_str = match.group(0)
        num = price_str.replace('.', '').replace(',', '')
        try:
            value = int(num) / 1000000
            whole = int(value)
            decimal = round((value - whole) * 10)
            if decimal > 0:
                return f"{whole}tr{decimal}"
            return f"{whole}tr"
        except:
            return price_str
    
    text = re.sub(r'\d{1,2}[.,]\d{3}[.,]\d{3}', convert_price, text)
    
    # 2. Chuyển Xtr (8,5tr -> 8tr, 8tr -> 8tr)
    # User Request: "8,5tr thành 8tr" (Truncate decimal)
    def convert_xtr(match):
        price_str = match.group(0).lower()
        num_part = price_str.replace('tr', '').replace(',', '.').strip()
        try:
            value = float(num_part)
            whole = int(value)
            # Yêu cầu xóa số lẻ cho trường hợp Xtr: 8,5tr -> 8tr
            return f"{whole}tr"
        except:
            return price_str
    
    text = re.sub(r'\d+[.,]?\d*\s*tr', convert_xtr, text, flags=re.IGNORECASE)
    
    # 3. Chuyển Xk (8000k -> 8tr)
    def convert_k(match):
        price_str = match.group(0).lower()
        num_part = price_str.replace('k', '').strip()
        try:
            value = int(num_part) / 1000
            whole = int(value)
            decimal = round((value - whole) * 10)
            if decimal > 0:
                return f"{whole}tr{decimal}"
            return f"{whole}tr"
        except:
            return price_str
    
    text = re.sub(r'\d{4,}k', convert_k, text, flags=re.IGNORECASE)

    # 4. Chuyển float trần (4.3 -> 4tr3)
    # Context: "giá 4.3", "4.3", "tài chính 4.3"
    # Tránh nhầm lẫn với ngày tháng, version, kích thước nếu có thể.
    # Tuy nhiên user yêu cầu "ví dụ giá 4.3 -> 4tr3", nên ta sẽ convert các số format X.Y hoặc X,Y
    # Giới hạn value < 100 để tránh số lạ? 4.3 triệu là hợp lý.
    
    def convert_bare_float(match):
        s = match.group(0)
        try:
            val_s = s.replace(',', '.')
            val = float(val_s)
            
            # Chỉ convert nếu giá trị < 100 (giả sử giá thuê < 100tr) để an toàn
            # Và > 1 (1.5tr)
            if 0 < val < 200: 
                whole = int(val)
                decimal = round((val - whole) * 10)
                if decimal > 0:
                    return f"{whole}tr{decimal}"
                return f"{whole}tr"
        except:
            pass
        return s

    # Regex bắt số float: \d+[.,]\d+ 
    # Lookbehind/ahead để tránh dính liền text khác?
    # Pattern: \b\d+[.,]\d{1,2}\b (1-2 số thập phân)
    text = re.sub(r'\b\d+[.,]\d{1,2}\b', convert_bare_float, text)

    return text


def remove_commission(text, keep_contract_duration=False):
    """XÓA CẢ DÒNG có chứa hoa hồng, sale, %.
    KHÔNG chỉ xóa từ khóa mà XÓA TOÀN BỘ DÒNG."""
    lines = text.split('\n')
    result_lines = []
    
    # 1. Nếu cần giữ HD (hợp đồng), extract nó từ text gốc
    hd_info = ""
    if keep_contract_duration:
        hd_match = re.search(r'\(\s*hd\s*\d+\s*th\s*\)', text, re.IGNORECASE)
        if hd_match:
            hd_info = hd_match.group(0)

    # Patterns để CHECK và XÓA CẢ DÒNG
    line_delete_patterns = [
        r'\bsale\b',                    # 'sale'
        r'\bctv\b',                     # 'ctv' - cộng tác viên
        r'[Hh][Hh]',                    # 'HH' hoặc 'hh'
        r'[Hh]oa\s*[Hh]ồng',           # 'Hoa hồng'
        r'\d+\s*%',                     # Số + %
        r'%',                           # % đơn lẻ
        r'🌺', r'🌹',                   # Icons hoa hồng
        r'Mã\s*này\s*chủ\s*đánh\s*thuế',  # Mã này chủ đánh thuế
    ]

    for line in lines:
        stripped_line = line.strip()
        if not stripped_line:
            result_lines.append("")
            continue
        
        # CHECK: Nếu dòng chứa BẤT KỲ pattern nào → XÓA CẢ DÒNG
        should_delete = False
        for pattern in line_delete_patterns:
            if re.search(pattern, stripped_line, re.IGNORECASE):
                should_delete = True
                break
        
        if should_delete:
            continue  # SKIP dòng này
        
        # Giữ lại dòng
        result_lines.append(stripped_line)
    
    processed = '\n'.join(result_lines)
    
    # 3. Trả về text đã clean + hd_info nếu có
    if hd_info and hd_info not in processed:
        processed += f"\n{hd_info}"
        
    return processed.strip()


def remove_bonus(text):
    """XÓA CẢ DÒNG có chứa 'thưởng' hoặc icons thưởng."""
    lines = text.split('\n')
    result_lines = []
    
    # Patterns để CHECK và XÓA CẢ DÒNG
    bonus_patterns = [
        r'[Tt]hưởng',       # 'Thưởng' hoặc 'thưởng'
        r'🎉',              # Icon thưởng
    ]
    
    for line in lines:
        stripped_line = line.strip()
        if not stripped_line:
            result_lines.append("")
            continue
        
        # CHECK: Nếu dòng chứa BẤT KỲ pattern nào → XÓA CẢ DÒNG
        should_delete = False
        for pattern in bonus_patterns:
            if re.search(pattern, stripped_line, re.IGNORECASE):
                should_delete = True
                break
        
        if should_delete:
            continue  # SKIP dòng này
        
        # Giữ lại dòng
        result_lines.append(stripped_line)
    
    return '\n'.join(result_lines).strip()


def remove_phone(text):
    """XÓA CẢ DÒNG có chứa số điện thoại hoặc từ khóa liên hệ."""
    lines = text.split('\n')
    result_lines = []
    
    # Patterns để CHECK và XÓA CẢ DÒNG
    phone_delete_patterns = [
        r'\b0(?:[\.\s]*\d){9,}\b',          # Phone number: 0 + 9+ digits
        r'\b(liên\s*hệ|lh|l\.h)\b',        # 'liên hệ', 'lh', 'l.h'
        r'\b(sđt|sdt)\b',                   # 'sđt', 'sdt'
        r'\bzalo\b',                        # 'zalo'
        r'\bcall\b',                        # 'call'
        r'📞',                              # Phone icon
        r'SĐT\s*dẫn',                       # 'SĐT dẫn'
        r'QUẢN\s*LÝ\s*:',                   # 'QUẢN LÝ:'
    ]
    
    for line in lines:
        stripped_line = line.strip()
        if not stripped_line:
            result_lines.append("")
            continue
        
        # CHECK: Nếu dòng chứa BẤT KỲ pattern nào → XÓA CẢ DÒNG
        should_delete = False
        for pattern in phone_delete_patterns:
            if re.search(pattern, stripped_line, re.IGNORECASE):
                should_delete = True
                break
        
        if should_delete:
            continue  # SKIP dòng này
        
        # Giữ lại dòng
        result_lines.append(stripped_line)
    
    return '\n'.join(result_lines).strip()


def remove_links(text):
    """Xóa link FB/Docs"""
    return re.sub(r'https?://(www\.)?(facebook\.com|fb\.com|docs\.google\.com)[^\s]*', '', text)


def add_prefix(text, symbol):
    """Thêm ký hiệu đầu dòng"""
    text = text.strip()
    if text:
        return f"{symbol} {text}"
    return text


def process_message(text, symbol):
    """Xử lý tin nhắn theo quy tắc của ký hiệu"""
    if not text or not text.strip():
        return text
    
    rules = RULES.get(symbol.lower(), {})
    
    processed = text
    
    # LUÔN LUÔN xóa hoa hồng và thưởng theo yêu cầu mới
    processed = remove_bonus(processed)
    
    keep_contract = rules.get("keep_contract_duration", False)
    processed = remove_commission(processed, keep_contract)
    
    if True: # User: "Tóm lại ở đâu có sdt cũng xóa đi" -> Always remove phone
        processed = remove_phone(processed)
    
    if rules.get("remove_links"):
        processed = remove_links(processed)
    
    format_price_rule = rules.get("format_price")
    if format_price_rule:
        if format_price_rule == "mbkd_only":
            if "mbkd" in text.lower() or "mặt bằng" in text.lower():
                processed = format_price_to_xtr(processed)
        else:
            processed = format_price_to_xtr(processed)
    
    if rules.get("add_prefix"):
        processed = add_prefix(processed, symbol)
    
    # Clean up lines
    lines = processed.split('\n')
    cleaned = []
    prev_empty = False
    for line in lines:
        if line.strip():
            cleaned.append(line)
            prev_empty = False
        elif not prev_empty:
            cleaned.append(line)
            prev_empty = True
    
    return '\n'.join(cleaned).strip()


# ==================== BOT CLASS ====================
class Bot1(ZaloAPI):
    def __init__(self, api_key, secret_key, accounts):
        """
        accounts: List of dict [{"imei":..., "session_cookies":...}, ...]
        ACC1 (accounts[0]): Listener Only
        ACC2..N (accounts[1:]): All Senders (Multi-threaded, Session-based)
        """
        if len(accounts) < 2:
            raise ValueError("Cần ít nhất 2 tài khoản (1 Listen, 1+ Send)")
            
        listener_acc = accounts[0]
        self.sender_accounts_config = accounts[1:] # A list of configs
        
        # Save credentials for re-init
        self.api_key = api_key
        self.secret_key = secret_key
        
        # Bot chính để listen (ACC1)
        super().__init__(api_key, secret_key, imei=listener_acc["imei"], session_cookies=listener_acc["session_cookies"])
        
        self.is_running = True
        self.send_lock = threading.Lock() # Lock for sender operations
        
        # Multi-Sender Architecture: Initialize ALL senders at once
        self.senders = []  # List of sender objects
        self.current_sender_index = 0  # For round-robin distribution
        
        # Load config Static
        self.group_symbols = load_dauvao()
        self.all_keywords, self.keyword_levels = load_daura_keywords()
        self.input_groups = {}
        
        # Load district data for area-specific saving
        self.district_data = {}
        try:
            with open(DAURA_FILE, 'r', encoding='utf-8') as f:
                self.district_data = json.load(f)
        except Exception as e:
            print(f"[INIT] Error loading district data: {e}")
        
        # Session buffer
        self.session_buffers = {}
        self.session_lock = threading.RLock() # SỬ DỤNG RLOCK để tránh deadlock khi flush_immediate
        
        # Photo cache for reply detection (11A, 12A)
        self.photo_cache = {}
        self.photo_cache_lock = threading.RLock()
        
        # Duplication prevention
        self.mid_cache_file = "processed_mids.txt"
        self.processed_mids = self._load_mid_cache()
        self.mid_lock = threading.Lock()
        
        # Deduplication toàn cục cho nội dung
        self.sent_content_cache = {} # {content_hash: timestamp}
        self.sent_content_lock = threading.Lock()
        
        # Session counter and rest period
        self.session_count = 0
        self.session_count_lock = threading.Lock()
        self.sessions_before_rest = 30
        self.rest_duration_min = 300  # 5 minutes
        self.rest_duration_max = 600  # 10 minutes
        
        # Workers
        self.cleanup_thread = threading.Thread(target=self._mid_cleanup_worker, daemon=True)
        self.cleanup_thread.start()
        
        self.heartbeat_thread = threading.Thread(target=self._heartbeat_worker, daemon=True)
        self.heartbeat_thread.start()
        
        # Initialize ALL sender accounts
        self._init_all_senders()
        
        # Timeout settings
        self.session_check_interval = 15.0
        self.session_max_timeout = 90.0
        
        # Queue gửi tin & Worker session-based
        self.send_queue = queue.Queue()
        self.pending_queue_file = "pending_queue.json"
        
        # Load pending items from disk
        self._load_pending_queue()
        
        # NEW: Session-based sending worker
        self.send_thread = threading.Thread(target=self._send_worker_session_based, daemon=True)
        self.send_thread.start()
        
        self.executor = ThreadPoolExecutor(max_workers=5) # Download pool
        
        # Scan Input Groups for Listener
        self._scan_input_groups()
        
        print(f"[BOT1] ACC1 = Listener")
        print(f"[BOT1] Initialized {len(self.senders)} sender accounts")
        print(f"[BOT1] Session-based sending: Round-robin across senders")

    def _init_all_senders(self):
        """Initialize ALL sender accounts at startup with isolated group maps"""
        print(f"\n[INIT] Initializing {len(self.sender_accounts_config)} sender accounts...")
        
        for idx, acc_cfg in enumerate(self.sender_accounts_config):
            try:
                print(f"\n[INIT] Setting up Sender-{idx+1}...")
                
                # Create ZaloAPI instance for this sender
                sender_api = ZaloAPI(self.api_key, self.secret_key,
                                    imei=acc_cfg["imei"],
                                    session_cookies=acc_cfg["session_cookies"])
                
                # Get sender UID
                try:
                    sender_uid = str(sender_api._state.user_id)
                except:
                    sender_uid = f"Sender-{idx+1}"
                
                # Scan groups for THIS sender
                output_groups_map = {}  # {keyword: [group_ids]}
                group_id_to_name = {}   # {group_id: name}
                
                print(f"[INIT] Scanning groups for Sender-{idx+1}...")
                all_groups = sender_api.fetchAllGroups()
                group_ids = []
                grid_map = {}
                
                if all_groups and hasattr(all_groups, "gridVerMap"):
                    group_ids = list(all_groups.gridVerMap.keys())
                    grid_map = getattr(all_groups, "gridInfoMap", {}) or {}
                
                # Fetch missing group info
                if len(grid_map) < len(group_ids):
                    missing = [g for g in group_ids if str(g) not in grid_map]
                    if missing:
                        print(f"   -> Fetching info for {len(missing)} groups...")
                        chunk_size = 50
                        for i in range(0, min(len(missing), 200), chunk_size):
                            chunk = missing[i:i+chunk_size]
                            try:
                                batch = {str(gid): 0 for gid in chunk}
                                res = sender_api.fetchGroupInfo(batch)
                                if hasattr(res, "gridInfoMap"):
                                    grid_map.update(res.gridInfoMap)
                            except:
                                pass
                
                # Process groups and map keywords
                count_avail = 0
                for gid_str, data in grid_map.items():
                    name = data.get("name", "") if isinstance(data, dict) else getattr(data, "name", "")
                    if not name:
                        continue
                    
                    group_id_to_name[gid_str] = name
                    
                    # Match keywords
                    matched = self._extract_keywords_from_name(name)
                    if matched:
                        count_avail += 1
                        for kw in matched:
                            kw = kw.lower()
                            if kw not in output_groups_map:
                                output_groups_map[kw] = []
                            if gid_str not in output_groups_map[kw]:
                                output_groups_map[kw].append(gid_str)
                
                # Create sender object
                sender_obj = {
                    "api": sender_api,
                    "index": idx,
                    "name": f"Sender-{idx+1}",
                    "uid": sender_uid,
                    "output_groups_map": output_groups_map,
                    "group_id_to_name": group_id_to_name,
                    "is_limited": False
                }
                
                self.senders.append(sender_obj)
                print(f"[INIT] ✓ Sender-{idx+1} ready with {count_avail} output groups mapped")
                
            except Exception as e:
                print(f"[INIT] ✗ Failed to initialize Sender-{idx+1}: {e}")
        
        print(f"\n[INIT] ✓ Successfully initialized {len(self.senders)}/{len(self.sender_accounts_config)} senders\n")

    def _safe_int(self, value, default):
        try:
            return int(value)
        except:
            return default
        
    def _load_pending_queue(self):
        """Load các item chưa gửi từ file json"""
        try:
            if os.path.exists(self.pending_queue_file):
                with open(self.pending_queue_file, "r", encoding="utf-8") as f:
                    items = json.load(f)
                    if isinstance(items, list):
                        count = 0
                        for item in items:
                            self.send_queue.put(item)
                            count += 1
                        print(f"[PERSISTENCE] Đã khôi phục {count} tin nhắn từ {self.pending_queue_file}")
        except Exception as e:
            print(f"[PERSISTENCE] Lỗi load pending queue: {e}")

    def _generate_content_hash(self, item):
        """Tạo mã hash cho nội dung để deduplication"""
        try:
            texts = item.get("texts", [])
            text_str = "".join([t.get("text", "") if isinstance(t, dict) else t for t in texts])
            # Hash dựa trên nội dung text (đã xóa khoảng trắng) + số lượng media
            clean_text = re.sub(r'\s+', '', text_str)[:300]
            media_count = len(item.get("photos", [])) + len(item.get("videos", []))
            
            import hashlib
            raw_key = f"{clean_text}_{media_count}"
            return hashlib.md5(raw_key.encode()).hexdigest()
        except:
            return str(time.time())

    def _enqueue_task(self, item):
        """Thêm task vào queue VÀ lưu vào file"""
        # 1. Deduplication toàn cục (Hash-based)
        content_hash = self._generate_content_hash(item)
        now = time.time()
        
        with self.sent_content_lock:
            # Dọn dẹp cache cũ (> 15 phút)
            self.sent_content_cache = {k: v for k, v in self.sent_content_cache.items() if now - v < 900}
            
            if content_hash in self.sent_content_cache:
                print(f"[DEDUPE] 🚫 Bỏ qua nội dung trùng lặp (Hash: {content_hash})")
                return
            
            self.sent_content_cache[content_hash] = now
            
        # 2. Merge all text parts into ONE (Nếu có nhiều text rời rạc)
        texts = item.get("texts", [])
        if len(texts) > 1:
            merged_text = "\n".join([t.get("text", "") if isinstance(t, dict) else t for t in texts])
            # Cập nhật lại item với text đã gộp
            item["texts"] = [{"text": merged_text, "timestamp": texts[0].get("timestamp", now) if isinstance(texts[0], dict) else now}]
            print(f"[SESSION] 📝 Đã gộp {len(texts)} đoạn text thành 1.")

        # 3. Add to memory queue
        self.send_queue.put(item)
        
        # 4. Persistence: Lưu vào file
        self._save_task_to_file(item)

    def _save_task_to_file(self, item):
        """Lưu một task đơn lẻ vào file persistence (Append)"""
        try:
            current_items = []
            if os.path.exists(self.pending_queue_file):
                try:
                    with open(self.pending_queue_file, "r", encoding="utf-8") as f:
                        current_items = json.load(f)
                except: pass
            
            if not isinstance(current_items, list): current_items = []
            current_items.append(item)
            
            with open(self.pending_queue_file, "w", encoding="utf-8") as f:
                json.dump(current_items, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[PERSISTENCE] Lỗi save task: {e}")

    def _save_queue_snapshot(self, items_list):
        """Lưu snapshot danh sách task vào file"""
        try:
            with open(self.pending_queue_file, "w", encoding="utf-8") as f:
                json.dump(items_list, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[PERSISTENCE] Lỗi save snapshot: {e}")

    def _update_current_task(self, updated_task):
        """Cập nhật task đầu tiên trong file persistence (để lưu tiến độ - sent_groups)"""
        try:
            if os.path.exists(self.pending_queue_file):
                current_items = []
                with open(self.pending_queue_file, "r", encoding="utf-8") as f:
                    current_items = json.load(f)
                
                if isinstance(current_items, list) and current_items:
                    current_items[0] = updated_task # Update first item
                    
                    with open(self.pending_queue_file, "w", encoding="utf-8") as f:
                        json.dump(current_items, f, ensure_ascii=False, indent=2)
                    # print(f"[PERSISTENCE] ✓ Progress saved") # Verbose logging
        except Exception as e:
            print(f"[PERSISTENCE] Error saving progress: {e}")

    def _finish_current_task(self):
        """Xóa task đầu tiên khỏi file (FIFO) sau khi gửi thành công"""
        try:
            if os.path.exists(self.pending_queue_file):
                current_items = []
                with open(self.pending_queue_file, "r", encoding="utf-8") as f:
                    current_items = json.load(f)
                
                if isinstance(current_items, list) and current_items:
                    removed = current_items.pop(0) # Remove first item
                    print(f"[PERSISTENCE] ✓ Xóa task: {removed.get('source_info', 'Unknown')}")
                    
                    with open(self.pending_queue_file, "w", encoding="utf-8") as f:
                        json.dump(current_items, f, ensure_ascii=False, indent=2)
                    
                    print(f"[PERSISTENCE] ✓ Còn lại {len(current_items)} task trong queue")
                else:
                    print(f"[PERSISTENCE] ⚠️ Queue file trống hoặc không hợp lệ")
        except Exception as e:
            print(f"[PERSISTENCE] Lỗi remove task: {e}")
    
    def _scan_input_groups(self):
        """Quét nhóm đầu vào cho Listener (Acc1)"""
        print("[BOT1] Quét nhóm Input (Listener)...")
        try:
            all_groups = self.fetchAllGroups()
            if not all_groups or not hasattr(all_groups, "gridVerMap"):
                return
            
            grid_map = getattr(all_groups, "gridInfoMap", {}) or {}
            
            # Fetch missing info for ALL groups
            group_ids = list(all_groups.gridVerMap.keys())
            print(f"[BOT1] Tổng số nhóm từ Listener: {len(group_ids)}")
            
            # If grid_map is empty or incomplete, fetch in batches
            if len(grid_map) < len(group_ids):
                missing = [g for g in group_ids if str(g) not in grid_map]
                print(f"[BOT1] Đang fetch thông tin cho {len(missing)} nhóm...")
                
                chunk_size = 50
                for i in range(0, len(missing), chunk_size):
                    chunk = missing[i:i+chunk_size]
                    try:
                        batch = {str(gid): 0 for gid in chunk}
                        info = self.fetchGroupInfo(batch)
                        if hasattr(info, "gridInfoMap"):
                            grid_map.update(info.gridInfoMap)
                    except Exception as e:
                        print(f"[BOT1] Lỗi fetch batch {i//chunk_size + 1}: {e}")
            
            # Now scan all groups
            for gid_str, data in grid_map.items():
                name = data.get("name", "") if isinstance(data, dict) else getattr(data, "name", "")
                if name:
                    symbol = self._find_symbol_for_group(name)
                    if symbol:
                         self.input_groups[gid_str] = symbol
                         print(f"[Input] ✓ Found: {name} → {symbol}")
            
            print(f"[BOT1] ✓ Đã quét xong: {len(self.input_groups)}/{len(group_ids)} nhóm là Input")
        except Exception as e:
            print(f"[Input] Error scanning input: {e}")
    
    def _find_symbol_for_group(self, group_name):
        """Tìm ký hiệu cho nhóm dựa trên tên"""
        group_name_lower = group_name.lower()
        for name, symbol in self.group_symbols.items():
            name_lower = name.lower()
            # Match nếu tên trong dauvao chứa trong tên nhóm hoặc ngược lại
            if name_lower in group_name_lower or group_name_lower in name_lower:
                return symbol
        return None
    
    def _extract_keywords_from_name(self, group_name):
        """Extract keywords from group name that match daura.txt keywords"""
        matched = []
        name_lower = group_name.lower()
        for keyword in self.all_keywords:
            if keyword.lower() in name_lower:
                matched.append(keyword)
        return matched
    
    def _extract_keywords(self, text):
        """Extract all matching keywords from message text"""
        found = []
        text_lower = text.lower()
        for keyword in self.all_keywords:
            if keyword.lower() in text_lower:
                found.append(keyword)
        return found
    
    def _find_matching_groups(self, keywords):
        """Find all groups matching any of the keywords"""
        target_groups = set()
        for keyword in keywords:
            groups = self.output_groups_map.get(keyword.lower(), [])
            target_groups.update(groups)
        return list(target_groups)
    
    def _send_photos_multisender(self, sender_obj, photos, target_group):
        """Gửi ảnh với group layout sử dụng SENDER cụ thể"""
        def download_one(idx, photo):
            url = photo.get("url")
            if not url:
                return None
            try:
                resp = requests.get(url, stream=True, timeout=15)
                resp.raise_for_status()
                # Use unique filename per thread/sender to avoid collision
                path = f"temp_{sender_obj.name}_{int(time.time()*1000)}_{idx}.jpg"
                with open(path, "wb") as f:
                    for chunk in resp.iter_content(8192):
                        f.write(chunk)
                return {"idx": idx, "path": path, "width": photo.get("width", 2560), "height": photo.get("height", 2560)}
            except:
                return None
        
        # Download parallel
        results = []
        futures = [self.executor.submit(download_one, i, p) for i, p in enumerate(photos)]
        for f in as_completed(futures):
            res = f.result()
            if res:
                results.append(res)
        results.sort(key=lambda x: x["idx"])
        
        if not results:
            return
        
        # Upload và gửi với group layout (Dùng sender_obj)
        group_layout_id = str(int(time.time() * 1000))
        total = len(results)
        
        for idx, item in enumerate(results):
            try:
                # Delay ngẫu nhiên giữa các ảnh
                if idx > 0:
                    time.sleep(random.uniform(3.0, 5.0))
                    
                upload_result = sender_obj._uploadImage(item["path"], target_group, ThreadType.GROUP)
                if not upload_result or not upload_result.get("normalUrl"):
                    continue
                
                payload = {"params": {
                    "photoId": upload_result.get("photoId", int(time.time()*2000)),
                    "clientId": upload_result.get("clientFileId", int(time.time()*1000)),
                    "desc": "", "width": item["width"], "height": item["height"],
                    "groupLayoutId": group_layout_id, "totalItemInGroup": total,
                    "isGroupLayout": 1, "idInGroup": idx,
                    "rawUrl": upload_result["normalUrl"],
                    "thumbUrl": upload_result.get("thumbUrl", upload_result["normalUrl"]),
                    "hdUrl": upload_result.get("hdUrl", upload_result["normalUrl"]),
                    "imei": getattr(sender_obj, "_imei", ""), "grid": str(target_group),
                    "oriUrl": upload_result["normalUrl"],
                    "jcp": json.dumps({"sendSource": 1, "convertible": "jxl"})
                }}
                sender_obj.sendLocalImage(item["path"], target_group, ThreadType.GROUP, 
                                   width=item["width"], height=item["height"], custom_payload=payload)
                
            except Exception as e:
                print(f"[BOT1] Lỗi gửi ảnh: {e}")
            finally:
                # Đảm bảo LUÔN LUÔN xóa file tạm
                try:
                    if os.path.exists(item["path"]):
                        os.remove(item["path"])
                except: pass
        
        group_name = self.group_id_to_name.get(target_group, target_group)
        print(f"[BOT1] {total} ảnh → {group_name}")

    def _send_photos_multisender(self, sender_obj, photos, target_group):
        """Gửi ảnh với group layout đến một nhóm cụ thể (multi-sender version)"""
        def download_one(idx, photo):
            url = photo.get("url")
            if not url:
                return None
            try:
                resp = requests.get(url, stream=True, timeout=15)
                resp.raise_for_status()
                path = f"temp_bot1_{int(time.time()*1000)}_{idx}.jpg"
                with open(path, "wb") as f:
                    for chunk in resp.iter_content(8192):
                        f.write(chunk)
                return {"idx": idx, "path": path, "width": photo.get("width", 2560), "height": photo.get("height", 2560)}
            except:
                return None
        
        # Download parallel
        results = []
        futures = [self.executor.submit(download_one, i, p) for i, p in enumerate(photos)]
        for f in as_completed(futures):
            res = f.result()
            if res:
                results.append(res)
        results.sort(key=lambda x: x["idx"])
        
        if not results:
            return
        
        # Upload và gửi với group layout
        group_layout_id = str(int(time.time() * 1000))
        total = len(results)
        
        for idx, item in enumerate(results):
            try:
                # Delay ngẫu nhiên giữa các ảnh
                if idx > 0:
                    time.sleep(random.uniform(3.0, 5.0))
                    
                upload_result = sender_obj._uploadImage(item["path"], target_group, ThreadType.GROUP)
                if not upload_result.get("normalUrl"):
                    continue
                
                payload = {"params": {
                    "photoId": upload_result.get("photoId", int(time.time()*2000)),
                    "clientId": upload_result.get("clientFileId", int(time.time()*1000)),
                    "desc": "", "width": item["width"], "height": item["height"],
                    "groupLayoutId": group_layout_id, "totalItemInGroup": total,
                    "isGroupLayout": 1, "idInGroup": idx,
                    "rawUrl": upload_result["normalUrl"],
                    "thumbUrl": upload_result.get("thumbUrl", upload_result["normalUrl"]),
                    "hdUrl": upload_result.get("hdUrl", upload_result["normalUrl"]),
                    "imei": getattr(sender_obj, "_imei", ""), "grid": str(target_group),
                    "oriUrl": upload_result["normalUrl"],
                    "jcp": json.dumps({"sendSource": 1, "convertible": "jxl"})
                }}
                sender_obj.sendLocalImage(item["path"], target_group, ThreadType.GROUP, 
                                   width=item["width"], height=item["height"], custom_payload=payload)
                
            except Exception as e:
                print(f"[BOT1] Lỗi gửi ảnh: {e}")
            finally:
                # Đảm bảo LUÔN LUÔN xóa file tạm
                try:
                    if os.path.exists(item["path"]):
                        os.remove(item["path"])
                except: pass
        
        print(f"[SEND] ✓ Sent {total} photos")
    
    def _send_photos_to_group(self, photos, target_group):
        """Gửi ảnh với group layout đến một nhóm cụ thể"""
        def download_one(idx, photo):
            url = photo.get("url")
            if not url:
                return None
            try:
                resp = requests.get(url, stream=True, timeout=15)
                resp.raise_for_status()
                path = f"temp_bot1_{int(time.time()*1000)}_{idx}.jpg"
                with open(path, "wb") as f:
                    for chunk in resp.iter_content(8192):
                        f.write(chunk)
                return {"idx": idx, "path": path, "width": photo.get("width", 2560), "height": photo.get("height", 2560)}
            except:
                return None
        
        # Download parallel
        results = []
        futures = [self.executor.submit(download_one, i, p) for i, p in enumerate(photos)]
        for f in as_completed(futures):
            res = f.result()
            if res:
                results.append(res)
        results.sort(key=lambda x: x["idx"])
        
        if not results:
            return
        
        # Upload và gửi với group layout (Dùng ACC2 - sender)
        group_layout_id = str(int(time.time() * 1000))
        total = len(results)
        
        for idx, item in enumerate(results):
            try:
                # Delay ngẫu nhiên giữa các ảnh
                if idx > 0:
                    time.sleep(random.uniform(3.0, 5.0))
                    
                upload_result = self.current_sender._uploadImage(item["path"], target_group, ThreadType.GROUP)
                if not upload_result.get("normalUrl"):
                    continue
                
                payload = {"params": {
                    "photoId": upload_result.get("photoId", int(time.time()*2000)),
                    "clientId": upload_result.get("clientFileId", int(time.time()*1000)),
                    "desc": "", "width": item["width"], "height": item["height"],
                    "groupLayoutId": group_layout_id, "totalItemInGroup": total,
                    "isGroupLayout": 1, "idInGroup": idx,
                    "rawUrl": upload_result["normalUrl"],
                    "thumbUrl": upload_result.get("thumbUrl", upload_result["normalUrl"]),
                    "hdUrl": upload_result.get("hdUrl", upload_result["normalUrl"]),
                    "imei": getattr(self.current_sender, "_imei", ""), "grid": str(target_group),
                    "oriUrl": upload_result["normalUrl"],
                    "jcp": json.dumps({"sendSource": 1, "convertible": "jxl"})
                }}
                self.current_sender.sendLocalImage(item["path"], target_group, ThreadType.GROUP, 
                                   width=item["width"], height=item["height"], custom_payload=payload)
                os.remove(item["path"])
            except Exception as e:
                print(f"[BOT1] Lỗi gửi ảnh: {e}")
        
        group_name = self.group_id_to_name.get(target_group, target_group)
        print(f"[BOT1] {total} ảnh → {group_name}")

    def _get_next_available_sender(self, start_index):
        """Get next sender that isn't limited by upload restrictions."""
        for i in range(len(self.senders)):
            idx = (start_index + i) % len(self.senders)
            if not self.senders[idx]["is_limited"]:
                return self.senders[idx]
        return None
    
    def _take_rest_period(self):
        """Rest for 5-10 minutes after 30 sessions. Senders rest, listener keeps running."""
        rest_duration = random.randint(self.rest_duration_min, self.rest_duration_max)
        print(f"\n[REST] 💤 Completed 30 sessions. Resting for {rest_duration//60} minutes...")
        print(f"[REST] 👂 Listener still active, checking for new messages.\n")
        
        start_time = time.time()
        while time.time() - start_time < rest_duration:
            if not self.is_running:
                return
            time.sleep(1)
        
        print(f"[REST] ✅ Rest period complete. Resuming sending...\n")
    
    def _normalize_district_name(self, district):
        """Convert 'Hà Đông' -> 'hadong' for filename."""
        import unicodedata
        # Remove Vietnamese accents and convert to lowercase
        text = unicodedata.normalize('NFD', district)
        text = text.encode('ascii', 'ignore').decode('utf-8')
        text = text.lower().replace(' ', '')
        return text
    
    def _append_to_area_file(self, filename, data):
        """Append data to area-specific JSON file."""
        try:
            filepath = os.path.join(os.path.dirname(__file__), filename)
            existing_data = []
            
            if os.path.exists(filepath):
                with open(filepath, 'r', encoding='utf-8') as f:
                    existing_data = json.load(f)
            
            existing_data.append(data)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(existing_data, f, ensure_ascii=False, indent=2)
                
        except Exception as e:
            print(f"[AREA-SAVE] Error writing to {filename}: {e}")
    
    def _save_to_area_files(self, item):
        """
        Save sent message data to district-specific JSON files.
        Extracts district keywords and saves to files like hadong.json, caugiay.json, etc.
        """
        try:
            # Extract text from item
            texts = item.get("texts", [])
            full_text = " ".join([t.get("text", "") if isinstance(t, dict) else t for t in texts])
            
            # Find district keywords
            districts = []
            text_lower = full_text.lower()
            
            for district_name, info in self.district_data.items():
                if info.get("type") in ["district", "area"]:
                    if district_name.lower() in text_lower:
                        districts.append(district_name)
            
            if not districts:
                return  # No district found, skip saving
            
            # Save to each district's file
            for district in districts:
                filename = f"{self._normalize_district_name(district)}.json"
                self._append_to_area_file(filename, {
                    "text": full_text,
                    "photos": item.get("photos", []),
                    "videos": item.get("videos", []),
                    "stickers": item.get("stickers", []),
                    "symbol": item.get("symbol", ""),
                    "timestamp": time.time(),
                    "source_info": item.get("source_info", ""),
                    "keywords": item.get("keywords", [])
                })
                print(f"[AREA-SAVE] ✓ Saved to {filename}")
                
        except Exception as e:
            print(f"[AREA-SAVE] Error saving to area files: {e}")
    
    def _handle_send_error(self, sender, error):
        """Mark sender as limited if 221 error detected."""
        if "221" in str(error):
            sender["is_limited"] = True
            print(f"[LIMIT] 🚫 {sender['name']} hit upload limit (221). Marking as unavailable.")
            
            # Check if all senders are limited
            if all(s["is_limited"] for s in self.senders):
                print(f"[LIMIT] ⚠️ ALL SENDERS LIMITED. Pausing sends but listening continues.")
            return True
        return False

    def _send_worker_session_based(self):
        """
        Worker gửi tin theo session, phân phối round-robin qua các sender.
        Mỗi session chạy xong mới chạy session tiếp theo.
        """
        print("[SENDER] 🚀 Session-based Worker started.")
        
        while self.is_running:
            try:
                # Check if rest period needed
                with self.session_count_lock:
                    if self.session_count >= self.sessions_before_rest:
                        self._take_rest_period()
                        self.session_count = 0
                
                # Get next session from queue
                item = self.send_queue.get(timeout=1)
                if item is None:
                    self.send_queue.task_done()
                    continue
                
                # Get next available sender (round-robin, skip limited ones)
                sender = self._get_next_available_sender(self.current_sender_index)
                
                if not sender:
                    # All senders limited - wait and retry
                    print(f"[SENDER] ⏸️ All senders limited. Waiting 60s before retry...")
                    self.send_queue.put(item)  # Put item back
                    self.send_queue.task_done()
                    time.sleep(60)
                    continue
                
                # Process session with this sender
                self._process_session(sender, item)
                
                # Save data to area-specific files
                self._save_to_area_files(item)
                
                # Update session counter
                with self.session_count_lock:
                    self.session_count += 1
                
                # Move to next sender for next session (round-robin)
                self.current_sender_index = (self.current_sender_index + 1) % len(self.senders)
                
                # Mark task complete
                self._finish_current_task()
                self.send_queue.task_done()
                
                # Small delay between sessions
                time.sleep(random.uniform(2.0, 4.0))
                
            except queue.Empty:
                continue
            except Exception as e:
                print(f"[SENDER] Error: {e}")
                import traceback
                traceback.print_exc()
                try:
                    self._finish_current_task()
                    self.send_queue.task_done()
                except:
                    pass
    
    def _process_session(self, sender, item):
        """Process a single session: send messages to all matching groups for this sender."""
        try:
            texts = item.get("texts", [])
            photos = item.get("photos", [])
            videos = item.get("videos", [])
            stickers = item.get("stickers", [])
            symbol = item.get("symbol", "")
            source_info = item.get("source_info", "")
            
            # Handle both dict (with timestamp) and string formats
            text_parts = [txt.get("text", "") if isinstance(txt, dict) else txt for txt in texts]
            full_text = " ".join(text_parts)
            keywords = self._extract_keywords(full_text)
            
            # Store keywords in item for area saving
            item["keywords"] = keywords
            
            # Resolve Keywords -> Group IDs (For THIS sender)
            target_groups = set()
            for kw in keywords:
                gids = sender["output_groups_map"].get(kw.lower(), [])
                target_groups.update(gids)
            
            target_groups = list(target_groups)
            
            if not target_groups:
                print(f"[SENDER] ⚠️ {sender['name']}: No matching groups for {source_info}")
                return
            
            print(f"[SENDER] 🎯 {sender['name']}: Matched {len(keywords)} keywords -> {len(target_groups)} groups")
            print(f"[SENDER] 📤 {sender['name']}: Sending {source_info}")
            
            # Get already sent groups for this session
            already_sent = set(item.get("sent_groups", []))
            
            # Send to each target group
            for group_id in target_groups:
                if group_id in already_sent:
                    continue
                
                group_name = sender["group_id_to_name"].get(group_id, group_id)
                sender_api = sender["api"]
                
                try:
                    # 0. Send OPENING STICKER
                    try:
                        sender_api.sendSticker(3, 50625, 12658, group_id, ThreadType.GROUP)
                        time.sleep(random.uniform(0.5, 1.0))
                    except:
                        pass
                    
                    # 1. Build chronological timeline
                    timeline = []
                    
                    for txt in texts:
                        timeline.append({
                            "type": "text",
                            "timestamp": txt.get("timestamp", 0) if isinstance(txt, dict) else 0,
                            "data": txt.get("text") if isinstance(txt, dict) else txt
                        })
                    
                    for photo in photos:
                        timeline.append({"type": "photo", "timestamp": photo.get("timestamp", 0), "data": photo})
                    
                    for video in videos:
                        timeline.append({"type": "video", "timestamp": video.get("timestamp", 0), "data": video})
                    
                    for stk in stickers:
                        timeline.append({"type": "sticker", "timestamp": float('inf'), "data": stk})
                    
                    # Sort by timestamp (text first for 11A/12A)
                    def sort_key(x):
                        if "11a" in symbol.lower() or "12a" in symbol.lower():
                            priority = 0 if x["type"] == "text" else 1
                            return (priority, x["timestamp"])
                        return (0, x["timestamp"])
                    
                    timeline.sort(key=sort_key)
                    
                    # 2. Send in order, batching consecutive photos
                    photo_batch = []
                    
                    for content in timeline:
                        if content["type"] == "text":
                            # Flush photos first
                            if photo_batch:
                                self._send_photos_multisender(sender_api, photo_batch, group_id)
                                photo_batch = []
                                time.sleep(random.uniform(1.0, 2.0))
                            
                            # Send text
                            sender_api.send(Message(text=content["data"]), group_id, ThreadType.GROUP)
                            print(f"[SEND] ✓ Text ({symbol}) → {group_name}")
                            time.sleep(random.uniform(1.0, 2.0))
                        
                        elif content["type"] == "photo":
                            photo_batch.append(content["data"])
                        
                        elif content["type"] == "video":
                            # Flush photos first
                            if photo_batch:
                                self._send_photos_multisender(sender_api, photo_batch, group_id)
                                photo_batch = []
                                time.sleep(random.uniform(1.0, 2.0))
                            
                            v = content["data"]
                            sender_api.sendRemoteVideo(
                                v["url"], v.get("thumb") or v["url"],
                                v.get("duration", 1000), group_id, ThreadType.GROUP,
                                width=v.get("width", 1280), height=v.get("height", 720)
                            )
                            print(f"[SEND] ✓ Video → {group_name}")
                            time.sleep(random.uniform(1.5, 3.0))
                        
                        elif content["type"] == "sticker":
                            # Flush photos first
                            if photo_batch:
                                self._send_photos_multisender(sender_api, photo_batch, group_id)
                                photo_batch = []
                                time.sleep(random.uniform(1.0, 2.0))
                            
                            stk = content["data"]
                            try:
                                sender_api.sendSticker(stk.get("type", 3), stk.get("id"), stk.get("catId"), group_id, ThreadType.GROUP)
                                print(f"[SEND] ✓ Sticker → {group_name}")
                            except:
                                pass
                    
                    # Flush remaining photos
                    if photo_batch:
                        self._send_photos_multisender(sender_api, photo_batch, group_id)
                    
                    print(f"[SEND] ✅ DONE → {group_name}")
                    
                    # Update progress
                    if "sent_groups" not in item:
                        item["sent_groups"] = []
                    item["sent_groups"].append(group_id)
                    self._update_current_task(item)
                    
                except Exception as e:
                    err_str = str(e)
                    print(f"[SEND] ✗ Error {group_name}: {err_str}")
                    
                    # Handle 221 error
                    if self._handle_send_error(sender, e):
                        print(f"[SENDER] Stopping session for {sender['name']} due to limit.")
                        break  # Stop sending for this session
                        
        except Exception as e:
            print(f"[SESSION] Error processing session: {e}")
            import traceback
            traceback.print_exc()

    
    def _heartbeat_worker(self):
        """Monitor bot health"""
        print("[HEARTBEAT] Started. Pulse every 60s.")
        while self.is_running:
            for _ in range(60):
                if not self.is_running:
                    return
                time.sleep(1)
            
            try:
                q_size = self.send_queue.qsize()
                active_threads = threading.active_count()
                print(f"[HEARTBEAT] Alive. Queue: {q_size} | Threads: {active_threads}")
            except Exception:
                pass


        
    def _mid_cleanup_worker(self):
        """Xóa processed_mids định kỳ mỗi 10 phút để tránh tốn bộ nhớ"""
        while self.is_running:
            # Sleep 600s but check is_running every 1s for fast shutdown
            for _ in range(600):
                if not self.is_running:
                    return
                time.sleep(1)
                
            if not self.is_running:
                break
            with self.mid_lock:
                # Chỉ giữ lại 1000 MID gần nhất trong RAM
                if len(self.processed_mids) > 1000:
                    current_mids = list(self.processed_mids)
                    self.processed_mids = set(current_mids[-1000:])
                    print(f"[BOT1] Đã dọn dẹp MID cache (còn lại {len(self.processed_mids)})")
    
    def _load_mid_cache(self):
        """Load MID cache từ file"""
        mids = set()
        if os.path.exists(self.mid_cache_file):
            try:
                with open(self.mid_cache_file, "r", encoding="utf-8") as f:
                    for line in f:
                        mid = line.strip()
                        if mid:
                            mids.add(mid)
                print(f"[BOT1] Đã load {len(mids)} MID từ cache file")
            except Exception as e:
                print(f"[BOT1] Lỗi load MID cache: {e}")
        return mids

    def _save_mid(self, mid):
        """Lưu MID vào cache file"""
        try:
            with open(self.mid_cache_file, "a", encoding="utf-8") as f:
                f.write(f"{mid}\n")
        except Exception as e:
            print(f"[BOT1] Lỗi save MID: {e}")
    
    def _add_to_session(self, source_id, author_id, content_type, content_data, symbol):
        """
        Thêm content vào session buffer
        LOGIC:
        - TEXT >= 30 ký tự → TẠO SESSION MỚI (giữ media cũ nếu có)
        - Ảnh/Video → THÊM vào session hiện tại
        - Nếu session ĐỦ (có text + media) → reset timer về 3s để gửi nhanh
        - Max timeout 40s TỪ LẦN NHẬN CONTENT CUỐI CÙNG → đóng session
        """
        if not self.is_running:
            return
        
        session_key = (source_id, author_id)
        now = time.time()
        
        with self.session_lock:
            # Nếu chưa có session -> tạo mới
            if session_key not in self.session_buffers:
                self.session_buffers[session_key] = {
                    "instance_id": str(int(time.time() * 1000)), # Unique ID for this specific buffer
                    "texts": [],
                    "photos": [],
                    "videos": [],
                    "stickers": [],
                    "symbol": symbol,
                    "timer": None,
                    "last_activity": now,
                }
                print(f"[SESSION] {now} ({author_id}) -> Start new session (ID: {self.session_buffers[session_key]['instance_id']})")
            
            buffer = self.session_buffers[session_key]
            buffer["last_activity"] = now  # Cập nhật thời gian hoạt động
            
            # Phân loại và thêm vào buffer
            if content_type == "text":
                # LOGIC MỚI: Nếu Text dài (>30 ký tự) -> NEW POST -> Flush Session Cũ (bất kể có gì)
                # User Rule: "mọi nhóm bắt đầu bằng text dài" -> Text arrives -> New Session.
                # Avoids merging orphaned photos from previous session.
                is_long_text = len(content_data) > 30
                has_content = len(buffer["texts"]) > 0 or len(buffer["photos"]) > 0 or len(buffer["videos"]) > 0
                
                if is_long_text and has_content:
                    print(f"[SESSION] ⚠️ Phát hiện TEXT dài ({len(content_data)} chars) -> FLUSH session cũ (Gồm {len(buffer['photos'])} ảnh)")
                    # 1. Hủy timer cũ
                    if buffer.get("timer"):
                        buffer["timer"].cancel()
                    
                    # 2. Flush session cũ (gửi ngay lập tức)
                    self._flush_immediate(session_key)
                    
                    # 3. Tạo session mới cho text này
                    now = time.time() # Update time
                    self.session_buffers[session_key] = {
                        "instance_id": str(int(time.time() * 1000)),
                        "texts": [], "photos": [], "videos": [], "stickers": [],
                        "symbol": symbol, "timer": None, "last_activity": now,
                    }
                    buffer = self.session_buffers[session_key] # Point to new buffer
                    print(f"[SESSION] {now} ({author_id}) -> Re-created session due to LONG TEXT (ID: {buffer['instance_id']})")
                
                buffer["texts"].append({"text": content_data, "timestamp": now})
                print(f"[SESSION] 📝 TEXT mới từ {author_id}")
            elif content_type == "photo":
                content_data["timestamp"] = now
                buffer["photos"].append(content_data)
            elif content_type == "video":
                content_data["timestamp"] = now
                buffer["videos"].append(content_data)
            elif content_type == "sticker":
                buffer["stickers"].append(content_data)
            
            buffer = self.session_buffers[session_key]
            has_text = len(buffer["texts"]) > 0
            has_media = len(buffer["photos"]) > 0 or len(buffer["videos"]) > 0
            
            # Log trạng thái
            type_counts = f"T:{len(buffer['texts'])} P:{len(buffer['photos'])} V:{len(buffer['videos'])}"
            print(f"[SESSION] Gom {content_type} từ {author_id} ({type_counts})")
            
            # Tính timeout
            if has_text and has_media:
                # Đủ điều kiện → chờ 8s để user có thể gửi thêm text/media
                timeout = 8.0
                print(f"[SESSION] ✓ Đủ text + media → Gửi sau {timeout}s nếu không có thêm")
            else:
                # Chưa đủ → chờ max 40s TỪ LẦN HOẠT ĐỘNG CUỐI
                timeout = self.session_max_timeout
            
            # Reset timer
            if buffer.get("timer"):
                buffer["timer"].cancel()
            
            # CRITICAL FIX: Pass instance_id to timer so it only flushes the buffer it belongs to
            timer = threading.Timer(timeout, self._check_and_flush, args=(session_key, buffer["instance_id"]))
            timer.start()
            buffer["timer"] = timer
            
    def _flush_immediate(self, session_key):
        """Flush session ngay lập tức (dùng khi ngắt quãng)"""
        with self.session_lock:
            buffer = self.session_buffers.get(session_key)
            if not buffer: return
            
            if buffer.get("timer"):
                buffer["timer"].cancel()
            
            # session_key is a tuple (source_id, author_id), so session_key[1] is author_id
            author_id = session_key[1]
            
            # Đẩy vào queue (Sử dụng _enqueue_task để lưu)
            self._enqueue_task({
                "texts": buffer.get("texts", []),
                "photos": buffer.get("photos", []),
                "videos": buffer.get("videos", []),
                "stickers": buffer.get("stickers", []),
                "symbol": buffer.get("symbol", ""),
                "source_info": f"Session {author_id} (FLUSH)"
            })
            
            self.session_buffers.pop(session_key)
            print(f"[SESSION] ⚡ Flushed immediate: {author_id}")

    def _check_and_flush(self, session_key, instance_id):
        """Kiểm tra điều kiện và flush session"""
        if not self.is_running:
            return
        
        with self.session_lock:
            buffer = self.session_buffers.get(session_key)
            if not buffer: return
            
            # CRITICAL FIX: Ensure we are flushing the SAME buffer instance that triggered this timer
            if buffer.get("instance_id") != instance_id:
                print(f"[CHECK] Session {session_key[1]} skipped: Instance mismatch ({buffer.get('instance_id')} vs {instance_id}). REASON: Stale timer.")
                return
            
            has_text = len(buffer.get("texts", [])) > 0
            has_media = len(buffer.get("photos", [])) > 0 or len(buffer.get("videos", [])) > 0
            
            current_time = time.time()
            idle_time = current_time - buffer["last_activity"]
            is_expired = idle_time >= self.session_max_timeout
            
            # session_key is a tuple (source_id, author_id), so session_key[1] is author_id
            author_id = session_key[1]
            print(f"[CHECK] Session {author_id}: text={has_text}, media={has_media}, idle={idle_time:.1f}s, expired={is_expired}")
            
            if has_text and has_media:
                # Đủ điều kiện -> Gửi
                self._enqueue_task({
                    "texts": buffer.get("texts", []),
                    "photos": buffer.get("photos", []),
                    "videos": buffer.get("videos", []),
                    "stickers": buffer.get("stickers", []),
                    "symbol": buffer.get("symbol", ""),
                    "source_info": f"Session {author_id}"
                })
                # XÓA SESSION để tránh gửi trùng lặp
                self.session_buffers.pop(session_key)
                print(f"[CHECK] ✅ Đã enqueue và xóa session {author_id}")
            elif is_expired:
                # Timeout nhưng XỬ LÝ KHÁC NHAU:
                if has_media and not has_text:
                    # Có ảnh/video NHƯNG CHƯA CÓ TEXT → GIỮ LẠI, KHÔNG HỦY
                    # Reset timer, chờ thêm 30s nữa
                    timeout = 30.0
                    if buffer.get("timer"):
                        buffer["timer"].cancel()
                    timer = threading.Timer(timeout, self._check_and_flush, args=(session_key,))
                    timer.start()
                    buffer["timer"] = timer
                    buffer["last_activity"] = time.time()  # Reset để không bị timeout liên tục
                    print(f"[CHECK] 📷 Giữ lại media, chờ TEXT thêm 30s (có {len(buffer.get('photos', []))} ảnh, {len(buffer.get('videos', []))} video)")
                elif has_text and not has_media:
                    # Có text KHÔNG CÓ MEDIA → HỦY (text đơn lẻ không có giá trị)
                    self.session_buffers.pop(session_key)
                    print(f"[CHECK] ❌ Idle {idle_time:.0f}s: Có text KHÔNG CÓ MEDIA → Hủy")
                else:
                    # Không có gì → Hủy
                    self.session_buffers.pop(session_key)
                    print(f"[CHECK] ❌ Idle {idle_time:.0f}s: Không có nội dung → Hủy")
            else:
                # Chưa đủ và chưa timeout → chờ thêm
                remaining = self.session_max_timeout - idle_time
                timeout = min(5.0, max(1.0, remaining))  # Check lại sau 1-5s
                
                if buffer.get("timer"):
                    buffer["timer"].cancel()
                
                timer = threading.Timer(timeout, self._check_and_flush, args=(session_key,))
                timer.start()
                buffer["timer"] = timer
                print(f"[CHECK] ⏳ Chưa đủ → Chờ thêm {timeout:.1f}s")
    
    def _forward_message(self, message, message_object, source_id, author_id, symbol):
        """Phân loại tin nhắn và thêm vào session buffer"""
        try:
            msg_type = getattr(message_object, "msgType", None)
            content = getattr(message_object, "content", {}) or {}
            quote = getattr(message_object, "quote", None)  # Detect reply
            
            if not isinstance(content, dict):
                content = {}
            
            params = {}
            params_raw = content.get("params")
            if params_raw:
                try:
                    params = json.loads(params_raw)
                except:
                    pass
            
            # SPECIAL HANDLING for 11A and 12A: Only care about text replying to photos
            is_special_group = symbol.lower() in ["11a", "12a"]
            
            # Photo
            if msg_type == "chat.photo":
                photo_url = content.get("hd") or content.get("href")
                if photo_url:
                    width = self._safe_int(params.get("width"), 2560)
                    height = self._safe_int(params.get("height"), 2560)
                    photo_data = {"url": photo_url, "width": width, "height": height}
                    
                    # For 11A/12A: Cache photos by group_layout_id
                    if is_special_group:
                        group_layout_id = params.get("group_layout_id")
                        if group_layout_id:
                            with self.photo_cache_lock:
                                if group_layout_id not in self.photo_cache:
                                    self.photo_cache[group_layout_id] = {
                                        "photos": [],
                                        "symbol": symbol,
                                        "source_id": source_id,
                                        "author_id": author_id,
                                        "timestamp": time.time()
                                    }
                                self.photo_cache[group_layout_id]["photos"].append(photo_data)
                                print(f"[CACHE] {symbol}: Cached photo {len(self.photo_cache[group_layout_id]['photos'])} for layout {group_layout_id}")
                        else:
                            # No group_layout_id, treat normally
                            self._add_to_session(source_id, author_id, "photo", photo_data, symbol)
                    else:
                        # Other groups: Normal handling
                        self._add_to_session(source_id, author_id, "photo", photo_data, symbol)
            
            # Text message (REPLY DETECTION)
            elif msg_type == "webchat" or (isinstance(message, str) and message and msg_type not in ["chat.photo", "chat.video", "chat.video.msg", "chat.sticker"]):
                text = message if isinstance(message, str) else ""
                if not text:
                    if isinstance(content, str):
                        text = content
                    elif isinstance(content, dict):
                        text = content.get("text", "") or content.get("title", "")
                
                if text:
                    # Process text
                    processed_text = process_message(text, symbol)
                    if not processed_text or not processed_text.strip():
                        return
                    
                    # For 11A/12A: Only forward if text REPLIES to photo
                    if is_special_group:
                        if quote:
                            # Extract group_layout_id from quote
                            group_layout_id = None
                            try:
                                quote_attach = getattr(quote, "attach", None)
                                if quote_attach:
                                    if isinstance(quote_attach, str):
                                        quote_data = json.loads(quote_attach)
                                    else:
                                        quote_data = quote_attach
                                    
                                    if isinstance(quote_data, dict):
                                        quote_params = quote_data.get("params")
                                        if isinstance(quote_params, str):
                                            quote_params = json.loads(quote_params)
                                        if isinstance(quote_params, dict):
                                            group_layout_id = quote_params.get("group_layout_id")
                            except:
                                pass
                            
                            if group_layout_id:
                                # Try to fetch cached photos
                                with self.photo_cache_lock:
                                    cached = self.photo_cache.get(group_layout_id)
                                    if cached:
                                        print(f"[REPLY] {symbol}: Text replies to {len(cached['photos'])} cached photos (layout {group_layout_id})")
                                        # Add text to session
                                        self._add_to_session(source_id, author_id, "text", processed_text, symbol)
                                        # Add all cached photos to session
                                        for photo in cached["photos"]:
                                            self._add_to_session(source_id, author_id, "photo", photo, symbol)
                                        # Remove from cache
                                        del self.photo_cache[group_layout_id]
                                    else:
                                        print(f"[REPLY] {symbol}: Text replies but no cached photos found for layout {group_layout_id}")
                            else:
                                print(f"[REPLY] {symbol}: Text has quote but no group_layout_id found")
                        else:
                            # Text without reply → SKIP for 11A/12A
                            print(f"[FILTER] {symbol}: Text without reply → SKIP")
                            return
                    else:
                        # Other groups: Normal handling
                        self._add_to_session(source_id, author_id, "text", processed_text, symbol)
            
            # Video
            elif msg_type in ["chat.video", "chat.video.msg"]:
                video_url = content.get("href")
                if video_url:
                    self._add_to_session(source_id, author_id, "video", {
                        "url": video_url,
                        "thumb": content.get("thumb") or content.get("hd"),
                        "duration": self._safe_int(params.get("duration"), 1000),
                        "width": self._safe_int(params.get("width"), 1280),
                        "height": self._safe_int(params.get("height"), 720)
                    }, symbol)
            
            # Sticker
            elif msg_type == "chat.sticker":
                if content.get("id") and content.get("catId"):
                    self._add_to_session(source_id, author_id, "sticker", {
                        "type": content.get("type", 3),
                        "id": content.get("id"),
                        "catId": content.get("catId")
                    }, symbol)
        
        except Exception as e:
            print(f"[BOT1] Lỗi forward: {e}")
            import traceback
            traceback.print_exc()
    
    def onMessage(self, mid, author_id, message, message_object, thread_id, thread_type):
        """Xử lý tin nhắn"""
        try:
            thread_id_str = str(thread_id)
            author_id_str = str(author_id)
            mid_str = str(mid)
            
            # 1. Bỏ qua tin nhắn từ chính bot (bất kỳ sender nào)
            sender_uids = [s["uid"] for s in self.senders]
            if author_id_str in sender_uids:
                return
            
            # 2. Bỏ qua nếu MID đã được xử lý (tránh duplicate)
            with self.mid_lock:
                if mid_str in self.processed_mids:
                    return
                self.processed_mids.add(mid_str)
                self._save_mid(mid_str)
            
            # 3. Bỏ qua nếu tin nhắn đến từ một trong các nhóm ĐẦU RA (tránh feedback loop)
            # Check across all senders' output groups
            for sender in self.senders:
                if thread_id_str in sender["group_id_to_name"]:
                    return
            
            # Xử lý lệnh !sticker (từ bất kỳ nhóm nào)
            if isinstance(message, str) and message.strip().lower() == "!sticker":
                # Gửi 1 sticker test vào nhóm hiện tại (dùng sender đầu tiên)
                if self.senders:
                    first_sender = self.senders[0]["api"]
                    first_sender.sendSticker(3, 50625, 12658, thread_id_str, ThreadType.GROUP)
                    print(f"[BOT1] !sticker → {self.senders[0]['name']} đã gửi sticker test vào {thread_id_str}")
                return
            
            # Xử lý lệnh !help
            if isinstance(message, str) and message.strip().lower() == "!help":
                help_text = "👋 Bạn cần hỗ trợ gì?\n\n📌 Bot đang hoạt động và sẵn sàng forward tin nhắn!"
                if self.senders:
                    first_sender = self.senders[0]["api"]
                    first_sender.send(Message(text=help_text), thread_id_str, ThreadType.GROUP)
                    print(f"[BOT1] !help → {self.senders[0]['name']} trả lời trong {thread_id_str}")
                return
            
            # Chỉ xử lý tin nhắn từ group
            if thread_type != ThreadType.GROUP:
                return
            
            # 4. Chỉ xử lý tin nhắn từ nhóm ĐẦU VÀO đã đăng ký (dauvao.txt)
            symbol = self.input_groups.get(thread_id_str)
            if not symbol:
                return
            
            # Get group name from any sender that has it
            group_name = thread_id_str
            for sender in self.senders:
                if thread_id_str in sender["group_id_to_name"]:
                    group_name = sender["group_id_to_name"][thread_id_str]
                    break
            
            msg_preview = str(message)[:50] if message else ""
            print(f"{Fore.CYAN}[MSG] {group_name} ({symbol}): {msg_preview}...{Style.RESET_ALL}")
            
            # Forward tin nhắn
            self._forward_message(message, message_object, thread_id_str, author_id_str, symbol)
        
        except Exception as e:
            print(f"[BOT1] Error: {e}")


# ==================== MAIN ====================
if __name__ == "__main__":
    print("🚀 Khởi động Bot2 - Forward đến NHIỀU nhóm (Multi-Account Parallel)...")
    from config import ACCOUNTS
    
    print(f"📌 Chế độ: 1 Listener + {len(ACCOUNTS)-1} Senders")
    
    bot = None
    
    while True:  # Auto-restart loop
        try:
            if bot is None:
                print(f"\n[MAIN] 🔄Khởi tạo bot... ({datetime.now().strftime('%H:%M:%S')})")
                bot = Bot1(API_KEY, SECRET_KEY, ACCOUNTS)
            
            print(f"[MAIN] 🎧 Bắt đầu listen... ({datetime.now().strftime('%H:%M:%S')})")
            bot.listen(thread=False, delay=0)  # Blocking mode để catch lỗi
            
        except KeyboardInterrupt:
            print("\n[MAIN] Dừng bot (Ctrl+C)")
            if bot:
                bot.is_running = False
            break
        
        except Exception as e:
            print(f"\n{Fore.RED}[MAIN] ✗ Lỗi: {e}{Style.RESET_ALL}")
            import traceback
            traceback.print_exc()
            
            # Cleanup bot cũ
            if bot:
                try:
                    bot.is_running = False
                except:
                    pass
            bot = None
            
            # Chờ 5s rồi reconnect
            print(f"{Fore.YELLOW}[MAIN] ⏳ Chờ 5s rồi reconnect...{Style.RESET_ALL}")
            time.sleep(5)

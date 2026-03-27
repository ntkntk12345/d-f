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
        with open(DAURA_FILE, "r", encoding="utf-8") as f:
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
    """Chỉ xóa hoa hồng/icon hh thay vì xóa cả dòng. 
    Xóa dòng có chứa 'sale' hoặc 'cho sale'. 
    Xóa tất cả dấu % và số đi kèm."""
    lines = text.split('\n')
    result_lines = []
    
    # 1. Nếu cần giữ HD (hợp đồng), extract nó từ text gốc
    hd_info = ""
    if keep_contract_duration:
        hd_match = re.search(r'\(\s*hd\s*\d+\s*th\s*\)', text, re.IGNORECASE)
        if hd_match:
            hd_info = hd_match.group(0)

    for line in lines:
        stripped_line = line.strip()
        if not stripped_line:
            result_lines.append("")
            continue
            
        # Xóa các dòng có chữ 'sale' hoặc 'cho sale'
        if re.search(r'\bsale\b', stripped_line, re.IGNORECASE):
            continue

        # Xóa các pattern hoa hồng (Targeted re.sub)
        patterns = [
            r'🌺\s*\d+%', r'🌹\s*\d+%', r'🌺', r'🌹',
            r'[Hh][Hh]\s*:?\s*\d+%',
            r'[Hh]oa\s*[Hh]ồng\s*:?\s*\d+%',
            r'[Hh]oa\s*[Hh]ồng', r'[Hh][Hh]',
            r'\d+%', r'%', # Xóa triệt để %
            r'\(\s*Mã này chủ đánh thuế\s*\)',
        ]
        
        processed_line = stripped_line
        for p in patterns:
            processed_line = re.sub(p, '', processed_line, flags=re.IGNORECASE)
        
        if processed_line.strip():
            result_lines.append(processed_line.strip())
    
    processed = '\n'.join(result_lines)
    
    # 3. Trả về text đã clean + hd_info nếu có
    if hd_info and hd_info not in processed:
        processed += f"\n{hd_info}"
        
    return processed.strip()


def remove_bonus(text):
    """Chỉ xóa thưởng thay vì xóa cả dòng"""
    bonus_patterns = [
        r'🎉',
        r'[Tt]hưởng\s*\d+[kK]?\s*cho\s*(ctv|sale)',
        r'[Tt]hưởng\s*\d+[kK]?',
        r'[Tt]hưởng',
    ]
    
    processed = text
    for p in bonus_patterns:
        processed = re.sub(p, '', processed, flags=re.IGNORECASE)
        
        return processed.strip()


def remove_phone(text):
    """Xóa số điện thoại và các từ khóa liên hệ một cách triệt để"""
    lines = text.split('\n')
    result_lines = []
    
    for line in lines:
        stripped_line = line.strip()
        
        # 1. Xóa các dòng chứa pattern đặc biệt (xóa cả dòng)
        should_remove_line = False
        for p in SPECIAL_PATTERNS:
            if p.search(stripped_line):
                should_remove_line = True
                break
        if should_remove_line:
            continue
            
        # 2. Xử lý trong dòng
        # a. Xóa keywords (thay bằng rỗng)
        processed_line = CONTACT_KEYWORD_REGEX.sub('', stripped_line)
        
        # b. Xóa số điện thoại
        processed_line = PHONE_REGEX.sub('', processed_line)
        
        # c. Cleanup (xóa dấu : hoặc - thừa ở đầu/cuối sau khi xóa nội dung)
        processed_line = re.sub(r'^\s*[:\-\.]+\s*', '', processed_line)
        processed_line = re.sub(r'\s*[:\-\.]+\s*$', '', processed_line)
        
        processed_line = processed_line.strip()
        
        # Chỉ giữ lại nếu dòng vẫn còn nội dung có nghĩa
        if processed_line:
            result_lines.append(processed_line)
    
    return '\n'.join(result_lines)


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
    def __init__(self, api_key, secret_key, listener_account, sender_account):
        """
        listener_account (IMEI1): Lắng nghe các nhóm đầu vào
        sender_account (IMEI2): Gửi tin nhắn vào nhóm đầu ra
        """
        # Bot chính để listen (ACC1)
        super().__init__(api_key, secret_key, imei=listener_account["imei"], session_cookies=listener_account["session_cookies"])
        
        # Bot để gửi (ACC2)
        self.sender = ZaloAPI(api_key, secret_key, imei=sender_account["imei"], session_cookies=sender_account["session_cookies"])
        print(f"[BOT1] Sender (ACC2) đã sẵn sàng")
        
        self.is_running = True
        
        # Load config
        self.group_symbols = load_dauvao()  # {group_name: symbol}
        
        # Load keywords for output group matching (with hierarchy)
        self.all_keywords, self.keyword_levels = load_daura_keywords()  # Set of keywords + their levels
        self.keyword_to_groups = {}  # {keyword_lower: [group_ids]}
        self.output_groups_cache = {}  # {group_id: group_name}
        
        # Map group_id → symbol (sẽ được populate khi bot chạy)
        self.input_groups = {}  # {group_id: symbol}
        
        # Cache tên nhóm: {group_id: group_name}
        self.group_names_cache = {}
        
        # ============ HỆ THỐNG SESSION MỚI ============
        # Session buffer: {(source_id, author_id): {...}}
        self.session_buffers = {}
        self.session_lock = threading.Lock()
        
        # ============ DUPLICATION PREVENTION ============
        self.mid_cache_file = "processed_mids.txt"
        self.processed_mids = self._load_mid_cache()
        self.mid_lock = threading.Lock()
        self.sender_uid = None
        
        # Thread to periodically clear processed_mids (every 10 minutes)
        self.cleanup_thread = threading.Thread(target=self._mid_cleanup_worker, daemon=True)
        self.cleanup_thread.start()
        
        # Heartbeat Thread (Check bot alive)
        self.heartbeat_thread = threading.Thread(target=self._heartbeat_worker, daemon=True)
        self.heartbeat_thread.start()
        
        # Timeout settings
        self.session_check_interval = 15.0  # 15s - nếu đủ điều kiện thì gửi ngay
        self.session_max_timeout = 90.0     # 90s - max timeout, cho phép user suy nghĩ reply
        
        # Queue gửi tin - xếp hàng gửi lần lượt
        self.send_queue = queue.Queue()
        self.send_thread = threading.Thread(target=self._send_worker, daemon=True)
        self.send_thread.start()
        
        # Thread pool cho download
        self.executor = ThreadPoolExecutor(max_workers=5)
        
        # Tự động đăng ký các nhóm từ Zalo (cả input và output)
        self._auto_register_groups()
        
        print(f"[BOT1] ACC1 = Listen | ACC2 = Sender")
        
        # Get sender UID
        try:
            self.sender_uid = str(self.sender._state.user_id)
            print(f"[BOT1] Sender UID: {self.sender_uid}")
        except Exception as e:
            print(f"[BOT1] Cảnh báo: Không lấy được UID của ACC2: {e}")
            
        print(f"[BOT1] Timeout: {self.session_check_interval}s check / {self.session_max_timeout}s max")
        print(f"[BOT1] Đầu ra: Multi-group (keyword matching)")
    
    def _auto_register_groups(self):
        """Tự động fetch tất cả nhóm từ Zalo (cả ACC1 và ACC2) để match input/output"""
        print("[BOT1] Đang quét danh sách nhóm (Dual-Account Discovery)...")
        
        # Danh sách các tài khoản cần quét nhóm
        accounts_to_scan = [
            ("ACC1 (Listen)", self, False),  # is_sender = False
            ("ACC2 (Send)", self.sender, True) # is_sender = True
        ]
        
        for acc_name, acc_obj, is_sender in accounts_to_scan:
            try:
                print(f"[BOT1] Quét nhóm từ {acc_name}...")
                all_groups = acc_obj.fetchAllGroups()
                if not all_groups or not hasattr(all_groups, "gridVerMap"):
                    continue
                    
                group_ids = list(all_groups.gridVerMap.keys())
                print(f"[BOT1] {acc_name} tìm thấy {len(group_ids)} nhóm. Đang lấy thông tin...")
                
                # 1. Ưu tiên lấy từ cache (fetchAllGroups thường trả về gridInfoMap)
                grid_map = getattr(all_groups, "gridInfoMap", {})
                
                # 2. Nếu cache không có hoặc thiếu, fetch theo CHUNK (max 50) để tránh Zalo từ chối
                if not grid_map:
                    grid_map = {}
                    chunk_size = 50
                    for i in range(0, len(group_ids), chunk_size):
                        chunk = group_ids[i:i + chunk_size]
                        print(f"[BOT1]   -> Đang lấy thông tin chunk {i//chunk_size + 1} ({len(chunk)} nhóm)...")
                        try:
                            batch_dict = {str(gid): 0 for gid in chunk}
                            batch_info = acc_obj.fetchGroupInfo(batch_dict)
                            batch_grid = getattr(batch_info, "gridInfoMap", {})
                            if isinstance(batch_grid, dict):
                                grid_map.update(batch_grid)
                        except Exception as e:
                            print(f"[BOT1]   ✗ Lỗi fetch chunk: {e}")
                
                if not grid_map:
                    print(f"[BOT1] ⚠️ Không nhận được thông tin nhóm từ {acc_name}")
                    continue
                
                for gid_str, group_data in grid_map.items():
                    try:
                        if isinstance(group_data, dict):
                            group_name = group_data.get("name", "")
                        else:
                            group_name = getattr(group_data, "name", "")
                        
                        if group_name:
                            self.group_names_cache[gid_str] = group_name
                            
                            # A. Match với dauvao.txt (INPUT groups)
                            # CHỈ QUÉT Ở ACC1 (Listen) để tránh trùng lặp hoặc nhầm lẫn
                            if not is_sender:
                                symbol = self._find_symbol_for_group(group_name)
                                if symbol:
                                    if gid_str not in self.input_groups:
                                        self.input_groups[gid_str] = symbol
                                        print(f"[BOT1] ✓ {acc_name} INPUT: {group_name} → {symbol}")
                            
                            # B. Match với daura.txt keywords (OUTPUT groups) 
                            # CHỈ QUÉT Ở ACC2 (Send) theo yêu cầu của user
                            if is_sender:
                                matched_keywords = self._extract_keywords_from_name(group_name)
                                if matched_keywords:
                                    # 1. Đưa vào Ignore List (output_groups_cache) để chặn loop
                                    if gid_str not in self.output_groups_cache:
                                        self.output_groups_cache[gid_str] = group_name
                                        print(f"[BOT1] ✓ {acc_name} IGNORE-LIST: {group_name}")
                                    
                                    # 2. Đưa vào Dispatch List (keyword_to_groups)
                                    for keyword in matched_keywords:
                                        keyword_lower = keyword.lower()
                                        if keyword_lower not in self.keyword_to_groups:
                                            self.keyword_to_groups[keyword_lower] = []
                                        if gid_str not in self.keyword_to_groups[keyword_lower]:
                                            self.keyword_to_groups[keyword_lower].append(gid_str)
                                    print(f"[BOT1] ✓ {acc_name} DISPATCH-LIST: {group_name} keywords: {', '.join(matched_keywords)}")
                                
                    except Exception:
                        pass # Bỏ qua lỗi nhỏ khi fetch info từng nhóm
                
            except Exception as e:
                print(f"[BOT1] Lỗi quét nhóm từ {acc_name}: {e}")
            
        print(f"[BOT1] Đã đăng ký {len(self.input_groups)} nhóm đầu vào")
        print(f"[BOT1] Đã đăng ký {len(self.output_groups_cache)} nhóm vào Ignore List")
        print(f"[BOT1] Tổng cộng {len(self.keyword_to_groups)} keywords có sẵn để gửi")
    
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
            groups = self.keyword_to_groups.get(keyword.lower(), [])
            target_groups.update(groups)
        return list(target_groups)

    
    def _safe_int(self, value, default):
        try:
            return int(value)
        except:
            return default
    

    
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
                    
                upload_result = self.sender._uploadImage(item["path"], target_group, ThreadType.GROUP)
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
                    "imei": getattr(self.sender, "_imei", ""), "grid": str(target_group),
                    "oriUrl": upload_result["normalUrl"],
                    "jcp": json.dumps({"sendSource": 1, "convertible": "jxl"})
                }}
                self.sender.sendLocalImage(item["path"], target_group, ThreadType.GROUP, 
                                   width=item["width"], height=item["height"], custom_payload=payload)
                os.remove(item["path"])
            except Exception as e:
                print(f"[BOT1] Lỗi gửi ảnh: {e}")
        
        group_name = self.output_groups_cache.get(target_group, target_group)
        print(f"[BOT1] {total} ảnh → {group_name}")

    
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

    def _send_worker(self):
        """Worker thread xử lý queue gửi tin - gửi lần lượt đến NHIỀU nhóm"""
        print("[QUEUE] 🚀 Send worker started")
        while self.is_running:
            try:
                # Chờ có item trong queue (timeout 1s để check is_running)
                try:
                    item = self.send_queue.get(timeout=1)
                except queue.Empty:
                    continue
                
                if item is None:  # Poison pill
                    break
                
                # Unpack data
                texts = item.get("texts", [])
                photos = item.get("photos", [])
                videos = item.get("videos", [])
                stickers = item.get("stickers", [])
                symbol = item.get("symbol", "")
                source_info = item.get("source_info", "")
                
                print(f"[QUEUE] 📤 Đang xử lý: {source_info} ({len(texts)} text, {len(photos)} ảnh, {len(videos)} video)")
                
                # Process text to extract keywords
                combined_text = ""
                processed_text = ""
                if texts:
                    combined_text = "\n\n".join(texts)
                    processed_text = process_message(combined_text, symbol)
                
                # Extract keywords from PROCESSED text (after adding prefix)
                keywords = self._extract_keywords(processed_text if processed_text else combined_text)
                
                # Find matching groups
                target_groups = self._find_matching_groups(keywords)
                
                # BƯỚC QUAN TRỌNG: Deduplicate nhóm đầu ra
                target_groups = list(set(target_groups))
                
                if not target_groups:
                    print(f"[QUEUE] ⚠️ Không tìm thấy nhóm nào phù hợp với keywords: {keywords}")
                    self.send_queue.task_done()
                    continue
                
                print(f"[QUEUE] 🎯 Keywords: {keywords}")
                print(f"[QUEUE] 📨 Sẽ gửi đến {len(target_groups)} nhóm: {[self.output_groups_cache.get(g, g) for g in target_groups]}")
                
                # DEBUG: Log để check duplicate
                print(f"\n{'='*60}")
                print(f"[DEBUG] TEXT GỐC ({len(texts)} items):")
                for i, t in enumerate(texts):
                    print(f"  [{i}] {t[:100]}...")
                print(f"[DEBUG] COMBINED TEXT:\n{combined_text[:200]}...")
                print(f"[DEBUG] PROCESSED TEXT:\n{processed_text[:200]}...")
                print(f"[DEBUG] TARGET GROUPS: {[self.output_groups_cache.get(g, g) for g in target_groups]}")
                print(f"{'='*60}\n")
                
                # Send to ALL matching groups
                for target_group in target_groups:
                    group_name = self.output_groups_cache.get(target_group, target_group)
                    print(f"\n[SEND] ➡️ Gửi đến: {group_name}")
                    
                    try:
                        # 0. Gửi STICKER PHÂN BIỆT SESSION
                        try:
                            # Gửi sticker ngẫu nhiên để phân biệt
                            stickers_list = [
                                {"id": "550", "catId": "50"},  # Hi
                                {"id": "21811", "catId": "233"}, # Nice
                                {"id": "18092", "catId": "182"}, # Wow
                            ]
                            stk = random.choice(stickers_list)
                            self.sender.sendSticker(3, stk["id"], stk["catId"], target_group, ThreadType.GROUP)
                            print(f"[SEND] ✓ Sticker session header → {group_name}")
                            time.sleep(0.3)
                        except:
                            pass

                        # 1. Gửi TEXT (CHỈ GỬI PROCESSED TEXT)
                        if processed_text:
                            print(f"[SEND] Đang gửi text ({len(processed_text)} ký tự)...")
                            self.sender.send(Message(text=processed_text), target_group, ThreadType.GROUP)
                            print(f"[SEND] ✓ Text ({symbol}) → {group_name}")
                            time.sleep(random.uniform(2.0, 4.0))
                        
                        # 2. Gửi ẢNH
                        if photos:
                            photos_sorted = sorted(photos, key=lambda x: x.get("timestamp", 0))
                            self._send_photos_to_group(photos_sorted, target_group)
                            time.sleep(random.uniform(2.0, 4.0))
                        
                        # 3. Gửi VIDEO
                        for v in videos:
                            try:
                                self.sender.sendRemoteVideo(
                                    v["url"], v.get("thumb") or v["url"],
                                    v.get("duration", 1000), target_group, ThreadType.GROUP,
                                    width=v.get("width", 1280), height=v.get("height", 720)
                                )
                                print(f"[SEND] ✓ Video → {group_name}")
                                time.sleep(random.uniform(3.0, 5.0))
                            except Exception as e:
                                print(f"[SEND] ✗ Lỗi video: {e}")
                        
                        # 4. Gửi STICKER
                        for stk in stickers:
                            try:
                                self.sender.sendSticker(stk.get("type", 3), stk.get("id"), stk.get("catId"), 
                                               target_group, ThreadType.GROUP)
                                print(f"[SEND] ✓ Sticker → {group_name}")
                                time.sleep(random.uniform(1.0, 2.0))
                            except Exception as e:
                                print(f"[SEND] ✗ Lỗi sticker: {e}")
                        
                        print(f"[SEND] ✅ Hoàn thành gửi đến: {group_name}")
                        
                    except Exception as e:
                        print(f"[SEND] ✗ Lỗi gửi đến {group_name}: {e}")
                    
                    # Delay between groups
                    time.sleep(random.uniform(5.0, 10.0))
                
                print(f"[QUEUE] ✅ Hoàn thành: {source_info} → {len(target_groups)} nhóm")
                self.send_queue.task_done()
                
            except Exception as e:
                print(f"[QUEUE] Lỗi: {e}")
        
        print("[QUEUE] Worker stopped")
    
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
                    "texts": [],
                    "photos": [],
                    "videos": [],
                    "stickers": [],
                    "symbol": symbol,
                    "timer": None,
                    "last_activity": now,
                }
                print(f"[SESSION] {now} ({author_id}) -> Start new session")
            
            buffer = self.session_buffers[session_key]
            buffer["last_activity"] = now  # Cập nhật thời gian hoạt động
            
            # Phân loại và thêm vào buffer
            if content_type == "text":
                buffer["texts"].append(content_data)
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
                # Đủ điều kiện → timeout ngắn 3s để gửi nhanh
                timeout = 3.0
                print(f"[SESSION] ✓ Đủ text + media → Gửi sau {timeout}s nếu không có thêm")
            else:
                # Chưa đủ → chờ max 40s TỪ LẦN HOẠT ĐỘNG CUỐI
                timeout = self.session_max_timeout
            
            # Reset timer
            if buffer.get("timer"):
                buffer["timer"].cancel()
            
            timer = threading.Timer(timeout, self._check_and_flush, args=(session_key,))
            timer.start()
            buffer["timer"] = timer
    
    def _check_and_flush(self, session_key):
        """Kiểm tra và gửi session nếu đủ điều kiện"""
        if not self.is_running:
            return
        
        with self.session_lock:
            if session_key not in self.session_buffers:
                return
            
            buffer = self.session_buffers[session_key]
            has_text = len(buffer.get("texts", [])) > 0
            has_media = len(buffer.get("photos", [])) > 0 or len(buffer.get("videos", [])) > 0
            
            # Kiểm tra đã không hoạt động quá 90s chưa (tính từ last_activity)
            idle_time = time.time() - buffer.get("last_activity", time.time())
            is_expired = idle_time >= self.session_max_timeout
            
            author_id = session_key[1]
            print(f"[CHECK] Session {author_id}: text={has_text}, media={has_media}, idle={idle_time:.1f}s, expired={is_expired}")
            
            if has_text and has_media:
                # Đủ điều kiện → gửi
                buffer = self.session_buffers.pop(session_key)
                print(f"[CHECK] ✓ Đủ điều kiện → Thêm vào queue gửi")
                
                # Thêm vào queue
                self.send_queue.put({
                    "texts": buffer.get("texts", []),
                    "photos": buffer.get("photos", []),
                    "videos": buffer.get("videos", []),
                    "stickers": buffer.get("stickers", []),
                    "symbol": buffer.get("symbol", ""),
                    "source_info": f"Session {author_id}"
                })
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
            
            if not isinstance(content, dict):
                content = {}
            
            params = {}
            params_raw = content.get("params")
            if params_raw:
                try:
                    params = json.loads(params_raw)
                except:
                    pass
            
            # Text message (bao gồm cả reply)
            if msg_type == "webchat" or (isinstance(message, str) and message and msg_type not in ["chat.photo", "chat.video", "chat.video.msg", "chat.sticker"]):
                text = message if isinstance(message, str) else ""
                if not text:
                    if isinstance(content, str):
                        text = content
                    elif isinstance(content, dict):
                        text = content.get("text", "") or content.get("title", "")
                
                if text:
                    self._add_to_session(source_id, author_id, "text", text, symbol)
            
            # Photo
            elif msg_type == "chat.photo":
                photo_url = content.get("hd") or content.get("href")
                if photo_url:
                    width = self._safe_int(params.get("width"), 2560)
                    height = self._safe_int(params.get("height"), 2560)
                    self._add_to_session(source_id, author_id, "photo", 
                                        {"url": photo_url, "width": width, "height": height}, symbol)
            
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
    
    def onMessage(self, mid, author_id, message, message_object, thread_id, thread_type):
        """Xử lý tin nhắn"""
        try:
            thread_id_str = str(thread_id)
            author_id_str = str(author_id)
            mid_str = str(mid)
            
            # 1. Bỏ qua tin nhắn từ chính bot (ACC2 - Sender)
            if self.sender_uid and author_id_str == self.sender_uid:
                return
            
            # 2. Bỏ qua nếu MID đã được xử lý (tránh duplicate)
            with self.mid_lock:
                if mid_str in self.processed_mids:
                    return
                self.processed_mids.add(mid_str)
                self._save_mid(mid_str)
            
            # 3. Bỏ qua nếu tin nhắn đến từ một trong các nhóm ĐẦU RA (tránh feedback loop)
            if thread_id_str in self.output_groups_cache:
                return
            
            # Xử lý lệnh !sticker (từ bất kỳ nhóm nào)
            if isinstance(message, str) and message.strip().lower() == "!sticker":
                # Gửi 1 sticker test vào nhóm hiện tại (dùng ACC2 - sender)
                self.sender.sendSticker(3, 50625, 12658, thread_id_str, ThreadType.GROUP)
                print(f"[BOT1] !sticker → ACC2 đã gửi sticker test vào {thread_id_str}")
                return
            
            # Xử lý lệnh !help
            if isinstance(message, str) and message.strip().lower() == "!help":
                help_text = "👋 Bạn cần hỗ trợ gì?\n\n📌 Bot đang hoạt động và sẵn sàng forward tin nhắn!"
                self.sender.send(Message(text=help_text), thread_id_str, ThreadType.GROUP)
                print(f"[BOT1] !help → ACC2 trả lời trong {thread_id_str}")
                return
            
            # Chỉ xử lý tin nhắn từ group
            if thread_type != ThreadType.GROUP:
                return
            
            # 4. Chỉ xử lý tin nhắn từ nhóm ĐẦU VÀO đã đăng ký (dauvao.txt)
            symbol = self.input_groups.get(thread_id_str)
            if not symbol:
                return
            
            group_name = self.group_names_cache.get(thread_id_str, thread_id_str)
            
            msg_preview = str(message)[:50] if message else ""
            print(f"{Fore.CYAN}[MSG] {group_name} ({symbol}): {msg_preview}...{Style.RESET_ALL}")
            
            # Forward tin nhắn
            self._forward_message(message, message_object, thread_id_str, author_id_str, symbol)
        
        except Exception as e:
            print(f"[BOT1] Error: {e}")


# ==================== MAIN ====================
if __name__ == "__main__":
    print("🚀 Khởi động Bot2 - Forward đến NHIỀU nhóm theo keyword...")
    print("📌 ACC1 (IMEI1) = Lắng nghe thu thập")
    print("📌 ACC2 (IMEI2) = Gửi tin nhắn")
    
    from config import IMEI2, SESSION_COOKIES2
    
    # ACC1 để listen (thu thập)
    listener_account = {"imei": IMEI1, "session_cookies": SESSION_COOKIES1}
    # ACC2 để send (gửi)
    sender_account = {"imei": IMEI2, "session_cookies": SESSION_COOKIES2}
    
    bot = None
    
    while True:  # Auto-restart loop
        try:
            if bot is None:
                print(f"\n[MAIN] 🔄Khởi tạo bot... ({datetime.now().strftime('%H:%M:%S')})")
                bot = Bot1(API_KEY, SECRET_KEY, listener_account, sender_account)
            
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

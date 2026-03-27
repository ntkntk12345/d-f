import re
import json
import os
import unicodedata

def is_sold_message(text):
    """Check if message indicates the room is sold/full"""
    if not text: return False
    
    # Normalize
    text_lower = text.lower()
    
    # Keywords indicating sold/full
    sold_keywords = [
        r"đã bán", r"đã cọc", r"hết phòng", r"full phòng", 
        r"hết\s*$", r"full\s*$", r"đã chốt", r"stop", 
        r"dừng\s*dẫn", r"ngừng\s*dẫn", r"dừng\s*giao\s*dịch"
    ]
    
    for pat in sold_keywords:
        if re.search(pat, text_lower):
            return True
            
    return False

# ==================== CONFIG FILES ====================
DAUVAO_FILE = "dauvao.txt"
DAURA_FILE = "daura.json"

# ==================== LOAD CONFIG ====================
def load_dauvao():
    """Load mapping từ dauvao.txt: {group_id: ký hiệu}"""
    group_names = {}
    if not os.path.exists(DAUVAO_FILE):
        print(f"[CONFIG] Không tìm thấy {DAUVAO_FILE}")
        return group_names
    
    with open(DAUVAO_FILE, "r", encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or "|" not in line:
                continue
            parts = line.split("|", 1)
            if len(parts) == 2:
                group_name = parts[0].strip()
                symbol = parts[1].strip()
                group_names[group_name] = symbol
    
    return group_names

def load_daura_keywords():
    """Load keywords từ daura.json với cấu trúc phân cấp"""
    import unicodedata
    keywords = set()
    keyword_levels = {}
    keyword_parents = {} # {ward/street: district}
    
    if not os.path.exists(DAURA_FILE):
        print(f"[CONFIG] Không tìm thấy {DAURA_FILE}")
        return keywords, keyword_levels, keyword_parents
    
    try:
        with open(DAURA_FILE, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
        
        for district, info in data.items():
            d_norm = unicodedata.normalize('NFC', district)
            keywords.add(d_norm)
            # Priority: If already exists as key (e.g. from previous loop?), keep it. 
            # Actually, district level should overwrite ward level if conflict? 
            # No, District defs usually come top level. "Thanh Trì" is key.
            if d_norm not in keyword_levels or keyword_levels[d_norm] != "district":
                keyword_levels[d_norm] = info.get("type", "district")
            
            # Helper to add child
            def add_child(child, c_type):
                c_norm = unicodedata.normalize('NFC', child)
                keywords.add(c_norm)
                
                # If child name == District name (e.g. Thanh Trì ward in Hoàng Mai), 
                # DONT overwrite the "district" type of the main entry.
                if keyword_levels.get(c_norm) == "district":
                    pass # Keep it as district
                else:
                    keyword_levels[c_norm] = c_type
                
                if c_norm not in keyword_parents: keyword_parents[c_norm] = set()
                keyword_parents[c_norm].add(d_norm)

            for ward in info.get("wards", []):
                add_child(ward, "ward")
                
            for street in info.get("streets", []):
                add_child(street, "street")
                
    except Exception as e:
        print(f"[DAURA] Lỗi load JSON: {e}")
    
    return keywords, keyword_levels, keyword_parents

# ==================== RULES ====================
def _generate_rules():
    """Tự động tạo rules từ dauvao.txt + custom rules"""
    # Load all symbols from dauvao.txt
    symbols = set()
    group_symbols = load_dauvao()
    for symbol in group_symbols.values():
        symbols.add(symbol.lower())
    
    # Default rule for all symbols
    default_rule = {"add_prefix": True}
    rules = {symbol: default_rule.copy() for symbol in symbols}
    
    # Custom rules for specific groups (override defaults)
    custom_rules = {
        "1a": {"remove_commission": True, "add_prefix": True, "format_price": True},  # Changed from "mbkd_only"
        "2a": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "3a": {"add_prefix": True, "format_price": True},
        "4a": {"remove_commission": True, "add_prefix": True, "keep_contract_duration": True, "format_price": True},
        "5a": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "6a": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "8a": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "9a": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "10a": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "11a": {"remove_commission": True, "remove_bonus": True, "add_prefix": True, "format_price": True},
        "12a": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "13a": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "14a": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "111a": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "sleepbox": {"add_prefix": True, "format_price": True},
        "tdland": {"remove_phone": True, "add_prefix": True, "format_price": True},
        "alophongtro": {"remove_phone": True, "add_prefix": True, "format_price": True},
        "3h": {"add_prefix": True, "format_price": True},
        "avhome": {"add_prefix": True, "format_price": True},
        "td le phuong thao": {"remove_commission": True, "remove_bonus": True, "add_prefix": True, "format_price": True},
        "agp": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "hdhome": {"remove_phone": True, "add_prefix": True, "format_price": True, "remove_links": True},
        "mkland": {"remove_phone": True, "remove_commission": True, "add_prefix": True, "format_price": True},
        "tm1": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "tm2": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "taiphat": {"add_prefix": True, "remove_phone": True, "format_price": True},
        "taiphat1": {"add_prefix": True, "remove_phone": True, "format_price": True},
        "vietquoc": {"add_prefix": True, "format_price": True},
        "vietquoc1": {"add_prefix": True, "format_price": True},
        "tc home": {"add_prefix": True, "format_price": True, "remove_phone": True},
        "9a": {"remove_commission": True, "add_prefix": True, "format_price": True},
        "chdv": {"remove_phone": True, "add_prefix": True, "format_price": True},
        "chdv hưng phát": {"add_prefix": True},
        "chdv chọn lọc": {"add_prefix": True},
        "chdv chinh trần": {"add_prefix": True},
    }
    
    # Merge custom rules
    rules.update(custom_rules)
    
    return rules

# Generate RULES dynamically
RULES = _generate_rules()

# ==================== TEXT PROCESSING ====================
def format_price_to_xtr(text):
    """
    Chuyển đổi giá về định dạng Xtr hoặc XtrY
    Ví dụ: 
    - 4.700.000 → 4tr7      (kể cả 4.700.000đ/tháng)
    - 11.500.000 → 11tr5
    - 4.4tr → 4tr4
    - 3600k → 3tr6
    - 7.3 hoặc 7,3 → 7tr3  (mọi nơi trong text)
    - 22.000.000đ/tháng → 22tr
    """
    if not text: return text

    def normalize_val(val):
        if val < 1.0:
            return f"{int(round(val * 1000))}k"
        whole = int(val)
        decimal = int((val - whole) * 10 + 0.1)
        return f"{whole}tr{decimal}" if decimal > 0 else f"{whole}tr"

    # 1. Xử lý X.XXX.XXX hoặc X.XXX.XXXđ (22.000.000đ/tháng → 22tr)
    #    Cho phép đuôi là đ, d, Đ, D (ký hiệu đồng) ngay sau số
    def sub_separators(m):
        num = re.sub(r'[.,]', '', m.group(1))  # Chỉ lấy phần số, bỏ dấu chấm/phẩy
        try:
            return normalize_val(int(num) / 1000000)
        except: return m.group(0)
    text = re.sub(r'\b(\d{1,3}(?:[.,]\d{3}){2,})[đdĐD]?\b', sub_separators, text)

    # 2. Xử lý X.Ytr hoặc X,Ytr hoặc X.Y triệu (11.5tr → 11tr5)
    def sub_decimal_unit(m):
        try:
            val = float(m.group(1).replace(',', '.'))
            return normalize_val(val)
        except: return m.group(0)
    text = re.sub(r'(\d+[.,]\d+)\s*(tr|triệu)\b', sub_decimal_unit, text, flags=re.IGNORECASE)

    # 3. Xử lý X.Y hoặc X,Y bất kỳ nơi nào (7.3 → 7tr3, 7,3 → 7tr3)
    #    Điều kiện: val trong khoảng 1.0-300 (giá triệu hợp lý cho phòng/căn)
    #    Bỏ qua nếu đằng sau là thêm chữ số (tránh 22.000 bị nhầm)
    def sub_standalone_decimal(m):
        try:
            val = float(m.group(0).replace(',', '.'))
            if 1.0 <= val <= 300:
                return normalize_val(val)
            return m.group(0)
        except: return m.group(0)
    # Dùng negative lookbehind/lookahead để không match số đã có đơn vị (tr/k/%) phía sau
    text = re.sub(r'(?<![.,\d])\d+[.,]\d+(?![.,\d]|(?:tr|triệu|k|%|\s*(?:tr|triệu|k)))',
                  sub_standalone_decimal, text, flags=re.IGNORECASE)

    # 4. Xử lý Xk (3600k → 3tr6)
    def sub_k(m):
        try:
            val = int(m.group(1)) / 1000
            if val >= 0.1: return normalize_val(val)
            return m.group(0)
        except: return m.group(0)
    text = re.sub(r'\b(\d{3,})k\b', sub_k, text, flags=re.IGNORECASE)

    # 5. Chuẩn hóa X tr Y / Xtr Y → XtrY (11 tr 5 → 11tr5)
    text = re.sub(r'(\d+)\s*tr\s*(\d+)', r'\1tr\2', text, flags=re.IGNORECASE)
    
    # 6. Đảm bảo X tr → Xtr
    text = re.sub(r'(\d+)\s*tr\b(?!\d)', r'\1tr', text, flags=re.IGNORECASE)

    # 7. Xử lý trường hợp 0trX → X00k (0tr1 → 100k, 0tr5 → 500k)
    def sub_zero_tr(m):
        try:
            val = float(f"0.{m.group(1)}")
            return f"{int(round(val * 1000))}k"
        except: return m.group(0)
    text = re.sub(r'\b0tr(\d+)\b', sub_zero_tr, text, flags=re.IGNORECASE)

    return text


def remove_commission(text, keep_contract_duration=False):
    hd_info = ""
    if keep_contract_duration:
        hd_match = re.search(r'\(\s*hd\s*\d+\s*th\s*\)', text, re.IGNORECASE)
        if hd_match: hd_info = hd_match.group(0)

    # Patterns to replace with empty string
    replace_patterns = [
        r'\bsale\b', 
        r'\bctv\b', 
        r'\bhh\b', 
        r'[Hh]oa\s*[Hh]ồng', 
        r'\d+[,.]?\d*\s*%', 
        r'%', 
        r'🌺', 
        r'🌹', 
        r'Mã\s*này\s*chủ\s*đánh\s*thuế'
    ]
    
    lines = text.split('\n')
    new_lines = []
    for line in lines:
        processed_line = line
        for p in replace_patterns:
            processed_line = re.sub(p, '', processed_line, flags=re.IGNORECASE)
        
        # Normalize whitespace
        processed_line = re.sub(r'\s+', ' ', processed_line).strip()
        new_lines.append(processed_line)
    
    processed = '\n'.join(new_lines)
    if hd_info and keep_contract_duration:
        if hd_info not in processed: processed += f"\n{hd_info}"
    return processed.strip()

def remove_bonus(text):
    bonus_patterns = [r'[Tt]hưởng', r'🎉']
    
    lines = text.split('\n')
    new_lines = []
    for line in lines:
        # Check if line contains bonus pattern
        if any(re.search(p, line, re.IGNORECASE) for p in bonus_patterns):
            # Check if line contains "Mã" or "Code"
            # Keep the part starting from Mã/Code
            code_match = re.search(r'\b(Mã|Code)(\s*:?.*)', line, re.IGNORECASE)
            if code_match:
                # Reconstruct "Mã..." part
                # group(0) is the full match "Mã: 123"
                new_lines.append(code_match.group(0))
            else:
                # Delete line (do nothing)
                pass
        else:
            new_lines.append(line)
        
    return '\n'.join(new_lines).strip()

def remove_phone(text):
    phone_delete_patterns = [r'\b0(?:[\.\s]*\d){9,}\b', r'\b(liên\s*hệ|lh|l\.h)\b', r'\b(sđt|sdt)\b', r'\bzalo\b', r'\bcall\b', r'📞', r'SĐT\s*dẫn', r'QUẢN\s*LÝ\s*:']
    lines = [line.strip() for line in text.split('\n')]
    return '\n'.join([line for line in lines if not any(re.search(p, line, re.IGNORECASE) for p in phone_delete_patterns)]).strip()

def remove_links(text):
    return re.sub(r'https?://(www\.)?(facebook\.com|fb\.com|docs\.google\.com)[^\s]*', '', text)

def add_prefix(text, symbol):
    return f"{symbol} {text.strip()}" if text.strip() else text.strip()

def process_message(text, symbol, add_prefix_override=True):
    if not text or not text.strip(): return text
    
    # Check if sold/full
    if is_sold_message(text):
        return None

    rules = RULES.get(symbol.lower(), {})
    processed = remove_bonus(text)
    processed = remove_commission(processed, rules.get("keep_contract_duration", False))
    processed = remove_phone(processed) # Always remove phone
    if rules.get("remove_links"): processed = remove_links(processed)
    
    format_price_rule = rules.get("format_price")
    if format_price_rule:
        if format_price_rule == "mbkd_only":
            if "mbkd" in text.lower() or "mặt bằng" in text.lower():
                processed = format_price_to_xtr(processed)
        else: processed = format_price_to_xtr(processed)
    
    # Add prefix only if requested AND override is True
    if rules.get("add_prefix") and add_prefix_override: 
        processed = add_prefix(processed, symbol)
        
        # Special handling for vietquoc1 (KIM VĂN KIM LŨ): Add "Địa điểm: Hoàng Mai" after symbol
        if symbol.lower() == "vietquoc1":
            processed = f"{processed}\nĐịa điểm: Hoàng Mai"
    
    # Clean up empty lines
    lines = [line.strip() for line in processed.split('\n')]
    cleaned = []
    prev_empty = False
    for line in lines:
        if line:
            cleaned.append(line)
            prev_empty = False
        elif not prev_empty:
            cleaned.append(line)
            prev_empty = True
    return '\n'.join(cleaned).strip()

def extract_keywords_from_text(text, all_keywords, keyword_levels=None):
    """
    Trích xuất keywords từ text với ưu tiên quận.
    Nếu tìm thấy quận thì CHỈ trả về quận, bỏ qua phường/đường.
    
    Args:
        text: Text cần phân tích
        all_keywords: Set tất cả keywords
        keyword_levels: Dict mapping keyword -> level (district/ward/street)
    
    Returns:
        List các keywords tìm thấy (ưu tiên quận)
    """
    import unicodedata
    found = []
    if not text: return found
    
    text_norm = unicodedata.normalize('NFC', text).lower()
    
    # Phân loại keywords theo level
    districts = []
    others = []  # wards + streets
    
    for keyword in all_keywords:
        kw_norm = unicodedata.normalize('NFC', keyword).lower()
        # Use regex with word boundaries for more accurate matching
        # Escape keyword to handle special regex chars
        pattern = r'(?<!\w)' + re.escape(kw_norm) + r'(?!\w)'
        if re.search(pattern, text_norm):
            # Phân loại theo level: District và Area được ưu tiên cao nhất
            level = keyword_levels.get(keyword) if keyword_levels else None
            if level in ["district", "area"]:
                districts.append(keyword)
            else:
                others.append(keyword)
    
    # Trả về tất cả các keywords tìm thấy (Quận, Khu vực, Phường, Đường)
    # Không lọc theo level để tránh việc "Mỹ Đình" bị mất nếu tên nhóm có cả "Nam Từ Liêm"
    return districts + others

def normalize_district_name(district):
    import unicodedata
    text = unicodedata.normalize('NFD', district).encode('ascii', 'ignore').decode('utf-8')
    return text.lower().replace(' ', '')

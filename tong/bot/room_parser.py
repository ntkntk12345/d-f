"""
Room Parser Module - Parse địa chỉ và giá từ tin nhắn phòng trọ
"""
import re
import unicodedata


def _normalize_text(text):
    """Chuẩn hóa text: lowercase, bỏ dấu."""
    if not text:
        return ""
    text = str(text).lower()
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return text


def parse_price(text):
    """
    Parse giá từ text. Hỗ trợ các format:
    - 4tr3 → 4.3 (triệu)
    - 4m3 → 4.3
    - 4 triệu 3 → 4.3
    - 4tr → 4.0
    - 4.5tr → 4.5
    - Giá thuê: 4tr5 → 4.5
    - Giá: 4,5tr → 4.5
    
    Returns: float (triệu VND) hoặc None nếu không parse được
    """
    if not text:
        return None
    
    text_lower = text.lower().replace(",", ".")
    
    # Pattern 1: "Giá thuê: 4tr3" hoặc "Giá: 4.5tr"
    price_line_pattern = r'giá\s*(?:thuê)?\s*:?\s*(\d+(?:\.\d+)?)\s*(tr|triệu|trieu|m)\s*(\d*)'
    match = re.search(price_line_pattern, text_lower)
    if match:
        main = float(match.group(1))
        decimal = match.group(3)
        if decimal:
            # 4tr3 → 4.3
            decimal_value = float(decimal) / (10 ** len(decimal))
            return main + decimal_value
        return main
    
    # Pattern 2: Tìm bất kỳ pattern giá nào trong text
    # "4tr3", "4m3", "4.5tr", "4 triệu 3"
    patterns = [
        # 4tr3, 4m3
        r'(\d+(?:\.\d+)?)\s*(tr|m)\s*(\d+)',
        # 4 triệu 3
        r'(\d+(?:\.\d+)?)\s*(triệu|trieu)\s*(\d+)',
        # 4tr, 4.5tr, 4m
        r'(\d+(?:\.\d+)?)\s*(tr|triệu|trieu|m)(?!\d)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text_lower)
        if match:
            main = float(match.group(1))
            if len(match.groups()) >= 3 and match.group(3):
                # Có phần thập phân (4tr3 → 4.3)
                decimal = match.group(3)
                decimal_value = float(decimal) / (10 ** len(decimal))
                return main + decimal_value
            return main
    
    return None


def parse_address(text, districts=None):
    """
    Parse địa chỉ từ text.
    
    Args:
        text: Text chứa địa chỉ
        districts: List các quận/huyện để match (vd: ["Thanh Xuân", "Hà Đông"])
    
    Returns: dict hoặc None
        {
            "full": "Ngõ 72 Chính Kinh - Thanh Xuân",
            "district": "Thanh Xuân",
            "street": "Chính Kinh"
        }
    """
    if not text:
        return None
    
    result = {
        "full": None,
        "district": None,
        "street": None
    }
    
    lines = text.split('\n')
    
    # Tìm dòng có "địa chỉ:" hoặc "đc:"
    address_line = None
    for line in lines:
        line_lower = line.lower().strip()
        if any(kw in line_lower for kw in ['địa chỉ', 'đc:', 'dia chi']):
            # Lấy phần sau dấu ":"
            if ':' in line:
                address_line = line.split(':', 1)[1].strip()
            else:
                address_line = line.strip()
            break
    
    if address_line:
        result["full"] = address_line
    
    # Tìm quận/huyện trong text
    if districts:
        text_norm = _normalize_text(text)
        for district in districts:
            district_norm = _normalize_text(district)
            if district_norm and district_norm in text_norm:
                result["district"] = district
                break
    
    # Tìm tên đường/ngõ
    street_patterns = [
        r'(?:ngõ|ngo|ngách|ngach|số|so)\s*(\d+[a-z]?(?:\s*[-/]\s*\d+)*)',
        r'(?:phố|pho|đường|duong)\s+([^\s,\-]+(?:\s+[^\s,\-]+)*)',
    ]
    
    search_text = address_line or text
    for pattern in street_patterns:
        match = re.search(pattern, search_text.lower())
        if match:
            result["street"] = match.group(0).strip()
            break
    
    # Nếu có full address hoặc district → trả về
    if result["full"] or result["district"]:
        return result
    
    return None


def parse_room_info(text, districts=None):
    """
    Parse toàn bộ thông tin phòng từ tin nhắn.
    
    Args:
        text: Full text tin nhắn
        districts: List các quận/huyện để match
    
    Returns: dict hoặc None
        {
            "address": {...},
            "price": 4.3,
            "raw_text": "..."
        }
    """
    if not text:
        return None
    
    result = {
        "address": parse_address(text, districts),
        "price": parse_price(text),
        "raw_text": text
    }
    
    # Chỉ trả về nếu có ít nhất 1 thông tin hữu ích
    if result["address"] or result["price"]:
        return result
    
    return None


def match_location(query, districts):
    """
    Tìm quận/huyện phù hợp với query của user.
    
    Args:
        query: Text tìm kiếm của user (vd: "thanh xuan", "tx")
        districts: List các quận/huyện
    
    Returns: str hoặc None - tên quận/huyện khớp
    """
    if not query or not districts:
        return None
    
    query_norm = _normalize_text(query)
    
    # Exact match (normalized)
    for district in districts:
        if _normalize_text(district) == query_norm:
            return district
    
    # Partial match
    for district in districts:
        if query_norm in _normalize_text(district):
            return district
        if _normalize_text(district) in query_norm:
            return district
    
    return None

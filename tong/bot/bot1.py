import os
import json
import re

OK_DIR = "districts_ok"

def format_price(num):
    """Convert integer to 'X.XXX.XXX' format"""
    return "{:,}".format(num).replace(",", ".")

def parse_price_string(price_str):
    """
    Parses strings like:
    - "5tr8" -> (5800000, 5800000)
    - "6.5-7.5tr" -> (6500000, 7500000)
    - "4tr" -> (4000000, 4000000)
    - "3.500.000" -> (3500000, 3500000)
    Returns (min_price, max_price)
    """
    if not price_str or price_str == "N/A":
        return None, None

    # Remove any non-essential characters but keep range indicator
    s = price_str.lower().replace(" ", "")
    s = s.replace("triệu", "tr").replace("k", "000")
    
    def parse_single(text):
        if not text: return 0
        text = text.replace(",", ".")
        
        # Recursive handle 'tr' (millions)
        if 'tr' in text:
            parts = text.split('tr')
            try:
                millions = float(parts[0]) if parts[0] else 0
            except: millions = 0
            
            val = int(millions * 1000000)
            rest = parts[1] if len(parts) > 1 else ""
            if rest:
                rest_val = parse_single(rest)
                # If it's a small shorthand like "3tr5" or "3tr85"
                if rest_val < 1000 and "k" not in rest:
                    if len(rest) == 1: val += rest_val * 100000
                    elif len(rest) == 2: val += rest_val * 10000
                else:
                    val += rest_val
            return val
            
        # Handle 'k' (thousands)
        if 'k' in text:
            try:
                return int(float(text.replace('k', '')) * 1000)
            except: return 0
            
        # Pure numbers or decimals
        try:
            val = float(text)
            if val < 100: val *= 1000000 # Handle "3.5" as 3.5 million
            return int(val)
        except: return 0

    # 1. Handle ranges like "2tr - 3tr"
    if '-' in s:
        parts = s.split('-')
        if len(parts) == 2:
            p1 = parse_single(parts[0])
            p2 = parse_single(parts[1])
            if p1 > 0 and p2 > 0:
                return min(p1, p2), max(p1, p2)

    # 2. Handle single price
    val = parse_single(s)
    if val > 0:
        return val, val

    return None, None

def main():
    if not os.path.exists(OK_DIR):
        print(f"Error: {OK_DIR} not found.")
        return

    for filename in os.listdir(OK_DIR):
        if not filename.endswith(".json"):
            continue
            
        filepath = os.path.join(OK_DIR, filename)
        print(f"Standardizing {filename}...")
        
        with open(filepath, 'r', encoding='utf-8') as f:
            rooms = json.load(f)
            
        modified = False
        for room in rooms:
            raw_price = room.get("price", "")
            p_min, p_max = parse_price_string(raw_price)
            
            if p_min is not None:
                room["price_min"] = p_min
                room["price_max"] = p_max
                
                # Update visual price format if it's messy
                if p_min == p_max:
                    room["price_display"] = format_price(p_min)
                else:
                    room["price_display"] = f"{format_price(p_min)} - {format_price(p_max)}"
                modified = True
        
        if modified:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(rooms, f, ensure_ascii=False, indent=2)
            print(f"  Done {filename}")

if __name__ == "__main__":
    main()

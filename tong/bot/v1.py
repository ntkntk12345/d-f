import argparse
import json
import os
import random
import time
from typing import Any

import requests


NVIDIA_API_URL = os.getenv("NVIDIA_API_URL", "https://integrate.api.nvidia.com/v1/chat/completions")
NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "mistralai/mistral-large-3-675b-instruct-2512")
NVIDIA_STREAM = os.getenv("NVIDIA_STREAM", "true").lower() in {"1", "true", "yes"}
NVIDIA_MAX_TOKENS = int(os.getenv("NVIDIA_MAX_TOKENS", "2048"))
NVIDIA_TEMPERATURE = float(os.getenv("NVIDIA_TEMPERATURE", "0.15"))
NVIDIA_TOP_P = float(os.getenv("NVIDIA_TOP_P", "1.0"))
NVIDIA_FREQUENCY_PENALTY = float(os.getenv("NVIDIA_FREQUENCY_PENALTY", "0.0"))
NVIDIA_PRESENCE_PENALTY = float(os.getenv("NVIDIA_PRESENCE_PENALTY", "0.0"))
NVIDIA_TIMEOUT_CONNECT = float(os.getenv("NVIDIA_TIMEOUT_CONNECT", "15"))
NVIDIA_TIMEOUT_READ = float(os.getenv("NVIDIA_TIMEOUT_READ", "240"))
NVIDIA_RETRY_DELAY = float(os.getenv("NVIDIA_RETRY_DELAY", "2"))
NVIDIA_DEBUG_ERRORS = os.getenv("NVIDIA_DEBUG_ERRORS", "true").lower() in {"1", "true", "yes"}
NVIDIA_LOCAL_ONLY = os.getenv("NVIDIA_LOCAL_ONLY", "false").lower() in {"1", "true", "yes"}
NVIDIA_TIMEOUT_FAIL_FAST = os.getenv("NVIDIA_TIMEOUT_FAIL_FAST", "true").lower() in {"1", "true", "yes"}
NVIDIA_FALLBACK_TO_LOCAL = os.getenv("NVIDIA_FALLBACK_TO_LOCAL", "false").lower() in {"1", "true", "yes"}

# Nhap key truc tiep trong code neu muon (uu tien cao hon env)
# Vi du:
# HARDCODED_NVIDIA_API_KEYS = ["nvapi-xxx", "nvapi-yyy"]
# hoac:
# HARDCODED_NVIDIA_API_KEY = "nvapi-xxx"
HARDCODED_NVIDIA_API_KEYS: list[str] = []
HARDCODED_NVIDIA_API_KEY = "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"


def load_nvidia_tokens() -> list[str]:
    if HARDCODED_NVIDIA_API_KEYS:
        return [token.strip() for token in HARDCODED_NVIDIA_API_KEYS if str(token).strip()]

    if HARDCODED_NVIDIA_API_KEY.strip():
        return [HARDCODED_NVIDIA_API_KEY.strip()]

    raw_multi = os.getenv("NVIDIA_API_KEYS", "").strip()
    if raw_multi:
        return [token.strip() for token in raw_multi.split(",") if token.strip()]

    raw_single = os.getenv("NVIDIA_API_KEY", "").strip()
    return [raw_single] if raw_single else []


NVIDIA_TOKENS = load_nvidia_tokens()


PROMPT_TEMPLATE = """You are a strict real-estate extractor.
You will receive room-post records with ID and raw text.

Requirements:
1. Return JSON array only, no extra text.
2. Each object must contain exactly: "id", "address", "price", "price1", "price2", "type".
3. Keep "id" exactly as input.
4. "price" must keep the original price string from source text.
5. "price1" and "price2" must be full-VND numeric strings (example: "5800000").
6. If price is a range, price1 is low and price2 is high; if single value, price2 = price1.
7. "type" can include only tags explicitly present in raw_text. If none, set null.
8. Skip items with unclear address or price.

Allowed type tags:
- studio
- 1n1k
- 2n1k
- 2n1b
- 2 ngu
- gac xep
- giuong tang
- vskk
- vsc

Raw data:
{raw_data}
"""


def extract_completion_content(result: dict[str, Any]) -> str:
    choices = result.get("choices") or []
    if not choices:
        return ""

    message = choices[0].get("message") or {}
    content = message.get("content", "")

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        text_chunks: list[str] = []
        for part in content:
            if not isinstance(part, dict):
                continue
            if isinstance(part.get("text"), str):
                text_chunks.append(part["text"])
            elif isinstance(part.get("content"), str):
                text_chunks.append(part["content"])
        return "".join(text_chunks)

    return str(content)


def extract_stream_content(response: requests.Response) -> str:
    chunks: list[str] = []
    raw_lines: list[str] = []
    for line in response.iter_lines():
        if not line:
            continue

        decoded_line = line.decode("utf-8", errors="replace").strip()
        if not decoded_line:
            continue

        raw_lines.append(decoded_line)
        if not decoded_line.startswith("data:"):
            continue

        data = decoded_line[5:].strip()
        if data == "[DONE]":
            break

        try:
            event = json.loads(data)
        except json.JSONDecodeError:
            continue

        choices = event.get("choices") or []
        if not choices:
            continue

        choice = choices[0]
        delta = choice.get("delta") or {}
        delta_content = delta.get("content")

        if isinstance(delta_content, str):
            chunks.append(delta_content)
            continue

        if isinstance(delta_content, list):
            for part in delta_content:
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    chunks.append(part["text"])
            continue

        message = choice.get("message") or {}
        message_content = message.get("content")
        if isinstance(message_content, str):
            chunks.append(message_content)

    content = "".join(chunks).strip()
    if content:
        return content

    # Some gateways ignore SSE and return one-shot JSON even when stream=True.
    if len(raw_lines) == 1 and raw_lines[0].startswith("{"):
        try:
            event = json.loads(raw_lines[0])
        except json.JSONDecodeError:
            return raw_lines[0]

        if isinstance(event, dict):
            completion_content = extract_completion_content(event)
            return completion_content if completion_content else raw_lines[0]

    return "\n".join(raw_lines).strip()


def clean_json_block(content: str) -> str:
    content = content.strip()
    if "```json" in content:
        content = content.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in content:
        content = content.split("```", 1)[1].split("```", 1)[0].strip()
    return content


def truncate_for_log(text: str, limit: int = 400) -> str:
    clean = " ".join(str(text).split())
    if len(clean) <= limit:
        return clean
    return clean[:limit] + "...(truncated)"


def extract_json_candidate(text: str) -> str:
    start = -1
    stack: list[str] = []
    in_string = False
    escaped = False

    for i, ch in enumerate(text):
        if start == -1:
            if ch in "{[":
                start = i
                stack.append(ch)
            continue

        if in_string:
            if escaped:
                escaped = False
                continue
            if ch == "\\":
                escaped = True
                continue
            if ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            continue

        if ch in "{[":
            stack.append(ch)
            continue

        if ch in "}]":
            if not stack:
                continue

            top = stack[-1]
            if (top == "{" and ch == "}") or (top == "[" and ch == "]"):
                stack.pop()
                if not stack:
                    return text[start : i + 1]
            else:
                return ""

    return ""


def parse_ai_json(content: str) -> Any:
    cleaned = clean_json_block(content)
    if not cleaned:
        raise ValueError("AI returned empty content.")

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as err:
        candidate = extract_json_candidate(cleaned)
        if candidate:
            return json.loads(candidate)
        raise ValueError(f"AI returned non-JSON content: {truncate_for_log(cleaned)}") from err


def error_payload_snippet(response: requests.Response, limit: int = 400) -> str:
    try:
        return truncate_for_log(response.text, limit=limit)
    except Exception:
        return "<unavailable>"


def normalize_ai_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for row in rows:
        room_id = str(row.get("id", "")).strip()
        if not room_id or room_id in seen_ids:
            continue

        address = row.get("address")
        price = row.get("price")
        price1 = row.get("price1")
        price2 = row.get("price2")
        type_value = row.get("type")

        if address is None or price is None or price1 is None or price2 is None:
            continue

        address_str = str(address).strip()
        price_str = str(price).strip()
        price1_str = str(price1).strip()
        price2_str = str(price2).strip()

        if not address_str or not price_str or not price1_str or not price2_str:
            continue

        if isinstance(type_value, list):
            tags = [str(tag).strip() for tag in type_value if str(tag).strip()]
            normalized_type: str | None = ", ".join(tags) if tags else None
        elif type_value is None:
            normalized_type = None
        else:
            type_str = str(type_value).strip()
            normalized_type = type_str if type_str else None

        normalized.append(
            {
                "id": room_id,
                "address": address_str,
                "price": price_str,
                "price1": price1_str,
                "price2": price2_str,
                "type": normalized_type,
            }
        )
        seen_ids.add(room_id)

    return normalized


def process_batch(batch: list[dict[str, str]], max_retries: int = 5) -> list[dict[str, Any]] | None:
    if NVIDIA_LOCAL_ONLY:
        return [dict(item) for item in batch]

    raw_data_str = ""
    for item in batch:
        raw_data_str += f"ID: {item['id']}\nText: {item['raw_text']}\n---\n"

    prompt = PROMPT_TEMPLATE.format(raw_data=raw_data_str)

    if not NVIDIA_LOCAL_ONLY and not NVIDIA_TOKENS:
        raise RuntimeError("Missing NVIDIA API key. Set NVIDIA_API_KEY or NVIDIA_API_KEYS.")

    timeout = (NVIDIA_TIMEOUT_CONNECT, NVIDIA_TIMEOUT_READ)
    max_retries = max(max_retries, len(NVIDIA_TOKENS))
    last_error = ""

    for attempt in range(max_retries):
        current_token = random.choice(NVIDIA_TOKENS)
        attempt_had_timeout = False

        stream_modes = [NVIDIA_STREAM]
        if NVIDIA_STREAM:
            # Fallback for environments where SSE is unavailable.
            stream_modes.append(False)

        for stream_mode in stream_modes:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {current_token}",
                "Accept": "text/event-stream" if stream_mode else "application/json",
            }

            payload = {
                "model": NVIDIA_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": NVIDIA_MAX_TOKENS,
                "temperature": NVIDIA_TEMPERATURE,
                "top_p": NVIDIA_TOP_P,
                "frequency_penalty": NVIDIA_FREQUENCY_PENALTY,
                "presence_penalty": NVIDIA_PRESENCE_PENALTY,
                "stream": stream_mode,
            }

            response = None
            try:
                response = requests.post(
                    NVIDIA_API_URL,
                    headers=headers,
                    json=payload,
                    timeout=timeout,
                    stream=stream_mode,
                )

                if response.status_code == 429:
                    last_error = "Rate limited (429)."
                    break

                if response.status_code >= 400:
                    payload_snippet = error_payload_snippet(response)
                    last_error = f"HTTP {response.status_code}: {payload_snippet}"
                    break

                if stream_mode:
                    content = extract_stream_content(response)
                else:
                    result = response.json()
                    content = extract_completion_content(result)

                parsed = parse_ai_json(content)
                if isinstance(parsed, dict):
                    normalized = normalize_ai_rows([parsed])
                    if normalized:
                        return normalized
                    last_error = "JSON response had no valid rows (missing required fields)."
                    continue

                if isinstance(parsed, list):
                    dict_rows = [row for row in parsed if isinstance(row, dict)]
                    normalized = normalize_ai_rows(dict_rows)
                    if normalized:
                        return normalized
                    last_error = "JSON array response had no valid rows (missing required fields)."
                    continue

                last_error = f"Unexpected AI JSON type: {type(parsed).__name__}"
            except requests.Timeout:
                attempt_had_timeout = True
                last_error = (
                    "Request timed out "
                    f"(connect={NVIDIA_TIMEOUT_CONNECT}s, read={NVIDIA_TIMEOUT_READ}s)."
                )
            except requests.RequestException as err:
                last_error = f"Request failed: {err}"
            except Exception as err:
                last_error = f"{type(err).__name__}: {err}"
            finally:
                if response is not None:
                    response.close()

        if NVIDIA_DEBUG_ERRORS:
            print(f"  [AI] Attempt {attempt + 1}/{max_retries} failed: {last_error}")

        if NVIDIA_TIMEOUT_FAIL_FAST and attempt_had_timeout and len(batch) > 1:
            if NVIDIA_DEBUG_ERRORS:
                print(
                    f"  [AI] Timeout on batch size {len(batch)}. "
                    "Stop retrying this size so caller can split smaller."
                )
            break

        if attempt < max_retries - 1:
            time.sleep(NVIDIA_RETRY_DELAY)

    if NVIDIA_DEBUG_ERRORS and last_error:
        print(f"  [AI] Batch failed after {max_retries} attempts. Last error: {last_error}")

    return None


def has_json_files(directory: str) -> bool:
    if not os.path.isdir(directory):
        return False
    return any(name.lower().endswith(".json") for name in os.listdir(directory))


def find_summary_candidates(base_dir: str) -> list[str]:
    if not os.path.isdir(base_dir):
        return []

    name_options = (
        "districts_summary",
        "districts_sumary",
        "district_summary",
        "district_sumary",
        "summary",
        "sumary",
    )

    candidates: list[str] = []
    for name in name_options:
        candidates.append(os.path.join(base_dir, name))

    try:
        child_dirs = [entry.path for entry in os.scandir(base_dir) if entry.is_dir()]
    except OSError:
        child_dirs = []

    # Extra fallback: pick dirs that look like summary/sumary naming.
    for child in child_dirs:
        child_name = os.path.basename(child).lower()
        if "sum" in child_name:
            candidates.append(child)

    return candidates


def find_full_candidates(base_dir: str) -> list[str]:
    if not os.path.isdir(base_dir):
        return []

    name_options = (
        "districts_full",
        "district_full",
        "full",
    )

    candidates: list[str] = []
    for name in name_options:
        candidates.append(os.path.join(base_dir, name))

    try:
        child_dirs = [entry.path for entry in os.scandir(base_dir) if entry.is_dir()]
    except OSError:
        child_dirs = []

    # Extra fallback: pick dirs that look like full naming.
    for child in child_dirs:
        child_name = os.path.basename(child).lower()
        if "full" in child_name:
            candidates.append(child)

    return candidates


def first_existing_json_dir(candidates: list[str]) -> str | None:
    seen: set[str] = set()
    for candidate in candidates:
        abs_candidate = os.path.abspath(candidate)
        if abs_candidate in seen:
            continue
        seen.add(abs_candidate)
        if has_json_files(abs_candidate):
            return abs_candidate
    return None


def resolve_input_dirs(
    cli_summary_dir: str | None,
    cli_full_dir: str | None,
) -> tuple[str | None, str | None]:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    cwd = os.getcwd()
    search_roots = [script_dir, cwd, os.path.join(cwd, "bot"), os.path.join(cwd, "batdongsan")]

    summary_candidates: list[str] = []
    if cli_summary_dir:
        cli_path = os.path.abspath(cli_summary_dir)
        summary_candidates.append(cli_path)
        summary_candidates.extend(find_summary_candidates(cli_path))
    for root in search_roots:
        summary_candidates.extend(find_summary_candidates(root))

    full_candidates: list[str] = []
    if cli_full_dir:
        cli_path = os.path.abspath(cli_full_dir)
        full_candidates.append(cli_path)
        full_candidates.extend(find_full_candidates(cli_path))
    for root in search_roots:
        full_candidates.extend(find_full_candidates(root))

    summary_dir = first_existing_json_dir(summary_candidates)
    full_dir = first_existing_json_dir(full_candidates)

    if summary_dir is None and full_dir is None:
        raise FileNotFoundError(
            "Cannot find input directory with JSON files. "
            "Supported names include districts_summary / summary / sumary "
            "and districts_full / full. Use --summary-dir or --full-dir."
        )

    return summary_dir, full_dir


def resolve_ok_dir(cli_ok_dir: str | None, source_dir: str) -> str:
    if cli_ok_dir:
        return os.path.abspath(cli_ok_dir)
    return os.path.join(os.path.dirname(source_dir), "districts_ok")


def load_json_array(path: str) -> list[dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    return []


def save_json_array(path: str, data: list[dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def normalize_input_rows(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    text_keys = ("raw_text", "text", "content", "message")

    for row in rows:
        room_id = str(row.get("id", "")).strip()
        if not room_id or room_id in seen_ids:
            continue

        raw_text = ""
        for key in text_keys:
            value = row.get(key)
            if isinstance(value, str) and value.strip():
                raw_text = value
                break

        if not raw_text:
            continue

        normalized.append({"id": room_id, "raw_text": raw_text})
        seen_ids.add(room_id)

    return normalized


def merge_summary_full_rows(
    summary_rows: list[dict[str, str]],
    full_rows: list[dict[str, str]],
) -> list[dict[str, str]]:
    by_id: dict[str, dict[str, str]] = {}
    order: list[str] = []

    # Keep summary order/values as primary source.
    for row in summary_rows:
        room_id = row["id"]
        if room_id not in by_id:
            order.append(room_id)
        by_id[room_id] = row

    # Fill missing IDs from full.
    for row in full_rows:
        room_id = row["id"]
        if room_id in by_id:
            continue
        by_id[room_id] = row
        order.append(room_id)

    return [by_id[room_id] for room_id in order]


def dedupe_by_id(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    order: list[str] = []

    for item in items:
        room_id = str(item.get("id", "")).strip()
        if not room_id:
            continue

        if room_id not in by_id:
            order.append(room_id)

        normalized_item = dict(item)
        normalized_item["id"] = room_id
        by_id[room_id] = normalized_item

    return [by_id[room_id] for room_id in order]


def estimate_output_tokens(batch: list[dict[str, str]]) -> int:
    # Rough estimate: 1 token ~= 4 characters for JSON text.
    estimated_chars = 2  # [] wrapper
    for item in batch:
        estimated_chars += len(item["id"]) + len(item["raw_text"]) + 32
    return max(1, estimated_chars // 4)


def filter_district_files(file_names: list[str], districts: list[str]) -> list[str]:
    if not districts:
        return file_names

    wanted = {name.lower().replace(".json", "") for name in districts}
    return [name for name in file_names if name.lower().replace(".json", "") in wanted]


def process_one_district(
    district_file: str,
    summary_dir: str | None,
    full_dir: str | None,
    ok_path: str,
    batch_size: int,
    sleep_seconds: float,
    max_retries: int,
) -> tuple[int, int]:
    summary_path = os.path.join(summary_dir, district_file) if summary_dir else None
    full_path = os.path.join(full_dir, district_file) if full_dir else None

    summary_rows = (
        normalize_input_rows(load_json_array(summary_path))
        if summary_path and os.path.isfile(summary_path)
        else []
    )
    full_rows = (
        normalize_input_rows(load_json_array(full_path))
        if full_path and os.path.isfile(full_path)
        else []
    )
    input_rows = merge_summary_full_rows(summary_rows, full_rows)
    total_input = len(input_rows)

    if total_input == 0:
        save_json_array(ok_path, [])
        return 0, 0

    print(
        f"Processing {district_file}: {total_input} rooms "
        f"(summary={len(summary_rows)}, full={len(full_rows)})."
    )

    rebuilt: list[dict[str, Any]] = []
    i = 0
    current_batch_size = min(batch_size, total_input)
    batch_counter = 0

    while i < total_input:
        end = min(i + current_batch_size, total_input)
        batch = input_rows[i:end]
        batch_counter += 1
        print(
            f"  Batch {batch_counter}: rows {i + 1}-{end}/{total_input} "
            f"(size={len(batch)})..."
        )

        if not NVIDIA_LOCAL_ONLY:
            estimated_tokens = estimate_output_tokens(batch)
            max_safe_tokens = int(NVIDIA_MAX_TOKENS * 0.9)
            if len(batch) > 1 and estimated_tokens > max_safe_tokens:
                next_size = max(1, len(batch) // 2)
                print(
                    f"  [AI] Estimated output ~{estimated_tokens} tokens exceeds "
                    f"safe limit {max_safe_tokens}. Reduce batch size {len(batch)} -> {next_size}."
                )
                current_batch_size = next_size
                continue

        parsed_batch = process_batch(batch, max_retries=max_retries)
        if parsed_batch is None:
            if len(batch) > 1:
                next_size = max(1, len(batch) // 2)
                print(f"  [AI] Batch failed. Reduce batch size {len(batch)} -> {next_size} and retry.")
                current_batch_size = next_size
                continue

            if NVIDIA_FALLBACK_TO_LOCAL:
                print(f"  [AI] Single item failed (id={batch[0]['id']}). Use local fallback.")
                parsed_batch = [dict(batch[0])]
            else:
                print(f"  [ERROR] Failed to process item id={batch[0]['id']}. Skipping.")
                i = end
                continue

        rebuilt.extend(parsed_batch)
        rebuilt = dedupe_by_id(rebuilt)
        save_json_array(ok_path, rebuilt)
        i = end

        if current_batch_size < batch_size:
            current_batch_size = min(batch_size, current_batch_size * 2)

        if sleep_seconds > 0:
            time.sleep(sleep_seconds)

    return total_input, len(rebuilt)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Rebuild districts_ok from available source folders "
            "(districts_summary / summary / sumary and/or districts_full / full). "
            "This script only reads source inputs and never deletes them."
        )
    )
    parser.add_argument("--summary-dir", help="Path to summary/sumary folder.")
    parser.add_argument("--full-dir", help="Path to full folder.")
    parser.add_argument("--ok-dir", help="Path to districts_ok output.")
    parser.add_argument(
        "--district",
        action="append",
        default=[],
        help="District name to process (can be repeated). Example: --district badinh --district caugiay",
    )
    parser.add_argument("--batch-size", type=int, default=30, help="Items per AI batch. Default: 30.")
    parser.add_argument("--sleep", type=float, default=1.0, help="Sleep seconds between batches. Default: 1.")
    parser.add_argument("--max-retries", type=int, default=5, help="Max retry attempts per batch. Default: 5.")
    args = parser.parse_args()

    if args.batch_size <= 0:
        raise ValueError("--batch-size must be > 0")
    if args.max_retries <= 0:
        raise ValueError("--max-retries must be > 0")

    if not NVIDIA_LOCAL_ONLY and not NVIDIA_TOKENS:
        raise RuntimeError("Missing NVIDIA API key. Set NVIDIA_API_KEY or NVIDIA_API_KEYS.")

    summary_dir, full_dir = resolve_input_dirs(args.summary_dir, args.full_dir)
    source_dir = summary_dir or full_dir
    if source_dir is None:
        raise RuntimeError("Cannot resolve source directory.")

    ok_dir = resolve_ok_dir(args.ok_dir, source_dir)
    os.makedirs(ok_dir, exist_ok=True)

    all_source_files_set: set[str] = set()
    if summary_dir:
        all_source_files_set.update(
            name for name in os.listdir(summary_dir) if name.lower().endswith(".json")
        )
    if full_dir:
        all_source_files_set.update(
            name for name in os.listdir(full_dir) if name.lower().endswith(".json")
        )

    all_source_files = sorted(all_source_files_set)
    selected_files = filter_district_files(all_source_files, args.district)

    if not selected_files:
        print("No district files matched.")
        return

    print(f"Summary dir: {summary_dir or '<none>'}")
    print(f"Full dir   : {full_dir or '<none>'}")
    print(f"Output dir : {ok_dir}")
    mode_text = "rebuild local id+raw_text (no AI call)" if NVIDIA_LOCAL_ONLY else "rebuild via AI"
    print(f"Mode       : {mode_text} (source inputs are read-only)")

    total_input = 0
    total_output = 0
    started_at = time.time()

    for file_name in selected_files:
        ok_path = os.path.join(ok_dir, file_name)

        input_count, output_count = process_one_district(
            district_file=file_name,
            summary_dir=summary_dir,
            full_dir=full_dir,
            ok_path=ok_path,
            batch_size=args.batch_size,
            sleep_seconds=args.sleep,
            max_retries=args.max_retries,
        )
        total_input += input_count
        total_output += output_count
        print(f"Finished {file_name}: input={input_count}, rebuilt_ok={output_count}")

    elapsed = time.time() - started_at
    print(
        f"Done. Districts={len(selected_files)}, total_input={total_input}, "
        f"total_rebuilt_ok={total_output}, elapsed={elapsed:.1f}s"
    )


if __name__ == "__main__":
    main()


import asyncio
import nodriver as uc
import os
import random
import json
import time
from urllib.parse import quote

def encode_auth(auth_str):
    return quote(auth_str)

def generate_random_user():
    user_id = random.randint(7000000000, 7900000000)
    first_names = ["W.", "Alex", "Jordan", "Kim", "Lee", "Minh"]
    last_names = ["Khati", "Smith", "Johnson", "Nguyen", "Tan"]
    usernames = ["kskmwnz", "gamer_pro", "vnguy", "shadow", "rex"]
    
    user = {
        "id": user_id,
        "first_name": random.choice(first_names),
        "last_name": random.choice(last_names),
        "username": random.choice(usernames) + str(random.randint(10, 99)),
        "language_code": "vi",
        "allows_write_to_pm": True,
        "photo_url": f"https://t.me/i/userpic/320/{random.getrandbits(128)}.svg"
    }
    return user

async def launch_quangcao_ads():
    # 1. Randomize User Data
    user = generate_random_user()
    user_json = json.dumps(user)
    
    # 2. Construct realistic auth_data (initData)
    auth_date = int(time.time())
    chat_instance = str(random.randint(1000000000000000000, 9999999999999999999))
    start_param = "7711226652"
    
    # Dummy signature and hash based on user example
    signature = "SuIYXt6ZJziFhlT-8ZFiYgSf89eVaibLQUE-wVXmkuf3yfRjSPta6eJTRDGqPWV5ZdhTxGtIzFIf_NyZkAbGAg"
    hash_val = "58402ab47b476eb95ce5bc99cc8f1d1d5fde9161f215d784b285c5919c249f68"
    
    # Construct tgWebAppData string
    query_str = f"user={quote(user_json)}&chat_instance={chat_instance}&chat_type=private&start_param={start_param}&auth_date={auth_date}&signature={signature}&hash={hash_val}"
    
    # 3. Construct Final URL using Fragment (#) format
    base_url = "https://masothue.site"
    fragment = f"tgWebAppData={quote(query_str)}&tgWebAppVersion=9.1&tgWebAppPlatform=ios&tgWebAppThemeParams={quote(json.dumps({'bg_color':'#000000','text_color':'#ffffff','link_color':'#3e88f7'}))}"
    
    TARGET_URL = f"{base_url}?tgWebAppStartParam={start_param}#{fragment}"

    print(f"🚀 Launching Ads for Random User: {user['username']} (ID: {user['id']})")

    # Browser arguments for stealth and mobile emulation
    browser_args = [
        "--disable-blink-features=AutomationControlled",
        "--start-maximized",
        "--no-sandbox",
        "--disable-infobars",
        # Mobile emulation (to look like a phone)
        "--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "--window-size=375,812", 
        # Attempting to lie about the referer if the SDK checks it (though usually it checks hostname)
    ]

    try:
        # Start browser
        browser = await uc.start(browser_args=browser_args)
        page = await browser.get(TARGET_URL)
        
        # Deep injection to handle domain mismatch if SDK checks hostname
        # Note: This is advanced spoofing
        stealth_js = """
        try {
            const originalHostname = window.location.hostname;
            // Best effort to fool Adsgram SDK
            window._AdsgramMockOrigin = "https://masothue.site"; 
        } catch(e) {}
        """
        await page.evaluate(stealth_js)
        
        print("✅ Page loaded. The origin bypass is best-effort.")
        print("💡 If you still see 'Platform mismatch', you MUST get a valid blockId from Adsgram.")
        
        # Keep browser open
        while True:
            await asyncio.sleep(1)

    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(launch_quangcao_ads())

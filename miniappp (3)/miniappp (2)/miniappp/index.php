<?php
// PHP Ad Page for Gom Xu Đào Vàng - Mini App Style
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">

	
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>Gom Xu Đào Vàng</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --tg-theme-bg-color: #17212b;
            --tg-theme-text-color: #f5f5f5;
            --tg-theme-hint-color: #708499;
            --tg-theme-link-color: #6ab3f3;
            --tg-theme-button-color: #5288c1;
            --tg-theme-button-text-color: #ffffff;
            --tg-theme-secondary-bg-color: #232e3c;
        }

        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--tg-theme-bg-color);
            color: var(--tg-theme-text-color);
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            -webkit-user-select: none;
            user-select: none;
        }

        /* Fake Mini App Header */
        .miniapp-header {
            height: 56px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            background-color: var(--tg-theme-bg-color);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            flex-shrink: 0;
        }

        .header-title {
            font-weight: 600;
            font-size: 17px;
        }

        .header-icons {
            display: flex;
            gap: 20px;
        }

        .close-btn {
            cursor: pointer;
            color: var(--tg-theme-hint-color);
        }

        /* Main Content */
        .content {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            gap: 24px;
        }

        .reward-card {
            background-color: var(--tg-theme-secondary-bg-color);
            border-radius: 20px;
            padding: 32px 24px;
            width: 100%;
            max-width: 340px;
            text-align: center;
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .icon-circle {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #fbc02d, #f9a825);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            box-shadow: 0 0 20px rgba(249, 168, 37, 0.3);
        }

        .icon-circle svg {
            width: 40px;
            height: 40px;
            fill: #fff;
        }

        .reward-title {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 8px;
            color: #fff;
        }

        .reward-desc {
            color: var(--tg-theme-hint-color);
            font-size: 15px;
            line-height: 1.5;
            margin-bottom: 32px;
        }

        /* Action Button */
        .action-button {
            background-color: #fbc02d;
            background: linear-gradient(135deg, #fbc02d 0%, #f9a825 100%);
            color: #17212b !important;
            border: none;
            width: 100%;
            padding: 18px;
            border-radius: 14px;
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
            transition: transform 0.1s, opacity 0.2s;
            box-shadow: 0 4px 15px rgba(249, 168, 37, 0.4);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
        }

        .action-button:active {
            transform: scale(0.97);
            opacity: 0.9;
        }

        #status-msg {
            margin-top: 16px;
            font-size: 14px;
            color: #fbc02d;
            font-weight: 500;
        }

        .hidden {
            display: none !important;
        }
    </style>
</head>
<body>
    <div class="miniapp-header">
        <div class="header-icons">
             <svg class="close-btn" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </div>
        <div class="header-title">Gom Xu Đào Vàng</div>
        <div class="header-icons">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
        </div>
    </div>

    <div class="content">
        <div class="reward-card">
            <div class="icon-circle">
                <svg viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                </svg>
            </div>
            <h1 class="reward-title">Nhận Thưởng</h1>
            <p class="reward-desc">Xem một quảng cáo ngắn để nhận ngay phần thưởng vào tài khoản của bạn!</p>
            
            <button id="rewardActionBtn" class="action-button">
                XEM QUẢNG CÁO
            </button>
            
            <div id="status-msg" class="hidden"></div>
        </div>
    </div>

    <script>
        // --- AGGRESSIVE BYPASS: Fake Telegram WebApp before SDKs load ---
        (function() {
            const urlParams = new URLSearchParams(window.location.search);
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            
            // Telegram usually sends data in the Hash (Fragment)
            const fakedId = urlParams.get('userId') || hashParams.get('userId');
            const fakedAuth = urlParams.get('auth') || hashParams.get('tgWebAppData'); 
            const fakedVersion = hashParams.get('tgWebAppVersion') || '7.0';
            const fakedPlatform = hashParams.get('tgWebAppPlatform') || 'ios';
            
            if (fakedAuth || fakedId) {
                console.log("BYPASS MODE: Creating Fake Telegram WebApp Environment from Hash/URL");
                
                const parseInitData = (str) => {
                    const params = new URLSearchParams(str);
                    const data = {};
                    for (const [key, value] of params.entries()) {
                        try {
                            // Handle double encoding if necessary
                            let val = value;
                            if (val.includes('%')) val = decodeURIComponent(val);
                            data[key] = JSON.parse(val);
                        } catch (e) {
                            data[key] = value;
                        }
                    }
                    return data;
                };

                const initDataUnsafe = parseInitData(fakedAuth || '');
                
                // --- RANDOM USER GENERATION ---
                // If userId is 'random' or not provided, generate a truly random one
                if (!fakedId || fakedId === 'random' || !initDataUnsafe.user) {
                    const randomId = Math.floor(Math.random() * 1000000000) + 7000000000;
                    if (!initDataUnsafe.user) {
                        initDataUnsafe.user = { 
                            id: randomId, 
                            first_name: 'W.', 
                            last_name: 'Khati', 
                            username: 'user' + randomId,
                            language_code: 'vi',
                            allows_write_to_pm: true 
                        };
                    } else {
                        initDataUnsafe.user.id = randomId;
                    }
                }

                if (!initDataUnsafe.auth_date) initDataUnsafe.auth_date = Math.floor(Date.now() / 1000);
                if (!initDataUnsafe.hash) initDataUnsafe.hash = '58402ab47b476eb95ce5bc99cc8f1d1d5fde9161f215d784b285c5919c249f68'; 

                // Many SDKs check window.location.hash for #tgWebAppData=...
                if (!window.location.hash && fakedAuth) {
                    history.replaceState(null, null, document.location.pathname + document.location.search + '#tgWebAppData=' + encodeURIComponent(fakedAuth));
                }

                // --- ORIGIN SPOOFING FOR ADSGRAM ---
                // If Adsgram checks window.location.origin, try to lie to it
                // Note: This is a best-effort bypass.
                try {
                    const originalOrigin = window.location.origin;
                    Object.defineProperty(window, 'AdsgramSpoofOrigin', { value: "https://masothue.site" });
                    // Some SDKs might use document.domain
                    // document.domain = "masothue.site"; // This usually throws error on mismatch
                } catch (e) {}

                if (!window.Telegram) window.Telegram = {};
                window.Telegram.WebApp = {
                    initData: fakedAuth || 'query_id=AA...',
                    initDataUnsafe: initDataUnsafe,
                    version: fakedVersion,
                    platform: fakedPlatform,
                    colorScheme: 'dark',
                    themeParams: {
                        bg_color: '#17212b',
                        text_color: '#f5f5f5',
                        hint_color: '#708499',
                        link_color: '#6ab3f3',
                        button_color: '#5288c1',
                        button_text_color: '#ffffff',
                        secondary_bg_color: '#232e3c',
                        header_bg_color: '#17212b',
                        accent_text_color: '#6ab3f3',SectionBgColor: '#17212b',SectionHeaderTextColor: '#6ab3f3',SubtitleTextColor: '#708499',DestructiveTextColor: '#ec3942'
                    },
                    isExpanded: true,
                    viewportHeight: window.innerHeight,
                    viewportStableHeight: window.innerHeight,
                    headerColor: '#17212b',
                    backgroundColor: '#17212b',
                    ready: function() { console.log("Bypass: WebApp Ready (" + fakedPlatform + " v" + fakedVersion + ")"); },
                    expand: function() { console.log("Bypass: WebApp Expanded"); },
                    close: function() { window.close(); },
                    showAlert: function(msg) { alert(msg); },
                    showConfirm: function(msg) { return confirm(msg); },
                    showScanQrPopup: function() {},
                    closeScanQrPopup: function() {},
                    readTextFromClipboard: function() {},
                    requestWriteAccess: function() {},
                    requestContact: function() {},
                    setHeaderColor: function(color) { this.headerColor = color; },
                    setBackgroundColor: function(color) { this.backgroundColor = color; },
                    enableClosingConfirmation: function() {},
                    disableClosingConfirmation: function() {},
                    onEvent: function(name, cb) { console.log("OnEvent:", name); },
                    offEvent: function(name, cb) { console.log("OffEvent:", name); },
                    sendData: function(data) { console.log("SendData:", data); },
                    switchInlineQuery: function() {},
                    openLink: function(url) { window.open(url, '_blank'); },
                    openTelegramLink: function(url) { window.open(url, '_blank'); },
                    openInvoice: function() {},
                    isVersionAtLeast: function(v) { return true; },
                    MainButton: {
                        text: 'OK',
                        color: '#2481cc',
                        textColor: '#ffffff',
                        isVisible: false,
                        isActive: true,
                        show: function() { this.isVisible = true; },
                        hide: function() { this.isVisible = false; },
                        onClick: function() {}
                    },
                    BackButton: {
                        isVisible: false,
                        show: function() { this.isVisible = true; },
                        hide: function() { this.isVisible = false; },
                        onClick: function() {}
                    }
                };

                window.TelegramWebAppBypass = true;
            }
        })();
    </script>

    <script>
        // Only load the real Telegram SDK if NOT in bypass mode
        // This prevents the real SDK from throwing "launch parameters" error
        if (!window.TelegramWebAppBypass) {
            document.write('<script src="https://telegram.org/js/telegram-web-app.js"><\/script>');
        }
    </script>
    
    <!-- Adsgram SDK -->
    <script src="https://sad.adsgram.ai/js/sad.min.js"></script>
    
    <script>
        // Use the faked or real Telegram WebApp
        let tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();

        const AdController = {
            blockId: 'int-22875',
            userId: null,
            initData: null,
            isFaked: false,
            
            init() {
                const urlParams = new URLSearchParams(window.location.search);
                this.userId = urlParams.get('userId') || (tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : null);
                this.initData = urlParams.get('auth') || tg.initData;
                this.isFaked = !!urlParams.get('auth');

                console.log("Initialized AdController with User ID:", this.userId);

                if (window.Adsgram) {
                    this.ad = window.Adsgram.init({
                        blockId: this.blockId,
                        debug: true,
                        onReward: () => this.handleReward(),
                        onError: (err) => this.handleError(err)
                    });
                }
            },

            show() {
                const status = document.getElementById('status-msg');
                status.classList.remove('hidden');
                status.innerText = "Đang tải quảng cáo...";
                
                if (this.ad) {
                    this.ad.show().then(() => {
                        status.innerText = "Xem xong! Đang xử lý quà...";
                    }).catch((err) => {
                        console.error("Adsgram Show Error:", err);
                        if (err.status === 'dismiss') {
                            status.innerText = "Bạn đã bỏ qua quảng cáo.";
                        } else {
                            status.innerText = "Lỗi tải quảng cáo: " + (err.description || "");
                        }
                    });
                } else {
                    status.innerText = "Vui lòng tải lại trang.";
                }
            },

            async handleReward() {
                const status = document.getElementById('status-msg');
                status.innerText = "Đang cộng xu...";
                
                console.log("Rewarding user:", this.userId, "Faked:", this.isFaked);
                
                // If faked, we might need a special endpoint or a different way to reward
                // For now, let's try calling a reward bypass if isFaked is true
                // You may need to create this endpoint or modify server.js
                const endpoint = this.isFaked ? '/api/task/claim-bypass' : '/api/task/claim';
                const headers = { 'Content-Type': 'application/json' };
                if (this.initData) headers['Authorization'] = 'Bearer ' + this.initData;

                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ 
                            taskId: 'daily_ad_gold', 
                            teleId: this.userId  // Sending teleId directly for faked mode
                        })
                    });
                    
                    const data = await response.json();
                    if (data.success) {
                        status.innerText = "Nhận thưởng thành công!";
                        if (tg) tg.showAlert("Chúc mừng! +20.000 Xu đã được cộng.");
                        else alert("Chúc mừng! +20.000 Xu đã được cộng vào ID: " + this.userId);
                    } else {
                        status.innerText = "Lỗi: " + (data.message || data.error || "Không thể cộng xu");
                    }
                } catch (e) {
                    console.error("Reward fetch error:", e);
                    status.innerText = "Lỗi kết nối máy chủ.";
                }
            },

            handleError(err) {
                console.error("Adsgram Error Object:", err);
                document.getElementById('status-msg').innerText = "Lỗi: " + (err.description || "Không xác định");
            }
        };

        document.addEventListener('DOMContentLoaded', () => {
            AdController.init();
            document.getElementById('rewardActionBtn').onclick = () => AdController.show();
        });
    </script>
</body>
</html>

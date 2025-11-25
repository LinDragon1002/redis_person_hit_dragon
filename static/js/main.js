let winRateChart = null;
let soundEnabled = true;
let currentPlayerName = localStorage.getItem("playerName") || "";

// ========== 玩家名稱處理邏輯 ==========

// 玩家名稱初始化
function initPlayerName() {
    const modal = document.getElementById('playerNameModal');
    const input = document.getElementById('playerNameInput');
    const confirmBtn = document.getElementById('confirmPlayerName');
    const rememberCheckbox = document.getElementById('rememberName');
    
    // 檢查是否需要記住名字
    const shouldRemember = localStorage.getItem('rememberPlayerName') !== 'false';
    
    // 如果已經有玩家名稱且選擇記住，直接關閉模態框
    if (currentPlayerName && shouldRemember) {
        modal.style.display = 'none';
        updatePlayerNameDisplay();
    } else {
        modal.style.display = 'flex';
        // 如果有保存的名字，預填
        if (currentPlayerName) {
            input.value = currentPlayerName;
        }
    }
    
    input.addEventListener('keydown', (e) => { // 改用 keydown 反應較快
        if (e.key === 'Enter') {
            e.preventDefault(); // 防止可能的表單預設提交導致刷新
            confirmBtn.click(); // 觸發確認按鈕的點擊事件
        }
    });
    
    // 確認按鈕點擊事件
    confirmBtn.addEventListener('click', () => {
        const name = input.value.trim();
        if (name) {
            currentPlayerName = name;
            
            // 根據複選框決定是否保存
            if (rememberCheckbox.checked) {
                localStorage.setItem('playerName', name);
                localStorage.setItem('rememberPlayerName', 'true');
            } else {
                // 不記住，但本次會話中仍然有效
                localStorage.removeItem('playerName');
                localStorage.setItem('rememberPlayerName', 'false');
            }
            
            modal.style.display = 'none';
            updatePlayerNameDisplay();
            
            showRealtimeNotification({
                type: 'success',
                title: '歡迎',
                message: `${name}，準備開始戰鬥吧！`,
                duration: 3000
            });
        } else {
            showRealtimeNotification({
                type: 'warning',
                title: '請輸入名稱',
                message: '玩家名稱不能為空',
                duration: 2000
            });
        }
    });
    
    // Enter 鍵提交
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            confirmBtn.click();
        }
    });
}

// 更新頁面上的玩家名稱顯示
function updatePlayerNameDisplay() {
    const navbar = document.querySelector('.navbar-content');
    let playerDisplay = document.getElementById('currentPlayerDisplay');
    
    if (!playerDisplay) {
        playerDisplay = document.createElement('div');
        playerDisplay.id = 'currentPlayerDisplay';
        playerDisplay.style.cssText = 'color: var(--neon-cyan); font-size: 14px; margin-left: 20px; display: flex; align-items: center; gap: 8px;';
        navbar.querySelector('.navbar-left').appendChild(playerDisplay);
    }
    
    playerDisplay.innerHTML = `
        <i class="fas fa-user-circle"></i>
        <span>玩家：${currentPlayerName}</span>
        <button onclick="changePlayerName()" style="background: none; border: 1px solid var(--neon-cyan); color: var(--neon-cyan); padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">
            <i class="fas fa-edit"></i> 更改
        </button>
    `;
}

// 更改玩家名稱
function changePlayerName() {
    const modal = document.getElementById('playerNameModal');
    const input = document.getElementById('playerNameInput');
    modal.style.display = 'flex';
    input.value = currentPlayerName;
    input.focus();
}

// ========== WebSocket 實時更新系統 ==========

let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// 初始化 WebSocket 連接
function initWebSocket() {
    try {
        // 連接到 Socket.IO 服務器
        socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: MAX_RECONNECT_ATTEMPTS
        });

        // 連接成功
        socket.on('connect', () => {
            console.log('WebSocket 已連接');
            reconnectAttempts = 0;
            updateConnectionStatus(true);
            
            // 顯示連接成功通知
            showRealtimeNotification({
                type: 'success',
                title: '即時連接已建立',
                message: '現在可以即時接收戰鬥更新',
                duration: 3000
            });
            
            // 請求初始數據
            socket.emit('request_initial_data');
        });

        // 連接失敗
        socket.on('connect_error', (error) => {
            console.error('WebSocket 連接錯誤:', error);
            reconnectAttempts++;
            updateConnectionStatus(false);
            
            // 如果超過最大重連次數，回退到輪詢模式
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                console.warn('WebSocket 重連失敗，啟用輪詢模式');
                enablePollingMode();
            }
        });

        // 斷開連接
        socket.on('disconnect', (reason) => {
            console.warn('WebSocket 已斷開:', reason);
            updateConnectionStatus(false);
        });

        // 接收遊戲更新通知
        socket.on('game_update', (data) => {
            console.log('收到遊戲更新:', data);
            console.log('遊戲數據詳情:', {
                game_id: data.game_id,
                winner: data.winner,
                player: data.player_name,
                hasStats: !!(data.dragon_stats && data.person_stats)
            });
            handleGameUpdate(data);
        });

        // 接收數據更新通知
        socket.on('data_update', (data) => {
            console.log('收到數據更新:', data);
            // 可以在這裡處理其他類型的數據更新
        });

        // 連接響應
        socket.on('connection_response', (data) => {
            console.log('服務器響應:', data);
        });

    } catch (error) {
        console.error('初始化 WebSocket 失敗:', error);
        enablePollingMode();
    }
}

// 處理遊戲更新
function handleGameUpdate(data) {
    console.log('收到遊戲更新:', data);
    
    // 顯示網頁即時通知
    showRealtimeNotification({
        type: 'success',
        title: '新戰鬥結束',
        message: `玩家 ${data.player_name || '未知'} - ${data.winner} 獲勝！回合數: ${data.total_rounds}`,
        duration: 5000
    });
    
    // 構建完整的遊戲對象（匹配 API 返回的格式）
    const gameData = {
        game_id: data.game_id,
        timestamp: data.timestamp,
        total_rounds: data.total_rounds,
        winner: data.winner,
        player_name: data.player_name || '匿名玩家',
        dragon_stats: data.dragon_stats || {},
        person_stats: data.person_stats || {}
    };
    
    // 直接插入新戰鬥到列表頂部（這樣所有窗口都能看到）
    insertNewGameToList(gameData);
    
    // 更新統計數據
    console.log('開始更新統計數據...');
    Promise.all([
        loadStats(),
        loadCharacterStats()
    ]).then(() => {
        console.log('統計數據更新完成');
    }).catch(err => {
        console.error('統計數據更新失敗:', err);
    });
    
    // 播放通知音效（如果啟用）
    if (soundEnabled) {
        playNotificationSound();
    }
}

// 顯示網頁即時通知
function showRealtimeNotification({ type = 'info', title, message, duration = 3000 }) {
    const container = document.getElementById('realtimeNotifications');
    if (!container) return;
    
    // 創建通知元素
    const notification = document.createElement('div');
    notification.className = `notification-item ${type}`;
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // 根據類型選擇圖標
    let icon = '<i class="fas fa-bullhorn"></i>';
    if (type === 'success') icon = '<i class="fas fa-check-circle"></i>';
    else if (type === 'warning') icon = '<i class="fas fa-exclamation-triangle"></i>';
    else if (type === 'error') icon = '<i class="fas fa-times-circle"></i>';
    
    notification.innerHTML = `
        <div class="notification-header">
            <div class="notification-title">
                <span class="notification-icon">${icon}</span>
                ${title}
            </div>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="notification-body">${message}</div>
        <div class="notification-time">${timeStr}</div>
    `;
    
    // 添加到容器
    container.insertBefore(notification, container.firstChild);
    
    // 自動移除
    if (duration > 0) {
        setTimeout(() => {
            notification.classList.add('removing');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }
    
    // 限制通知數量（最多 5 個）
    const notifications = container.querySelectorAll('.notification-item');
    if (notifications.length > 5) {
        notifications[notifications.length - 1].remove();
    }
}

// 更新連接狀態指示器
function updateConnectionStatus(isConnected) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    
    if (statusDot && statusText) {
        if (isConnected) {
            statusDot.className = 'status-dot online';
            statusText.textContent = '系統運行中';
        } else {
            statusDot.className = 'status-dot offline';
            statusText.textContent = '連接中斷';
        }
    }
}

// 啟用輪詢模式（作為備用方案）
function enablePollingMode() {
    console.log('啟用輪詢模式作為備用方案');
    
    // 每 10 秒輪詢一次（比之前的 5 秒更保守）
    setInterval(() => {
        console.log('輪詢模式：更新數據');
        loadStats();
        loadCharacterStats();
        loadRecentGames();
    }, 10000);
}

// 播放通知音效
function playNotificationSound() {
    // 創建簡單的提示音
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}



// 粒子系統
class ParticleSystem {
    constructor() {
        this.canvas = document.getElementById('particleCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.createParticles();
        this.animate();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createParticles() {
        const count = 50;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 2 + 1,
                color: Math.random() > 0.5 ? 'rgba(0, 255, 255, 0.5)' : 'rgba(255, 0, 255, 0.5)'
            });
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.fill();
        });

        // 繪製連線
        this.particles.forEach((p1, i) => {
            this.particles.slice(i + 1).forEach(p2 => {
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 150) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.strokeStyle = `rgba(0, 255, 255, ${0.2 * (1 - dist / 150)})`;
                    this.ctx.lineWidth = 0.5;
                    this.ctx.stroke();
                }
            });
        });

        requestAnimationFrame(() => this.animate());
    }
}

// 數字計數動畫
function animateCounter(element, target, duration = 1000) {
    const start = parseInt(element.textContent) || 0;
    const increment = (target - start) / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= target) || (increment < 0 && current <= target)) {
            element.textContent = Math.round(target);
            clearInterval(timer);
        } else {
            element.textContent = Math.round(current);
        }
    }, 16);
}

// 載入統計資料
async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        
        // 直接更新數值，不使用動畫（確保即時性）
        document.getElementById('totalGames').textContent = data.total_games;
        document.getElementById('avgRounds').textContent = data.avg_rounds;
        document.getElementById('draws').textContent = data.draws;
        
        document.getElementById('dragonWinRate').textContent = data.dragon_win_rate + '%';
        document.getElementById('personWinRate').textContent = data.person_win_rate + '%';
        document.getElementById('centerTotal').textContent = data.total_games;

        // 更新勝場
        document.getElementById('dragonWins').textContent = data.dragon_wins;
        document.getElementById('personWins').textContent = data.person_wins;

        // 繪製圖表
        drawWinRateChart(data);
        
        // 檢查成就
        checkAchievements(data);
    } catch (error) {
        console.error('載入統計資料失敗:', error);
    }
}

// 載入角色統計
async function loadCharacterStats() {
    try {
        const response = await fetch('/api/character_stats');
        const data = await response.json();
        
        if (data.error) {
            console.error(data.error);
            return;
        }

        // 更新龍王數據 (包含 AVG)
        document.getElementById('dragonTotalDamage').textContent = data.dragon.total_damage;
        document.getElementById('dragonAvgDamage').textContent = data.dragon.avg_damage; // 新增
        
        document.getElementById('dragonTotalHealing').textContent = data.dragon.total_healing;
        document.getElementById('dragonAvgHealing').textContent = data.dragon.avg_healing; // 新增
        
        document.getElementById('dragonTotalCrits').textContent = data.dragon.total_crits;
        
        // 更新勇者數據 (包含 AVG)
        document.getElementById('personTotalDamage').textContent = data.person.total_damage;
        document.getElementById('personAvgDamage').textContent = data.person.avg_damage; // 新增
        
        document.getElementById('personTotalHealing').textContent = data.person.total_healing;
        document.getElementById('personAvgHealing').textContent = data.person.avg_healing; // 新增
        
        document.getElementById('personTotalCrits').textContent = data.person.total_crits;
        
        // 更新進度條 (這部分邏輯不變，依然以總量為基準)
        updateProgressBars(data);
    } catch (error) {
        console.error('載入角色統計失敗:', error);
    }
}

// 更新進度條
function updateProgressBars(data) {
    const maxDamage = Math.max(data.dragon.total_damage, data.person.total_damage);
    const maxHealing = Math.max(data.dragon.total_healing, data.person.total_healing);
    const maxCrits = Math.max(data.dragon.total_crits, data.person.total_crits);
    
    document.getElementById('dragonDamageBar').style.width = 
        ((data.dragon.total_damage / maxDamage) * 100) + '%';
    document.getElementById('dragonHealBar').style.width = 
        ((data.dragon.total_healing / maxHealing) * 100) + '%';
    document.getElementById('dragonCritBar').style.width = 
        ((data.dragon.total_crits / maxCrits) * 100) + '%';
    
    document.getElementById('personDamageBar').style.width = 
        ((data.person.total_damage / maxDamage) * 100) + '%';
    document.getElementById('personHealBar').style.width = 
        ((data.person.total_healing / maxHealing) * 100) + '%';
    document.getElementById('personCritBar').style.width = 
        ((data.person.total_crits / maxCrits) * 100) + '%';
}

// 檢查並解鎖成就
function checkAchievements(data) {
    // 成就1：首勝
    if (data.total_games >= 1) {
        unlockAchievement('achievement1');
    }
    
    // 成就2：連勝王 (簡化版：只要有一方勝場>=5)
    if (data.dragon_wins >= 5 || data.person_wins >= 5) {
        unlockAchievement('achievement2');
    }
    
    // 成就3：百戰老將
    if (data.total_games >= 100) {
        unlockAchievement('achievement3');
    }
}

function unlockAchievement(id) {
    const badge = document.getElementById(id);
    if (badge && badge.classList.contains('locked')) {
        badge.classList.remove('locked');
        badge.classList.add('unlocked');
        
        // 顯示解鎖通知
        showNotification(`成就解鎖：${badge.querySelector('.badge-name').textContent}`);
    }
}

// 顯示通知
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification-toast';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 30px;
        background: linear-gradient(135deg, #ffd700, #ff8c00);
        color: #000;
        padding: 15px 25px;
        border-radius: 8px;
        font-family: var(--font-tech);
        font-size: 14px;
        box-shadow: 0 0 30px rgba(255, 215, 0, 0.6);
        z-index: 1000;
        animation: slideIn 0.5s ease, slideOut 0.5s ease 2.5s;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// 載入最近遊戲
async function loadRecentGames() {
    try {
        const response = await fetch('/api/recent_games');
        const games = await response.json();
        
        const gamesList = document.getElementById('gamesList');
        
        if (games.length === 0) {
            gamesList.innerHTML = '<div class="loading-tech"><span>尚無戰鬥記錄</span></div>';
            return;
        }
        
        gamesList.innerHTML = games.map(game => createGameItemHTML(game)).join('');
    } catch (error) {
        console.error('載入遊戲記錄失敗:', error);
        document.getElementById('gamesList').innerHTML = 
            '<div class="loading-tech"><span>載入失敗，請確認 Redis 連接</span></div>';
    }
}

// 創建遊戲項目 HTML（提取為共用函數）
function createGameItemHTML(game) {
    const date = new Date(game.timestamp);
    const winnerClass = game.winner === '龍王' ? 'dragon' : 
                        game.winner === '勇者' ? 'person' : 'draw';
    const winnerDisplay = game.winner === '平手' 
        ? '<i class="fas fa-balance-scale"></i> 平手' 
        : `${game.winner} <i class="fas fa-trophy"></i>`;
    
    // 添加玩家名稱顯示
    const playerNameDisplay = game.player_name ? 
        `<div style="color: var(--neon-cyan); font-size: 12px; display: flex; align-items: center; gap: 5px;">
            <i class="fas fa-user-circle"></i> ${game.player_name}
         </div>` : '';
    
    return `
        <div class="game-item-tech winner-${winnerClass} new-game-highlight" data-game-id="${game.game_id}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="font-family: var(--font-tech); font-size: 14px; color: #888;">
                        #${game.game_id}
                    </div>
                    <div style="padding: 4px 12px; background: var(--${winnerClass === 'dragon' ? 'dragon-color' : winnerClass === 'person' ? 'person-color' : 'neon-yellow'}); color: ${winnerClass === 'draw' ? '#000' : '#fff'}; border-radius: 12px; font-size: 12px; font-weight: 700;">
                        ${winnerDisplay}
                    </div>
                    ${playerNameDisplay}
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <button class="replay-btn-tech" data-game-id="${game.game_id}" title="查看戰鬥回放">
                        <i class="fas fa-play-circle"></i> 回放
                    </button>
                    <div style="font-size: 11px; color: #666;">
                        ${date.toLocaleString('zh-TW')}
                    </div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px; font-size: 13px;">
                <div style="text-align: center; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 6px;">
                    <div style="color: #888; font-size: 11px;">回合</div>
                    <div style="color: #fff; font-weight: 700; font-size: 16px;">${game.total_rounds}</div>
                </div>
                <div style="text-align: center; padding: 8px; background: rgba(255,51,102,0.1); border-radius: 6px;">
                    <div style="color: #888; font-size: 11px;">龍王 HP</div>
                    <div style="color: #ff3366; font-weight: 700; font-size: 16px;">${game.dragon_stats.final_hp}</div>
                </div>
                <div style="text-align: center; padding: 8px; background: rgba(0,217,255,0.1); border-radius: 6px;">
                    <div style="color: #888; font-size: 11px;">勇者 HP</div>
                    <div style="color: #00d9ff; font-weight: 700; font-size: 16px;">${game.person_stats.final_hp}</div>
                </div>
                <div style="text-align: center; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 6px;">
                    <div style="color: #888; font-size: 11px;">龍王傷害</div>
                    <div style="color: #fff; font-weight: 700; font-size: 16px;">${game.dragon_stats.total_damage_dealt}</div>
                </div>
                <div style="text-align: center; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 6px;">
                    <div style="color: #888; font-size: 11px;">勇者傷害</div>
                    <div style="color: #fff; font-weight: 700; font-size: 16px;">${game.person_stats.total_damage_dealt}</div>
                </div>
            </div>
        </div>
    `;
}

// 立即插入新遊戲到列表頂部
function insertNewGameToList(game) {
    const gamesList = document.getElementById('gamesList');
    
    // 檢查是否為空列表
    const loadingDiv = gamesList.querySelector('.loading-tech');
    if (loadingDiv) {
        gamesList.innerHTML = '';
    }
    
    // 創建新遊戲元素
    const newGameHTML = createGameItemHTML(game);
    
    // 插入到最上方
    gamesList.insertAdjacentHTML('afterbegin', newGameHTML);
    
    // 添加高亮動畫
    const newGameElement = gamesList.firstElementChild;
    if (newGameElement) {
        // 短暫延遲後移除高亮類，觸發動畫
        setTimeout(() => {
            newGameElement.classList.remove('new-game-highlight');
        }, 100);
        
        // 滾動到頂部以顯示新遊戲
        gamesList.scrollTop = 0;
    }
    
    // 限制顯示數量，移除超過 20 個的舊記錄
    const allGames = gamesList.querySelectorAll('.game-item-tech');
    if (allGames.length > 20) {
        for (let i = 20; i < allGames.length; i++) {
            allGames[i].remove();
        }
    }
}

// 繪製勝率圖表
function drawWinRateChart(data) {
    const ctx = document.getElementById('winRateChart').getContext('2d');
    
    if (winRateChart) {
        winRateChart.destroy();
    }
    
    winRateChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['龍王', '勇者', '平手'],
            datasets: [{
                data: [data.dragon_wins, data.person_wins, data.draws],
                backgroundColor: [
                    '#ff3366',
                    '#00d9ff',
                    '#ffd700'
                ],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#00ffff',
                    bodyColor: '#ffffff',
                    borderColor: '#00ffff',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            let value = context.raw;
                            let total = data.total_games;
                            let percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                            return `${value} 場 (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '75%'
        }
    });
}

// 音效控制
document.getElementById('soundIcon')?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    const icon = document.getElementById('soundIcon');
    icon.className = soundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
    
    showNotification(soundEnabled ? '🔊 音效已開啟' : '🔇 音效已關閉');
});

// 執行單場遊戲
document.getElementById('runGameBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('runGameBtn');
    const status = document.getElementById('gameStatus');
    
    btn.disabled = true;
    status.className = 'game-status-tech running';
    status.innerHTML = '<i class="fas fa-bolt"></i> 戰鬥進行中...';
    
    try {
        const response = await fetch('/api/run_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_name: currentPlayerName })
        });
        const data = await response.json();
        
        if (data.success) {
            const game = data.game;
            status.className = 'game-status-tech success';
            status.innerHTML = `<i class="fas fa-check"></i> 戰鬥 #${game.game_id} 結束！${game.winner} 獲勝`;
            
            // 顯示即時通知
            showRealtimeNotification({
                type: 'success',
                title: '手動戰鬥完成',
                message: `${game.winner} 獲勝！回合數: ${game.total_rounds}`,
                duration: 5000
            });
            
            // 立即將新戰鬥插入到列表最上方
            insertNewGameToList(game);
            
            // 立即更新所有統計數據
            await Promise.all([
                loadStats(),
                loadCharacterStats(),
                loadRecentGames()
            ]);
            
            if (soundEnabled) {
                playNotificationSound();
            }
        } else {
            status.className = 'game-status-tech error';
            status.innerHTML = '<i class="fas fa-times"></i> 戰鬥執行失敗';
        }
    } catch (error) {
        console.error('執行遊戲時發生錯誤:', error);
        status.className = 'game-status-tech error';
        status.innerHTML = '<i class="fas fa-exclamation-circle"></i> 發生錯誤，請檢查連接';
    } finally {
        btn.disabled = false;
        setTimeout(() => {
            status.className = 'game-status-tech';
            status.textContent = '';
        }, 5000);
    }
});

// 自動戰鬥模式 - 單次執行
document.getElementById('autoBattleBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('autoBattleBtn');
    const status = document.getElementById('gameStatus');
    
    btn.disabled = true;
    status.className = 'game-status-tech running';
    status.innerHTML = '<i class="fas fa-robot"></i> 自動戰鬥執行中...';
    
    try {
        const response = await fetch('/api/run_game_auto', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_name: currentPlayerName })
        });
        const data = await response.json();
        
        if (data.success) {
            const game = data.game;
            status.className = 'game-status-tech success';
            status.innerHTML = `<i class="fas fa-check"></i> 自動戰鬥完成！${game.winner} 獲勝`;
            
            // 顯示即時通知
            showRealtimeNotification({
                type: 'success',
                title: '自動戰鬥完成',
                message: `${game.winner} 獲勝！回合數: ${game.total_rounds}`,
                duration: 5000
            });
            
            // 立即插入新戰鬥
            insertNewGameToList(game);
            
            // 立即更新所有統計資料
            await Promise.all([
                loadStats(),
                loadCharacterStats(),
                loadRecentGames()
            ]);
            
            if (soundEnabled) {
                playNotificationSound();
            }
        } else {
            status.className = 'game-status-tech error';
            status.innerHTML = '<i class="fas fa-times"></i> 自動戰鬥失敗';
        }
    } catch (error) {
        console.error('自動戰鬥錯誤:', error);
        status.className = 'game-status-tech error';
       status.innerHTML = '<i class="fas fa-exclamation-circle"></i> 發生錯誤，請檢查連接';
    } finally {
        btn.disabled = false;
        setTimeout(() => {
            status.className = 'game-status-tech';
            status.textContent = '';
        }, 5000);
    }
});

// 篩選按鈕
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const filter = btn.dataset.filter;
        const games = document.querySelectorAll('.game-item-tech');
        
        games.forEach(game => {
            if (filter === 'all') {
                game.style.display = 'block';
            } else {
                game.style.display = game.classList.contains(`winner-${filter}`) ? 'block' : 'none';
            }
        });
    });
});

// 顯示戰鬥回放
async function showGameReplay(gameId) {
    const modal = document.getElementById('replayModal');
    const replayLog = document.getElementById('replayLog');
    
    // 顯示模態框
    modal.style.display = 'flex';
    replayLog.innerHTML = '<div class="loading-tech"><div class="loading-spinner"></div><span>載入回放數據...</span></div>';
    
    try {
        const response = await fetch(`/api/game/${gameId}/replay`);
        const events = await response.json();
        
        if (events.error) {
            replayLog.innerHTML = `<div style="color: var(--dragon-color); text-align: center; padding: 20px;">
                <i class="fas fa-exclamation-triangle"></i> 載入失敗：${events.error}
            </div>`;
            return;
        }
        
        if (events.length === 0) {
            replayLog.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">此戰鬥無回放記錄</div>';
            return;
        }
        
        // 渲染回放內容
        let html = `<div class="replay-header">
            <h4 style="font-family: var(--font-tech); color: var(--neon-cyan); margin-bottom: 20px;">
                <i class="fas fa-gamepad"></i> 戰鬥 #${gameId} 完整回放
            </h4>
        </div>`;
        
        html += '<div class="replay-timeline">';
        
        events.forEach((event, index) => {
            const actorClass = event.actor === '龍王' ? 'dragon' : event.actor === '勇者' ? 'person' : 'system';
            const actorColor = actorClass === 'dragon' ? 'var(--dragon-color)' : 
                              actorClass === 'person' ? 'var(--person-color)' : 
                              'var(--neon-cyan)';
            
            // 判斷動作圖示
            let actionIcon = '<i class="fas fa-bolt"></i>';
            if (event.action?.includes('攻擊')) actionIcon = '<i class="fas fa-bolt"></i>';
            else if (event.action?.includes('治療') || event.action?.includes('恢復')) actionIcon = '<i class="fas fa-heart"></i>';
            else if (event.action?.includes('暴擊')) actionIcon = '<i class="fas fa-bomb"></i>';
            else if (event.action?.includes('回合')) actionIcon = '<i class="fas fa-sync-alt"></i>';
            else if (event.action?.includes('勝利') || event.action?.includes('獲勝')) actionIcon = '<i class="fas fa-trophy"></i>';
            
            html += `
                <div class="replay-event ${actorClass}" style="animation-delay: ${index * 0.05}s;">
                    <div class="event-marker" style="background: ${actorColor};"></div>
                    <div class="event-content">
                        <div class="event-header">
                            <span class="event-turn" style="color: var(--text-muted);">
                                ${event.turn ? `第 ${event.turn} 回合` : '系統訊息'}
                            </span>
                            <span class="event-actor" style="color: ${actorColor}; font-weight: 700;">
                                ${event.actor || '系統'}
                            </span>
                        </div>
                        <div class="event-action">
                            ${actionIcon} ${event.action || ''}
                            ${event.value ? `<span class="event-value">${event.value}</span>` : ''}
                        </div>
                        ${event.details ? `<div class="event-details">${event.details}</div>` : ''}
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        replayLog.innerHTML = html;
        
    } catch (error) {
        console.error('載入回放失敗:', error);
        replayLog.innerHTML = `<div style="color: var(--dragon-color); text-align: center; padding: 20px;">
            <i class="fas fa-exclamation-triangle"></i> 發生錯誤：${error.message}
        </div>`;
    }
}

// 關閉模態框
document.querySelector('.close-btn-tech')?.addEventListener('click', () => {
    document.getElementById('replayModal').style.display = 'none';
});

// 點擊模態框外部關閉
window.addEventListener('click', (event) => {
    const modal = document.getElementById('replayModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始化玩家名稱
    initPlayerName();
    
    // 啟動粒子系統
    new ParticleSystem();
    
    // 使用事件委派處理回放按鈕點擊（支援動態添加的元素）
    document.getElementById('gamesList').addEventListener('click', (e) => {
        const replayBtn = e.target.closest('.replay-btn-tech');
        if (replayBtn) {
            const gameId = replayBtn.getAttribute('data-game-id');
            if (gameId) {
                showGameReplay(parseInt(gameId));
            }
        }
    });
    
    // 載入初始數據
    loadStats();
    loadCharacterStats();
    loadRecentGames();
    
    // ========== WebSocket 實時更新 ==========
    // 移除了 setInterval 輪詢，改用 WebSocket 實時推送
    initWebSocket();
});

// 添加 CSS 動畫
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
    #realtimeNotifications {
        overflow: hidden !important;
        padding-right: 0 !important;
        scrollbar-width: none; /* Firefox */
        -ms-overflow-style: none; /* IE/Edge */
    }
    
    #realtimeNotifications::-webkit-scrollbar {
        display: none; /* Chrome/Safari */
    }
`;
document.head.appendChild(style);


async function loadAllHistory() {
    const container = document.getElementById('fullHistoryList');
    if (!container) return; // 如果不是在歷史頁面就跳過

    try {
        const response = await fetch('/api/all_games');
        const games = await response.json();
        
        if (games.length === 0) {
            container.innerHTML = '<div class="loading-tech"><span>尚無任何戰鬥記錄</span></div>';
            return;
        }

        // 渲染所有卡片
        container.innerHTML = games.map(game => createGameItemHTML(game)).join('');

        // 綁定篩選功能 (因為是在新頁面，需要重新綁定篩選器邏輯)
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const filter = btn.dataset.filter;
                const items = container.querySelectorAll('.game-item-tech');
                
                items.forEach(item => {
                    if (filter === 'all') {
                        item.style.display = 'block';
                    } else {
                        item.style.display = item.classList.contains(`winner-${filter}`) ? 'block' : 'none';
                    }
                });
            });
        });

    } catch (error) {
        console.error('載入完整歷史失敗:', error);
        container.innerHTML = '<div class="loading-tech"><i class="fas fa-exclamation-triangle"></i><span> 載入失敗</span></div>';
    }
}
// ========== WebSocket 實時更新系統 ==========
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

function initWebSocket() {
    try {
        window.GameConfig.socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: MAX_RECONNECT_ATTEMPTS
        });

        const socket = window.GameConfig.socket;

        socket.on('connect', () => {
            console.log('WebSocket 已連接');
            reconnectAttempts = 0;
            updateConnectionStatus(true);
            showRealtimeNotification({ type: 'success', title: '即時連接已建立', message: '現在可以即時接收戰鬥更新', duration: 3000 });
            socket.emit('request_initial_data');
        });

        socket.on('connect_error', (error) => {
            console.error('WebSocket 連接錯誤:', error);
            reconnectAttempts++;
            updateConnectionStatus(false);
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                console.warn('WebSocket 重連失敗，啟用輪詢模式');
                enablePollingMode();
            }
        });

        socket.on('disconnect', (reason) => {
            console.warn('WebSocket 已斷開:', reason);
            updateConnectionStatus(false);
        });

        socket.on('game_update', (data) => {
            handleGameUpdate(data);
        });

    } catch (error) {
        console.error('初始化 WebSocket 失敗:', error);
        enablePollingMode();
    }
}

function handleGameUpdate(data) {
    showRealtimeNotification({
        type: 'success',
        title: '新戰鬥結束',
        message: `玩家 ${data.player_name || '未知'} - ${data.winner} 獲勝！回合數: ${data.total_rounds}`,
        duration: 5000
    });
    
    const gameData = {
        game_id: data.game_id,
        timestamp: data.timestamp,
        total_rounds: data.total_rounds,
        winner: data.winner,
        player_name: data.player_name || '匿名玩家',
        dragon_stats: data.dragon_stats || {},
        person_stats: data.person_stats || {}
    };
    
    insertNewGameToList(gameData);
    
    Promise.all([
        loadStats(),
        loadCharacterStats()
    ]).catch(err => console.error('統計數據更新失敗:', err));
    
    if (window.GameConfig.soundEnabled) playNotificationSound();
}

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

function enablePollingMode() {
    setInterval(() => {
        loadStats();
        loadCharacterStats();
        loadRecentGames();
    }, 10000);
}

// ========== 數據載入函數 ==========
async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        
        const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        
        setTxt('totalGames', data.total_games);
        setTxt('avgRounds', data.avg_rounds);
        setTxt('draws', data.draws);
        setTxt('dragonWinRate', data.dragon_win_rate + '%');
        setTxt('personWinRate', data.person_win_rate + '%');
        setTxt('centerTotal', data.total_games);
        setTxt('dragonWins', data.dragon_wins);
        setTxt('personWins', data.person_wins);

        drawWinRateChart(data);
        checkAchievements(data);
    } catch (error) {
        console.error('載入統計資料失敗:', error);
    }
}

async function loadCharacterStats() {
    try {
        const response = await fetch('/api/character_stats');
        const data = await response.json();
        if (data.error) return;

        const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

        setTxt('dragonTotalDamage', data.dragon.total_damage);
        setTxt('dragonAvgDamage', data.dragon.avg_damage);
        setTxt('dragonTotalHealing', data.dragon.total_healing);
        setTxt('dragonAvgHealing', data.dragon.avg_healing);
        setTxt('dragonTotalCrits', data.dragon.total_crits);
        
        setTxt('personTotalDamage', data.person.total_damage);
        setTxt('personAvgDamage', data.person.avg_damage);
        setTxt('personTotalHealing', data.person.total_healing);
        setTxt('personAvgHealing', data.person.avg_healing);
        setTxt('personTotalCrits', data.person.total_crits);
        
        updateProgressBars(data);
    } catch (error) {
        console.error('載入角色統計失敗:', error);
    }
}

function updateProgressBars(data) {
    const maxDamage = Math.max(data.dragon.total_damage, data.person.total_damage) || 1;
    const maxHealing = Math.max(data.dragon.total_healing, data.person.total_healing) || 1;
    const maxCrits = Math.max(data.dragon.total_crits, data.person.total_crits) || 1;
    
    const setWidth = (id, val) => { const el = document.getElementById(id); if(el) el.style.width = val + '%'; };
    
    setWidth('dragonDamageBar', (data.dragon.total_damage / maxDamage) * 100);
    setWidth('dragonHealBar', (data.dragon.total_healing / maxHealing) * 100);
    setWidth('dragonCritBar', (data.dragon.total_crits / maxCrits) * 100);
    
    setWidth('personDamageBar', (data.person.total_damage / maxDamage) * 100);
    setWidth('personHealBar', (data.person.total_healing / maxHealing) * 100);
    setWidth('personCritBar', (data.person.total_crits / maxCrits) * 100);
}

// ========== 遊戲列表管理 ==========
async function loadRecentGames() {
    try {
        const response = await fetch('/api/recent_games');
        const games = await response.json();
        const gamesList = document.getElementById('gamesList');
        if (!gamesList) return;
        
        if (games.length === 0) {
            gamesList.innerHTML = '<div class="loading-tech"><span>尚無戰鬥記錄</span></div>';
            return;
        }
        gamesList.innerHTML = games.map(game => createGameItemHTML(game)).join('');
    } catch (error) {
        console.error('載入遊戲記錄失敗:', error);
    }
}

async function loadAllHistory() {
    const container = document.getElementById('fullHistoryList');
    if (!container) return; 

    try {
        const response = await fetch('/api/all_games');
        const games = await response.json();
        
        if (games.length === 0) {
            container.innerHTML = '<div class="loading-tech"><span>尚無任何戰鬥記錄</span></div>';
            return;
        }
        container.innerHTML = games.map(game => createGameItemHTML(game)).join('');
        setupFilterButtons(container); // 重綁篩選事件
    } catch (error) {
        console.error('載入完整歷史失敗:', error);
        container.innerHTML = '<div class="loading-tech"><i class="fas fa-exclamation-triangle"></i><span> 載入失敗</span></div>';
    }
}

function insertNewGameToList(game) {
    const gamesList = document.getElementById('gamesList');
    if (!gamesList) return;
    
    const loadingDiv = gamesList.querySelector('.loading-tech');
    if (loadingDiv) gamesList.innerHTML = '';
    
    const newGameHTML = createGameItemHTML(game);
    gamesList.insertAdjacentHTML('afterbegin', newGameHTML);
    
    const newGameElement = gamesList.firstElementChild;
    if (newGameElement) {
        setTimeout(() => newGameElement.classList.remove('new-game-highlight'), 100);
        gamesList.scrollTop = 0;
    }
    
    const allGames = gamesList.querySelectorAll('.game-item-tech');
    if (allGames.length > 20) {
        for (let i = 20; i < allGames.length; i++) allGames[i].remove();
    }
}

// ========== 圖表與成就 ==========
function drawWinRateChart(data) {
    const ctx = document.getElementById('winRateChart')?.getContext('2d');
    if (!ctx) return;
    
    if (window.GameConfig.winRateChart) {
        window.GameConfig.winRateChart.destroy();
    }
    
    window.GameConfig.winRateChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['龍王', '勇者', '平手'],
            datasets: [{
                data: [data.dragon_wins, data.person_wins, data.draws],
                backgroundColor: ['#ff3366', '#00d9ff', '#ffd700'],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
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

function checkAchievements(data) {
    if (data.total_games >= 1) unlockAchievement('achievement1');
    if (data.dragon_wins >= 5 || data.person_wins >= 5) unlockAchievement('achievement2');
    if (data.total_games >= 100) unlockAchievement('achievement3');
}

function unlockAchievement(id) {
    const badge = document.getElementById(id);
    if (badge && badge.classList.contains('locked')) {
        badge.classList.remove('locked');
        badge.classList.add('unlocked');
        showNotification(`成就解鎖：${badge.querySelector('.badge-name').textContent}`);
    }
}
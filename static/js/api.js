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
            // console.log('[WebSocket] 已連接');
            reconnectAttempts = 0;
            updateConnectionStatus(true);
            showRealtimeNotification({ 
                type: 'success', 
                title: '即時連接已建立', 
                message: '現在可以即時接收戰鬥更新', 
                duration: 3000 
            });
            socket.emit('request_initial_data');
        });

        socket.on('connect_error', (error) => {
            // console.error('[WebSocket] 連接錯誤:', error);
            reconnectAttempts++;
            updateConnectionStatus(false);
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                // console.warn('[WebSocket] 重連失敗，啟用輪詢模式');
                enablePollingMode();
            }
        });

        socket.on('disconnect', (reason) => {
            // console.warn('[WebSocket] 已斷開:', reason);
            updateConnectionStatus(false);
        });

        // ★★★ 監聽遊戲更新事件 ★★★
        socket.on('game_update', (data) => {
            // console.log('[WebSocket] 收到 game_update:', data);
            handleGameUpdate(data);
        });

        // 監聯遊戲結束事件
        socket.on('game_over', (data) => {
            // console.log('[WebSocket] 收到 game_over:', data);
            const battleStatus = document.getElementById('battleStatus');
            if (battleStatus) {
                battleStatus.innerHTML = `<span style="color: gold;">${data.winner} 獲勝！</span>`;
            }
        });

    } catch (error) {
        // console.error('[WebSocket] 初始化失敗:', error);
        enablePollingMode();
    }
}

// ★★★ 處理遊戲更新 ★★★
function handleGameUpdate(data) {
    // console.log('[handleGameUpdate] 處理數據:', data);
    
    // 顯示通知
    showRealtimeNotification({
        type: 'success',
        title: '新戰鬥結束',
        message: `玩家 ${data.player_name || '未知'} - ${data.winner} 獲勝！回合數: ${data.total_rounds}`,
        duration: 5000
    });
    
    // 準備遊戲數據格式
    const gameData = {
        game_id: data.game_id,
        timestamp: data.timestamp || new Date().toISOString(),
        total_rounds: data.total_rounds,
        winner: data.winner,
        player_name: data.player_name || '匿名玩家',
        dragon_stats: data.dragon_stats || {},
        person_stats: data.person_stats || {}
    };
    
    // 插入新遊戲到列表
    insertNewGameToList(gameData);
    
    // ★★★ 重新載入所有統計數據 ★★★
    // console.log('[handleGameUpdate] 重新載入統計數據...');
    Promise.all([
        loadStats(),
        loadCharacterStats(),
        loadRecentGames()
    ]).then(() => {
        console.log('[handleGameUpdate] 統計數據更新完成');
    }).catch(err => {
        console.error('[handleGameUpdate] 統計數據更新失敗:', err);
    });
    
    // 播放音效
    if (window.GameConfig.soundEnabled) {
        playNotificationSound();
    }
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
    // console.log('[Polling] 啟用輪詢模式，每 10 秒更新一次');
    setInterval(() => {
        loadStats();
        loadCharacterStats();
        loadRecentGames();
    }, 10000);
}

// ========== 數據載入函數 ==========
async function loadStats() {
    try {
        // console.log('[loadStats] 載入統計數據...');
        const response = await fetch('/api/stats');
        if (!response.ok) throw new Error('API 回應錯誤: ' + response.status);
        const data = await response.json();
        
        // console.log('[loadStats] 收到數據:', data);
        
        const setTxt = (id, val) => { 
            const el = document.getElementById(id); 
            if(el) {
                el.textContent = val;
                // 添加更新動畫
                el.classList.add('data-updated');
                setTimeout(() => el.classList.remove('data-updated'), 500);
            }
        };
        
        setTxt('totalGames', data.total_games || 0);
        setTxt('avgRounds', data.avg_rounds || 0);
        setTxt('dragonWinRate', (data.dragon_win_rate || 0) + '%');
        setTxt('personWinRate', (data.person_win_rate || 0) + '%');
        setTxt('centerTotal', data.total_games || 0);
        setTxt('dragonWins', data.dragon_wins || 0);
        setTxt('personWins', data.person_wins || 0);

        drawWinRateChart(data);
        checkAchievements(data);
        
        // console.log('[loadStats] 統計數據載入完成');
    } catch (error) {
        console.error('[loadStats] 載入失敗:', error);
    }
}

async function loadCharacterStats() {
    try {
        // console.log('[loadCharacterStats] 載入角色統計...');
        const response = await fetch('/api/character_stats');
        if (!response.ok) throw new Error('API 回應錯誤: ' + response.status);
        const data = await response.json();
        
        if (data.error) {
            // console.warn('[loadCharacterStats] API 錯誤:', data.error);
            return;
        }

        // console.log('[loadCharacterStats] 收到數據:', data);

        const setTxt = (id, val) => { 
            const el = document.getElementById(id); 
            if(el) {
                el.textContent = val;
                el.classList.add('data-updated');
                setTimeout(() => el.classList.remove('data-updated'), 500);
            }
        };

        // 龍王數據
        setTxt('dragonTotalDamage', data.dragon?.total_damage || 0);
        setTxt('dragonAvgDamage', data.dragon?.avg_damage || 0);
        setTxt('dragonTotalHealing', data.dragon?.total_healing || 0);
        setTxt('dragonAvgHealing', data.dragon?.avg_healing || 0);
        setTxt('dragonTotalCrits', data.dragon?.total_crits || 0);
        
        // 勇者數據
        setTxt('personTotalDamage', data.person?.total_damage || 0);
        setTxt('personAvgDamage', data.person?.avg_damage || 0);
        setTxt('personTotalHealing', data.person?.total_healing || 0);
        setTxt('personAvgHealing', data.person?.avg_healing || 0);
        setTxt('personTotalCrits', data.person?.total_crits || 0);
        
        updateProgressBars(data);
        
        // ★★★ 檢查成就 ★★★
        // 暴擊成就
        const totalCrits = (data.dragon?.total_crits || 0) + (data.person?.total_crits || 0);
        checkCritAchievement(totalCrits);
        
        // 治療成就
        const totalHealing = (data.dragon?.total_healing || 0) + (data.person?.total_healing || 0);
        if (typeof checkHealingAchievements === 'function') {
            checkHealingAchievements(totalHealing);
        }
        
        // console.log('[loadCharacterStats] 角色統計載入完成');
    } catch (error) {
        console.error('[loadCharacterStats] 載入失敗:', error);
    }
}

function updateProgressBars(data) {
    if (!data.dragon || !data.person) return;
    
    const maxDamage = Math.max(data.dragon.total_damage || 1, data.person.total_damage || 1);
    const maxHealing = Math.max(data.dragon.total_healing || 1, data.person.total_healing || 1);
    const maxCrits = Math.max(data.dragon.total_crits || 1, data.person.total_crits || 1);
    
    const setWidth = (id, val) => { 
        const el = document.getElementById(id); 
        if(el) el.style.width = Math.min(val, 100) + '%'; 
    };
    
    setWidth('dragonDamageBar', ((data.dragon.total_damage || 0) / maxDamage) * 100);
    setWidth('dragonHealBar', ((data.dragon.total_healing || 0) / maxHealing) * 100);
    setWidth('dragonCritBar', ((data.dragon.total_crits || 0) / maxCrits) * 100);
    
    setWidth('personDamageBar', ((data.person.total_damage || 0) / maxDamage) * 100);
    setWidth('personHealBar', ((data.person.total_healing || 0) / maxHealing) * 100);
    setWidth('personCritBar', ((data.person.total_crits || 0) / maxCrits) * 100);
}

// ========== 遊戲列表管理 ==========
async function loadRecentGames() {
    try {
        // console.log('[loadRecentGames] 載入遊戲記錄...');
        const response = await fetch('/api/recent_games');
        if (!response.ok) throw new Error('API 回應錯誤: ' + response.status);
        const games = await response.json();
        const gamesList = document.getElementById('gamesList');
        if (!gamesList) return;
        
        if (!games || games.length === 0) {
            gamesList.innerHTML = '<div class="loading-tech"><span>尚無戰鬥記錄，點擊「啟動決鬥」開始！</span></div>';
            return;
        }
        
        gamesList.innerHTML = games.map(game => createGameItemHTML(game)).join('');
        // console.log('[loadRecentGames] 載入完成:', games.length, '筆');
    } catch (error) {
        // console.error('[loadRecentGames] 載入失敗:', error);
        const gamesList = document.getElementById('gamesList');
        if (gamesList) {
            gamesList.innerHTML = '<div class="loading-tech"><span>載入失敗，請檢查伺服器連接</span></div>';
        }
    }
}

async function loadAllHistory() {
    const container = document.getElementById('fullHistoryList');
    if (!container) return; 

    try {
        const response = await fetch('/api/all_games');
        if (!response.ok) throw new Error('API 回應錯誤');
        const games = await response.json();
        
        if (!games || games.length === 0) {
            container.innerHTML = '<div class="loading-tech"><span>尚無任何戰鬥記錄</span></div>';
            return;
        }
        container.innerHTML = games.map(game => createGameItemHTML(game)).join('');
        setupFilterButtons(container);
    } catch (error) {
        // console.error('[loadAllHistory] 載入失敗:', error);
        container.innerHTML = '<div class="loading-tech"><i class="fas fa-exclamation-triangle"></i><span> 載入失敗</span></div>';
    }
}

function insertNewGameToList(game) {
    const gamesList = document.getElementById('gamesList');
    if (!gamesList) return;
    
    // 移除「尚無記錄」提示
    const loadingDiv = gamesList.querySelector('.loading-tech');
    if (loadingDiv) gamesList.innerHTML = '';
    
    // 插入新遊戲到最前面
    const newGameHTML = createGameItemHTML(game);
    gamesList.insertAdjacentHTML('afterbegin', newGameHTML);
    
    // 高亮動畫
    const newGameElement = gamesList.firstElementChild;
    if (newGameElement) {
        newGameElement.classList.add('new-game-highlight');
        setTimeout(() => newGameElement.classList.remove('new-game-highlight'), 3000);
        gamesList.scrollTop = 0;
    }
    
    // 限制最多顯示 20 筆
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
    
    const dragonWins = data.dragon_wins || 0;
    const personWins = data.person_wins || 0;
    const draws = data.draws || 0;
    
    // 如果都是 0，顯示空白圖表
    if (dragonWins === 0 && personWins === 0 && draws === 0) {
        window.GameConfig.winRateChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['尚無數據'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['#333'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                cutout: '75%'
            }
        });
        return;
    }
    
    window.GameConfig.winRateChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['龍王', '勇者', '平手'],
            datasets: [{
                data: [dragonWins, personWins, draws],
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
                            let total = data.total_games || 1;
                            let percentage = Math.round((value / total) * 100);
                            return `${value} 場 (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '75%'
        }
    });
}

// ★★★ 成就系統 ★★★
function checkAchievements(data) {
    // console.log('[checkAchievements] 檢查成就，數據:', data);
    
    // 成就 1: 首勝 - 完成第一場戰鬥
    if ((data.total_games || 0) >= 1) {
        unlockAchievement('achievement1');
    }
    
    // 成就 2: 連勝王 - 任一方獲勝 5 場
    if ((data.dragon_wins || 0) >= 5 || (data.person_wins || 0) >= 5) {
        unlockAchievement('achievement2');
    }
    
    // 成就 3: 百戰老將 - 完成 100 場戰鬥
    if ((data.total_games || 0) >= 100) {
        unlockAchievement('achievement3');
    }
    
    // 成就 6: 千場傳說 - 完成 1000 場戰鬥
    if ((data.total_games || 0) >= 1000) {
        unlockAchievement('achievement6');
    }
    
    // 成就 4: 暴擊大師 - 這需要從角色統計獲取
    // 成就 5: 療癒之手 - 這需要從角色統計獲取
    // 成就 11: 暴擊狂魔 - 這需要從角色統計獲取
    // 成就 12: 治療大師 - 這需要從角色統計獲取
    // 會在 loadCharacterStats 中處理
}

function unlockAchievement(id) {
    const badge = document.getElementById(id);
    if (!badge) {
        // console.warn('[unlockAchievement] 找不到成就元素:', id);
        return;
    }
    
    if (badge.classList.contains('locked')) {
        // console.log('[unlockAchievement] 解鎖成就:', id);
        badge.classList.remove('locked');
        badge.classList.add('unlocked');
        
        // 顯示解鎖通知
        const badgeName = badge.querySelector('.badge-name');
        if (badgeName) {
            showNotification(`成就解鎖：${badgeName.textContent}`);
            showRealtimeNotification({
                type: 'success',
                title: '成就解鎖！',
                message: badgeName.textContent,
                duration: 5000
            });
        }
    }
}

// 檢查暴擊成就（從角色統計）
function checkCritAchievement(totalCrits) {
    // 成就 4: 暴擊大師 - 累計 50 次暴擊
    if (totalCrits >= 50) {
        unlockAchievement('achievement4');
    }
    
    // 成就 11: 暴擊狂魔 - 累計 500 次暴擊
    if (totalCrits >= 500) {
        unlockAchievement('achievement11');
    }
}

// ★★★ 新增：檢查治療成就 ★★★
function checkHealingAchievements(totalHealing) {
    // 成就 5: 療癒之手 - 累計治療 500 HP
    if (totalHealing >= 500) {
        unlockAchievement('achievement5');
    }
    
    // 成就 12: 治療大師 - 累計治療 5000 HP
    if (totalHealing >= 5000) {
        unlockAchievement('achievement12');
    }
}

// ★★★ 新增：檢查單場戰鬥成就 ★★★
function checkSingleGameAchievements(gameData) {
    const rounds = parseInt(gameData.rounds) || 
                   parseInt(gameData.total_rounds) || 
                   0;
    // 成就 7: 極限生存 - 單場戰鬥超過 30 回合
    if (rounds >= 30) {
        unlockAchievement('achievement7');
    }
    
    // 成就 8: 幸運之神 - 單場連續三次暴擊
    // 這個需要在戰鬥過程中記錄，暫時先不實作檢查
    // 會在 web_game_logic.py 中處理並標記
    if (gameData.consecutive_crits >= 3) {
        unlockAchievement('achievement8');
    }
    
    // 成就 9: 傷害巨炮 - 單場造成 100+ 傷害
    const dragonDamage = (gameData.dragon_stats && gameData.dragon_stats.total_damage_dealt) || 0;
    const personDamage = (gameData.person_stats && gameData.person_stats.total_damage_dealt) || 0;
    const totalDamage = dragonDamage + personDamage;
    
    if (totalDamage >= 100) {
        unlockAchievement('achievement9');
    }
    
    // 成就 10: 完美閃避 - 單場戰鬥無受傷獲勝
    const dragonTookDamage = (gameData.dragon_stats && gameData.dragon_stats.total_damage_taken) || 0;
    const personTookDamage = (gameData.person_stats && gameData.person_stats.total_damage_taken) || 0;
    const someoneWon = gameData.winner !== null && gameData.winner !== undefined;
    
    // 勝利方無受傷
    if (someoneWon) {
        if (gameData.winner === '龍王' && dragonTookDamage === 0) {
            unlockAchievement('achievement10');
        } else if (gameData.winner === '勇者' && personTookDamage === 0) {
            unlockAchievement('achievement10');
        }
    }
}
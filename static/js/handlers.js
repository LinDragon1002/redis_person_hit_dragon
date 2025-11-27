// ========== 按鈕事件處理 (v6) ==========
function setupEventHandlers() {
    // 音效開關
    document.getElementById('soundIcon')?.addEventListener('click', () => {
        window.GameConfig.soundEnabled = !window.GameConfig.soundEnabled;
        const icon = document.getElementById('soundIcon');
        icon.className = window.GameConfig.soundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
        showNotification(window.GameConfig.soundEnabled ? '🔊 音效已開啟' : '🔇 音效已關閉');
    });

    // 手動戰鬥按鈕
    // document.getElementById('runGameBtn')?.addEventListener('click', () => runGame('manual'));

    // 自動戰鬥按鈕
    // document.getElementById('autoBattleBtn')?.addEventListener('click', () => runGame('auto'));

    // 篩選按鈕 (首頁)
    const gamesList = document.getElementById('gamesList');
    if (gamesList) setupFilterButtons(document);

    // 回放按鈕代理監聯 (支援動態添加)
    document.body.addEventListener('click', (e) => {
        const replayBtn = e.target.closest('.replay-btn-tech');
        if (replayBtn) {
            const gameId = replayBtn.getAttribute('data-game-id');
            if (gameId) showGameReplay(parseInt(gameId));
        }
    });

    // 模態框關閉
    document.querySelector('.close-btn-tech')?.addEventListener('click', () => {
        const replayModal = document.getElementById('replayModal');
        if (replayModal) replayModal.style.display = 'none';
    });
    
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('replayModal');
        if (event.target === modal) modal.style.display = 'none';
    });
}

// 篩選按鈕邏輯
function setupFilterButtons(container) {
    container.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const filter = btn.dataset.filter;
            const targetContainer = document.getElementById('gamesList') || document.getElementById('fullHistoryList');
            if(!targetContainer) return;

            const games = targetContainer.querySelectorAll('.game-item-tech');
            games.forEach(game => {
                if (filter === 'all') {
                    game.style.display = 'block';
                } else {
                    game.style.display = game.classList.contains(`winner-${filter}`) ? 'block' : 'none';
                }
            });
        });
    });
}

// ★★★ 執行遊戲 (手動/自動) - v6 修復版 ★★★
async function runGame(mode) {
    const isAuto = mode === 'auto';
    const btnId = isAuto ? 'autoBattleBtn' : 'runGameBtn';
    const btn = document.getElementById(btnId);
    
    if(!btn) return;

    // 檢查是否已輸入玩家名稱 (透過全域變數 currentPlayerName，這在 game.js 定義)
    // 注意：game.js 裡的 currentPlayerName 預設是 '匿名玩家'，
    // 如果要強制輸入，可以檢查它是否為空或者是否還沒設定過
    
    // 這裡我們直接呼叫 game.js 的核心啟動函式，因為它已經包含了:
    // 1. 判斷 Web / Pygame 模式
    // 2. 呼叫對應的 API
    // 3. 正確的 UI 顯示/隱藏 (解決你的問題)
    
    if (typeof startWebGameBackend === 'function') {
        // console.log(`[Handlers] 呼叫 startWebGameBackend (Auto: ${isAuto})`);
        
        // 為了按鈕的回饋感，稍微停用一下
        btn.disabled = true;
        
        try {
            await startWebGameBackend(isAuto);
        } catch (e) {
            console.error("啟動遊戲失敗:", e);
        } finally {
            btn.disabled = false;
        }
    } else {
        // console.error("找不到 startWebGameBackend 函式，請確認 game.js 是否已載入");
        alert("系統錯誤：無法啟動遊戲邏輯");
    }
}

// 戰鬥回放
async function showGameReplay(gameId) {
    const modal = document.getElementById('replayModal');
    const replayLog = document.getElementById('replayLog');
    
    if (!modal || !replayLog) return;
    
    modal.style.display = 'flex';
    replayLog.innerHTML = '<div class="loading-tech"><div class="loading-spinner"></div><span>載入回放數據...</span></div>';
    
    try {
        const response = await fetch(`/api/game/${gameId}/replay`);
        const events = await response.json();
        
        if (events.error) {
            replayLog.innerHTML = `<div style="color: var(--dragon-color); text-align: center; padding: 20px;"><i class="fas fa-exclamation-triangle"></i> 載入失敗：${events.error}</div>`;
            return;
        }
        
        if (!events || events.length === 0) {
            replayLog.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">此戰鬥無回放記錄</div>';
            return;
        }
        
        let html = `<div class="replay-header"><h4 style="font-family: var(--font-tech); color: var(--neon-cyan); margin-bottom: 20px;"><i class="fas fa-gamepad"></i> 戰鬥 #${gameId} 完整回放</h4></div>`;
        html += '<div class="replay-timeline">';
        
        events.forEach((event, index) => {
            const actorClass = event.actor === '龍王' ? 'dragon' : event.actor === '勇者' ? 'person' : 'system';
            const actorColor = actorClass === 'dragon' ? 'var(--dragon-color)' : actorClass === 'person' ? 'var(--person-color)' : 'var(--neon-cyan)';
            
            let actionIcon = '<i class="fas fa-bolt"></i>';
            const action = event.action || '';
            if (action.includes('攻擊') || action.includes('Attack')) actionIcon = '<i class="fas fa-bolt"></i>';
            else if (action.includes('治療') || action.includes('恢復') || action.includes('Heal')) actionIcon = '<i class="fas fa-heart"></i>';
            else if (action.includes('暴擊') || action.includes('Critical')) actionIcon = '<i class="fas fa-bomb"></i>';
            else if (action.includes('回合')) actionIcon = '<i class="fas fa-sync-alt"></i>';
            else if (action.includes('勝利') || action.includes('獲勝')) actionIcon = '<i class="fas fa-trophy"></i>';
            else if (action.includes('Ultimate') || action.includes('大絕')) actionIcon = '<i class="fas fa-star"></i>';
            
            let actionDisplay = action;
            const actionTranslations = { 'Basic Attack': '普通攻擊', 'Heal': '治療', 'Ultimate': '大絕招' };
            if (actionTranslations[actionDisplay]) actionDisplay = actionTranslations[actionDisplay];
            
            let detailsDisplay = event.details || '';
            const detailsTranslations = { 'Critical Hit!': '💥 暴擊！', 'Critical Ultimate!': '💥 暴擊大絕！', 'Recovered HP': '❤️ 恢復生命值' };
            if (detailsTranslations[detailsDisplay]) detailsDisplay = detailsTranslations[detailsDisplay];
            
            html += `
                <div class="replay-event ${actorClass}" style="animation-delay: ${index * 0.05}s;">
                    <div class="event-marker" style="background: ${actorColor};"></div>
                    <div class="event-content">
                        <div class="event-header">
                            <span class="event-turn" style="color: var(--text-muted);">${event.turn ? `第 ${event.turn} 回合` : '系統訊息'}</span>
                            <span class="event-actor" style="color: ${actorColor}; font-weight: 700;">${event.actor || '系統'}</span>
                        </div>
                        <div class="event-action">${actionIcon} ${actionDisplay} ${event.value ? `<span class="event-value">${event.value}</span>` : ''}</div>
                        ${detailsDisplay ? `<div class="event-details">${detailsDisplay}</div>` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        replayLog.innerHTML = html;
        
    } catch (error) {
        // console.error('[showGameReplay] 載入失敗:', error);
        replayLog.innerHTML = `<div style="color: var(--dragon-color); text-align: center; padding: 20px;"><i class="fas fa-exclamation-triangle"></i> 發生錯誤</div>`;
    }
}

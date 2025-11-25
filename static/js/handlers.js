// ========== 按鈕事件處理 ==========
function setupEventHandlers() {
    // 音效開關
    document.getElementById('soundIcon')?.addEventListener('click', () => {
        window.GameConfig.soundEnabled = !window.GameConfig.soundEnabled;
        const icon = document.getElementById('soundIcon');
        icon.className = window.GameConfig.soundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
        showNotification(window.GameConfig.soundEnabled ? '🔊 音效已開啟' : '🔇 音效已關閉');
    });

    // 手動戰鬥按鈕
    document.getElementById('runGameBtn')?.addEventListener('click', () => runGame('manual'));

    // 自動戰鬥按鈕
    document.getElementById('autoBattleBtn')?.addEventListener('click', () => runGame('auto'));

    // 篩選按鈕 (首頁)
    const gamesList = document.getElementById('gamesList');
    if (gamesList) setupFilterButtons(document);

    // 回放按鈕代理監聽 (支援動態添加)
    document.body.addEventListener('click', (e) => {
        const replayBtn = e.target.closest('.replay-btn-tech');
        if (replayBtn) {
            const gameId = replayBtn.getAttribute('data-game-id');
            if (gameId) showGameReplay(parseInt(gameId));
        }
    });

    // 模態框關閉
    document.querySelector('.close-btn-tech')?.addEventListener('click', () => {
        document.getElementById('replayModal').style.display = 'none';
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
            // 判斷是在首頁還是在歷史頁面
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

// 執行遊戲 (手動/自動)
async function runGame(mode) {
    const isAuto = mode === 'auto';
    const btnId = isAuto ? 'autoBattleBtn' : 'runGameBtn';
    const btn = document.getElementById(btnId);
    const status = document.getElementById('gameStatus');
    
    if(!btn) return;

    btn.disabled = true;
    status.className = 'game-status-tech running';
    status.innerHTML = isAuto ? '<i class="fas fa-robot"></i> 自動戰鬥執行中...' : '<i class="fas fa-bolt"></i> 戰鬥進行中...';
    
    try {
        const endpoint = isAuto ? '/api/run_game_auto' : '/api/run_game';
        
        // 獲取當前難度設定
        const difficulty = window.GameConfig.difficulty || 'normal';
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                player_name: window.GameConfig.currentPlayerName,
                difficulty: difficulty  // 新增：傳送難度設定
            })
        });
        const data = await response.json();
        
        if (data.success) {
            const game = data.game;
            status.className = 'game-status-tech success';
            status.innerHTML = `<i class="fas fa-check"></i> ${isAuto ? '自動' : '手動'}戰鬥完成！${game.winner} 獲勝`;
            
            showRealtimeNotification({
                type: 'success',
                title: isAuto ? '自動戰鬥完成' : '手動戰鬥完成',
                message: `${game.winner} 獲勝！回合數: ${game.total_rounds}`,
                duration: 5000
            });
            
            insertNewGameToList(game);
            
            await Promise.all([
                loadStats(),
                loadCharacterStats(),
                loadRecentGames()
            ]);
            
            if (window.GameConfig.soundEnabled) playNotificationSound();
        } else {
            status.className = 'game-status-tech error';
            status.innerHTML = '<i class="fas fa-times"></i> 戰鬥失敗';
        }
    } catch (error) {
        console.error('執行遊戲錯誤:', error);
        status.className = 'game-status-tech error';
        status.innerHTML = '<i class="fas fa-exclamation-circle"></i> 連接錯誤';
    } finally {
        btn.disabled = false;
        setTimeout(() => {
            status.className = 'game-status-tech';
            status.textContent = '';
        }, 5000);
    }
}

// 戰鬥回放
async function showGameReplay(gameId) {
    const modal = document.getElementById('replayModal');
    const replayLog = document.getElementById('replayLog');
    
    modal.style.display = 'flex';
    replayLog.innerHTML = '<div class="loading-tech"><div class="loading-spinner"></div><span>載入回放數據...</span></div>';
    
    try {
        const response = await fetch(`/api/game/${gameId}/replay`);
        const events = await response.json();
        
        if (events.error) {
            replayLog.innerHTML = `<div style="color: var(--dragon-color); text-align: center; padding: 20px;"><i class="fas fa-exclamation-triangle"></i> 載入失敗：${events.error}</div>`;
            return;
        }
        
        if (events.length === 0) {
            replayLog.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">此戰鬥無回放記錄</div>';
            return;
        }
        
        let html = `<div class="replay-header"><h4 style="font-family: var(--font-tech); color: var(--neon-cyan); margin-bottom: 20px;"><i class="fas fa-gamepad"></i> 戰鬥 #${gameId} 完整回放</h4></div>`;
        html += '<div class="replay-timeline">';
        
        events.forEach((event, index) => {
            const actorClass = event.actor === '龍王' ? 'dragon' : event.actor === '勇者' ? 'person' : 'system';
            const actorColor = actorClass === 'dragon' ? 'var(--dragon-color)' : actorClass === 'person' ? 'var(--person-color)' : 'var(--neon-cyan)';
            
            let actionIcon = '<i class="fas fa-bolt"></i>';
            if (event.action?.includes('攻擊') || event.action?.includes('Attack')) actionIcon = '<i class="fas fa-bolt"></i>';
            else if (event.action?.includes('治療') || event.action?.includes('恢復') || event.action?.includes('Heal')) actionIcon = '<i class="fas fa-heart"></i>';
            else if (event.action?.includes('暴擊') || event.action?.includes('Critical')) actionIcon = '<i class="fas fa-bomb"></i>';
            else if (event.action?.includes('回合')) actionIcon = '<i class="fas fa-sync-alt"></i>';
            else if (event.action?.includes('勝利') || event.action?.includes('獲勝')) actionIcon = '<i class="fas fa-trophy"></i>';
            else if (event.action?.includes('Ultimate') || event.action?.includes('大絕')) actionIcon = '<i class="fas fa-star"></i>';
            
            // 翻譯 action 名稱
            let actionDisplay = event.action || '';
            const actionTranslations = {
                'Basic Attack': '普通攻擊',
                'Heal': '治療',
                'Ultimate': '大絕招'
            };
            if (actionTranslations[actionDisplay]) {
                actionDisplay = actionTranslations[actionDisplay];
            }
            
            // 翻譯 details
            let detailsDisplay = event.details || '';
            const detailsTranslations = {
                'Critical Hit!': '💥 暴擊！',
                'Critical Ultimate!': '💥 暴擊大絕！',
                'Recovered HP': '❤️ 恢復生命值'
            };
            if (detailsTranslations[detailsDisplay]) {
                detailsDisplay = detailsTranslations[detailsDisplay];
            }
            
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
        console.error('載入回放失敗:', error);
        replayLog.innerHTML = `<div style="color: var(--dragon-color); text-align: center; padding: 20px;"><i class="fas fa-exclamation-triangle"></i> 發生錯誤</div>`;
    }
}

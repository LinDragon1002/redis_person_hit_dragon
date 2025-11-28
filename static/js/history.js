// 載入完整歷史並計算統計
async function loadAllHistoryWithStats() {
    const container = document.getElementById('fullHistoryList');
    
    try {
        const response = await fetch('/api/all_games');
        const games = await response.json();
        
        if (games.length === 0) {
            container.innerHTML = '<div class="loading-tech"><span>尚無任何戰鬥記錄</span></div>';
            updateSummary(0, 0, 0);
            return;
        }
        
        // 計算統計
        let dragonWins = 0, personWins = 0;
        games.forEach(game => {
            if (game.winner === '龍王') dragonWins++;
            else if (game.winner === '勇者') personWins++;
        });
        
        updateSummary(games.length, dragonWins, personWins);
        
        // 渲染遊戲列表
        container.innerHTML = games.map(game => createGameItemHTML(game)).join('');
        
    } catch (error) {
        // console.error('載入完整歷史失敗:', error);
        container.innerHTML = '<div class="loading-tech"><i class="fas fa-exclamation-triangle"></i><span> 載入失敗，請重試</span></div>';
    }
}

// 更新統計摘要
function updateSummary(total, dragon, person) {
    document.getElementById('summaryTotal').textContent = total;
    document.getElementById('summaryDragon').textContent = dragon;
    document.getElementById('summaryPerson').textContent = person;
}

// 篩選按鈕
function setupHistoryFilterButtons() {
    const container = document.querySelector('.filter-buttons');
    if (!container) return;
    
    container.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // 切換 active 狀態
            container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const filter = btn.dataset.filter;
            const targetContainer = document.getElementById('fullHistoryList');
            if (!targetContainer) return;
            
            const games = targetContainer.querySelectorAll('.game-item-tech');
            let visibleCount = 0;
            
            games.forEach(game => {
                if (filter === 'all') {
                    game.style.display = 'block';
                    visibleCount++;
                } else {
                    const isMatch = game.classList.contains(`winner-${filter}`);
                    game.style.display = isMatch ? 'block' : 'none';
                    if (isMatch) visibleCount++;
                }
            });
            
            // 顯示篩選結果提示
            if (typeof showNotification === 'function') {
                const filterNames = { all: '全部', dragon: '龍王勝', person: '勇者勝', draw: '平手' };
                showNotification(`顯示 ${filterNames[filter]}：${visibleCount} 場`);
            }
        });
    });
}

// 回放按鈕（事件代理）
function setupReplayButtons() {
    document.body.addEventListener('click', (e) => {
        const replayBtn = e.target.closest('.replay-btn-tech');
        if (replayBtn) {
            const gameId = replayBtn.getAttribute('data-game-id');
            if (gameId) {
                showGameReplayModal(parseInt(gameId));
            }
        }
    });
}

// 顯示回放模態框
async function showGameReplayModal(gameId) {
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
            let actionDisplay = event.action || '';
            let detailsDisplay = event.details || '';
            
            // 翻譯動作名稱
            const actionTranslations = {
                'Basic Attack': '普通攻擊',
                'Heal': '治療',
                'Ultimate': '大絕招'
            };
            if (actionTranslations[actionDisplay]) {
                actionDisplay = actionTranslations[actionDisplay];
            }
            
            // 翻譯詳細訊息
            const detailsTranslations = {
                'Critical Hit!': '💥 暴擊！',
                'Critical Ultimate!': '💥 暴擊大絕！',
                'Recovered HP': '❤️ 恢復生命值'
            };
            if (detailsTranslations[detailsDisplay]) {
                detailsDisplay = detailsTranslations[detailsDisplay];
            }
            
            // 選擇圖標
            if (actionDisplay.includes('攻擊') || actionDisplay.includes('Attack')) actionIcon = '<i class="fas fa-bolt"></i>';
            else if (actionDisplay.includes('治療') || actionDisplay.includes('Heal')) actionIcon = '<i class="fas fa-heart"></i>';
            else if (actionDisplay.includes('大絕') || actionDisplay.includes('Ultimate')) actionIcon = '<i class="fas fa-star"></i>';
            
            html += `
                <div class="replay-event ${actorClass}" style="animation-delay: ${index * 0.05}s;">
                    <div class="event-marker" style="background: ${actorColor};"></div>
                    <div class="event-content">
                        <div class="event-header">
                            <span class="event-turn" style="color: var(--text-muted);">${event.turn ? `第 ${event.turn} 回合` : '系統訊息'}</span>
                            <span class="event-actor" style="color: ${actorColor}; font-weight: 700;">${event.actor || '系統'}</span>
                        </div>
                        <div class="event-action">${actionIcon} ${actionDisplay} ${event.value ? `<span class="event-value" style="color: ${actorColor}; font-weight: bold;">${event.value}</span>` : ''}</div>
                        ${detailsDisplay ? `<div class="event-details" style="color: var(--text-secondary); font-size: 0.9em; margin-top: 5px;">${detailsDisplay}</div>` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        replayLog.innerHTML = html;
        
    } catch (error) {
        // console.error('載入回放失敗:', error);
        replayLog.innerHTML = `<div style="color: var(--dragon-color); text-align: center; padding: 20px;"><i class="fas fa-exclamation-triangle"></i> 發生錯誤</div>`;
    }
}

// 模態框關閉
function setupModalClose() {
    const modal = document.getElementById('replayModal');
    const closeBtn = document.querySelector('.close-btn-tech');
    
    closeBtn?.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // ESC 鍵關閉
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });
}

// 創建遊戲項目 HTML（如果 ui.js 的函數不可用則使用這個）
function createGameItemHTML(game) {
    // 檢查是否已有全域函數
    if (typeof window.createGameItemHTML === 'function' && window.createGameItemHTML !== createGameItemHTML) {
        return window.createGameItemHTML(game);
    }
    
    const date = new Date(game.timestamp);
    const winnerClass = game.winner === '龍王' ? 'dragon' : 
                        game.winner === '勇者' ? 'person' : 'draw';
    const winnerDisplay = game.winner === '平手' 
        ? '<i class="fas fa-balance-scale"></i> 平手' 
        : `${game.winner} <i class="fas fa-trophy"></i>`;
    
    const playerNameDisplay = game.player_name ? 
        `<div style="color: var(--neon-cyan); font-size: 12px; display: flex; align-items: center; gap: 5px;">
            <i class="fas fa-user-circle"></i> ${game.player_name}
            </div>` : '';
    
    // 安全取得數據
    const dragonStats = game.dragon_stats || {};
    const personStats = game.person_stats || {};
    
    return `
        <div class="game-item-tech winner-${winnerClass}" data-game-id="${game.game_id}">
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
                    <div style="color: #fff; font-weight: 700; font-size: 16px;">${game.total_rounds || '-'}</div>
                </div>
                <div style="text-align: center; padding: 8px; background: rgba(255,51,102,0.1); border-radius: 6px;">
                    <div style="color: #888; font-size: 11px;">龍王 HP</div>
                    <div style="color: #ff3366; font-weight: 700; font-size: 16px;">${dragonStats.final_hp ?? '-'}</div>
                </div>
                <div style="text-align: center; padding: 8px; background: rgba(0,217,255,0.1); border-radius: 6px;">
                    <div style="color: #888; font-size: 11px;">勇者 HP</div>
                    <div style="color: #00d9ff; font-weight: 700; font-size: 16px;">${personStats.final_hp ?? '-'}</div>
                </div>
                <div style="text-align: center; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 6px;">
                    <div style="color: #888; font-size: 11px;">龍王傷害</div>
                    <div style="color: #fff; font-weight: 700; font-size: 16px;">${dragonStats.total_damage_dealt ?? '-'}</div>
                </div>
                <div style="text-align: center; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 6px;">
                    <div style="color: #888; font-size: 11px;">勇者傷害</div>
                    <div style="color: #fff; font-weight: 700; font-size: 16px;">${personStats.total_damage_dealt ?? '-'}</div>
                </div>
            </div>
        </div>
    `;
}
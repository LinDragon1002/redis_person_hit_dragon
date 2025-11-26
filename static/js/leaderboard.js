async function loadDamageLeaderboard() {
    const container = document.getElementById('damageLeaderboard');
    try {
        const response = await fetch('/api/leaderboard');
        const data = await response.json();
        
        if (data.error || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-bar"></i>
                    <p>尚無排行數據</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = data.map((item, index) => `
            <div class="leaderboard-item rank-${index + 1}">
                <div class="rank-badge ${index >= 3 ? 'normal' : ''}">${index + 1}</div>
                <div class="item-info">
                    <div class="item-title">戰鬥 #${item.game_id}</div>
                    <div class="item-subtitle">單場最高輸出</div>
                </div>
                <div class="item-value damage">${item.damage}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('載入傷害排行失敗:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>載入失敗</p></div>`;
    }
}

async function loadRoundsLeaderboard() {
    const container = document.getElementById('roundsLeaderboard');
    try {
        const response = await fetch('/api/leaderboard/rounds');
        const data = await response.json();
        
        if (data.error || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-hourglass-half"></i>
                    <p>尚無排行數據</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = data.map((item, index) => `
            <div class="leaderboard-item rank-${index + 1}">
                <div class="rank-badge ${index >= 3 ? 'normal' : ''}">${index + 1}</div>
                <div class="item-info">
                    <div class="item-title">戰鬥 #${item.game_id}</div>
                    <div class="item-subtitle">持久戰紀錄</div>
                </div>
                <div class="item-value rounds">${item.rounds} 回合</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('載入回合排行失敗:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>載入失敗</p></div>`;
    }
}

async function loadWinStats() {
    const dragonContainer = document.getElementById('dragonWinsBoard');
    const personContainer = document.getElementById('personWinsBoard');
    
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        
        // 龍王統計
        dragonContainer.innerHTML = `
            <div class="leaderboard-item rank-1">
                <div class="rank-badge"><i class="fas fa-crown"></i></div>
                <div class="item-info">
                    <div class="item-title">龍王總勝場</div>
                    <div class="item-subtitle">勝率: ${stats.dragon_win_rate}%</div>
                </div>
                <div class="item-value" style="color: var(--dragon-color);">${stats.dragon_wins}</div>
            </div>
            <div class="leaderboard-item">
                <div class="rank-badge normal"><i class="fas fa-gamepad"></i></div>
                <div class="item-info">
                    <div class="item-title">總戰鬥場次</div>
                    <div class="item-subtitle">包含所有玩家</div>
                </div>
                <div class="item-value" style="color: var(--neon-cyan);">${stats.total_games}</div>
            </div>
        `;
        
        // 勇者統計
        personContainer.innerHTML = `
            <div class="leaderboard-item rank-1">
                <div class="rank-badge"><i class="fas fa-crown"></i></div>
                <div class="item-info">
                    <div class="item-title">勇者總勝場</div>
                    <div class="item-subtitle">勝率: ${stats.person_win_rate}%</div>
                </div>
                <div class="item-value" style="color: var(--person-color);">${stats.person_wins}</div>
            </div>
            <div class="leaderboard-item">
                <div class="rank-badge normal"><i class="fas fa-handshake"></i></div>
                <div class="item-info">
                    <div class="item-title">平手場次</div>
                    <div class="item-subtitle">雙方同歸於盡</div>
                </div>
                <div class="item-value" style="color: #ffd700;">${stats.draws}</div>
            </div>
        `;
        
    } catch (error) {
        console.error('載入勝場統計失敗:', error);
        dragonContainer.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>載入失敗</p></div>`;
        personContainer.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>載入失敗</p></div>`;
    }
}
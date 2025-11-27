// ========== 玩家名稱處理邏輯 ==========

function initPlayerName() {
    const modal = document.getElementById('playerNameModal');
    if (!modal) return;
    
    const input = document.getElementById('playerNameInput');
    
    // 1. 先綁定按鍵事件 (不管顯不顯示都要綁，以免稍後手動開啟時按 Enter 沒反應)
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                startGame(); 
            }
        });
    }

    // 如果這個分頁已經設定過名字，就不再跳出視窗
    if (sessionStorage.getItem('isPlayerReady') === 'true') {
        modal.style.display = 'none';
        
        // 確保導覽列上的名字有顯示出來
        if (typeof updatePlayerNameDisplay === 'function') {
            updatePlayerNameDisplay();
        }
        return;
    }
    
    // 以下是「第一次進入」或「新開分頁」時的邏輯：強制顯示
    modal.style.display = 'flex';
    
    // 預填舊名字 (如果有)
    const savedName = localStorage.getItem('playerName');
    if (savedName && input) {
        input.value = savedName;
    }
    
    // 自動聚焦
    if (input) {
        setTimeout(() => input.focus(), 100);
    }
}

function updatePlayerNameDisplay() {
    const navbar = document.querySelector('.navbar-content');
    if (!navbar || !window.GameConfig.currentPlayerName) return;
    
    let playerDisplay = document.getElementById('currentPlayerDisplay');
    
    if (!playerDisplay) {
        playerDisplay = document.createElement('div');
        playerDisplay.id = 'currentPlayerDisplay';
        playerDisplay.style.cssText = 'color: var(--neon-cyan); font-size: 14px; margin-left: 20px; display: flex; align-items: center; gap: 8px;';
        const leftNav = navbar.querySelector('.navbar-left');
        if (leftNav) leftNav.appendChild(playerDisplay);
    }
    
    playerDisplay.innerHTML = `
        <i class="fas fa-user-circle"></i>
        <span>玩家：${window.GameConfig.currentPlayerName}</span>
        <button onclick="changePlayerName()" style="background: none; border: 1px solid var(--neon-cyan); color: var(--neon-cyan); padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">
            <i class="fas fa-edit"></i> 更改
        </button>
    `;
}

// 暴露給全域以便 HTML onclick 調用
window.changePlayerName = function() {
    const modal = document.getElementById('playerNameModal');
    const input = document.getElementById('playerNameInput');
    if (modal) modal.style.display = 'flex';
    if (input) {
        input.value = window.GameConfig.currentPlayerName || '';
        input.focus();
    }
};

// 暴露 updatePlayerNameDisplay 給其他模組使用
window.updatePlayerNameDisplay = updatePlayerNameDisplay;

// ========== 玩家名稱處理邏輯 ==========

function initPlayerName() {
    const modal = document.getElementById('playerNameModal');
    if (!modal) return; // 防止在沒有模態框的頁面報錯
    
    const input = document.getElementById('playerNameInput');
    const confirmBtn = document.getElementById('confirmPlayerName');
    const rememberCheckbox = document.getElementById('rememberName');
    
    // 檢查是否需要記住名字
    const shouldRemember = localStorage.getItem('rememberPlayerName') !== 'false';
    
    // 如果已經有玩家名稱且選擇記住，直接關閉模態框
    if (window.GameConfig.currentPlayerName && shouldRemember) {
        modal.style.display = 'none';
        updatePlayerNameDisplay();
    } else {
        modal.style.display = 'flex';
        if (window.GameConfig.currentPlayerName) {
            input.value = window.GameConfig.currentPlayerName;
        }
    }
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmBtn.click();
        }
    });
    
    confirmBtn.addEventListener('click', () => {
        const name = input.value.trim();
        if (name) {
            window.GameConfig.currentPlayerName = name;
            
            if (rememberCheckbox.checked) {
                localStorage.setItem('playerName', name);
                localStorage.setItem('rememberPlayerName', 'true');
            } else {
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
}

function updatePlayerNameDisplay() {
    const navbar = document.querySelector('.navbar-content');
    if (!navbar) return;
    
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
    modal.style.display = 'flex';
    input.value = window.GameConfig.currentPlayerName;
    input.focus();
};
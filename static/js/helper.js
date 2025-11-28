function setupHelpModal() {
    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    const closeBtn = document.getElementById('closeHelpModal');
    
    // 綁定開啟按鈕
    helpBtn?.addEventListener('click', () => {
        helpModal.style.display = 'flex';
    });

    // 綁定關閉按鈕 (並記錄已看過)
    closeBtn?.addEventListener('click', () => {
        helpModal.style.display = 'none';
        localStorage.setItem('hasSeenHelp', 'true'); // 記錄已看過
    });

    // 點擊背景關閉
    window.addEventListener('click', (e) => { 
        if (e.target === helpModal) {
            helpModal.style.display = 'none';
            localStorage.setItem('hasSeenHelp', 'true'); // 記錄已看過
        }
    });

    // ★★★ 不再在這裡自動顯示，改由 game.js 的 startGame() 控制 ★★★
    // 這樣可以確保在「確認設定」按鈕被點擊後才顯示
}

function checkAndShowHelp() {
    // 只有在還沒看過說明的時候才顯示
    if (!localStorage.getItem('hasSeenHelp')) {
        const helpModal = document.getElementById('helpModal');
        if (helpModal) {
            helpModal.style.display = 'flex';
        }
    }
}

function setupDifficultySelector() {
    const btns = document.querySelectorAll('.difficulty-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const difficulty = btn.dataset.difficulty;
            window.GameConfig.difficulty = difficulty;
            localStorage.setItem('gameDifficulty', difficulty);
            
            const diffNames = { easy: '簡單', normal: '普通', hard: '困難' };
            showNotification(`難度已設為: ${diffNames[difficulty]}`);
        });
    });
    
    // ★★★ 預設普通模式 ★★★
    const savedDifficulty = localStorage.getItem('gameDifficulty') || 'normal';
    window.GameConfig.difficulty = savedDifficulty;
    btns.forEach(b => b.classList.remove('active'));
    document.querySelector(`.difficulty-btn[data-difficulty="${savedDifficulty}"]`)?.classList.add('active');
}
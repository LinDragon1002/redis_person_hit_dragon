// game.js (完整整合版)

// 1. 初始化變數：優先從 localStorage 讀取設定
let storedMode = localStorage.getItem('displayMode');
let currentDisplayMode = storedMode || 'web'; 
let selectedDisplayMode = currentDisplayMode; // 讓設定選單也同步

let currentPlayerName = localStorage.getItem('playerName') || '匿名玩家';
let currentGameId = null;
let socket = io();
let isAutoMode = false;
let autoTimer = null;

// 防止連點的鎖定變數
let isActionPending = false; 

// 2. 初始化遊戲 (呼叫後端 API 建立遊戲)
async function startWebGameBackend(auto = false) {
    const difficulty = window.GameConfig.difficulty || 'normal';
    
    // 設定是否為自動模式 (給前端邏輯用)
    isAutoMode = auto;

    if (currentDisplayMode === 'web') {
        // ==========================
        //  情況 A: 啟動網頁版
        // ==========================
        
        // 顯示網頁版介面
        document.getElementById('gameContainer').classList.remove('hidden');
        document.getElementById('webBattleArea').style.display = 'block';

        const battleStatus = document.getElementById('battleStatus');
        if (battleStatus) battleStatus.innerHTML = '';
        
        try {
            const res = await fetch('/api/start_web_battle', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ player_name: currentPlayerName, difficulty: difficulty })
            });
            const data = await res.json();
            
            if(data.success) {
                currentGameId = data.game_id;
                updateGameUI(data.state);
                
                const modeText = isAutoMode ? '自動託管模式' : '手動模式';
                document.getElementById('connectionStatus').innerText = `連線成功 (ID: ${currentGameId}) - ${modeText}`;
                
                if(isAutoMode) {
                    triggerNextAutoTurn();
                }
            } else {
                alert("啟動失敗: " + (data.error || "未知錯誤"));
                document.getElementById('playerNameModal').style.display = 'flex';
            }
        } catch (e) {
            alert("無法啟動遊戲: " + e);
        }

    } else {
        // ==========================
        //  情況 B: 啟動 Pygame 版
        // ==========================
        
        // 隱藏網頁介面
        document.getElementById('gameContainer').classList.add('hidden');
        document.getElementById('webBattleArea').style.display = 'none';
        document.getElementById('pygameMessage').classList.add('hidden');

        try {
            // 顯示系統通知
            if(typeof showRealtimeNotification === 'function') {
                const modeMsg = isAutoMode ? '自動模式' : '手動模式';
                showRealtimeNotification({type: 'info', title: '系統', message: `正在啟動 Pygame 視窗 (${modeMsg})...`});
            }

            // 呼叫 API
            if (isAutoMode) {
                // === 自動模式 ===
                console.log("[UI] 正在請求 Pygame 自動戰鬥 API...");
                await fetch('/api/run_game_auto', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        player_name: currentPlayerName,
                        difficulty: difficulty
                    })
                });
            } else {
                // === 手動模式 ===
                console.log("[UI] 正在請求 Pygame 手動戰鬥 API...");
                await fetch('/api/run_game', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        player_name: currentPlayerName,
                        mode: 'manual',         
                        display_mode: 'pygame', 
                        difficulty: difficulty
                    })
                });
            }
            console.log("[UI] Pygame 啟動請求已發送");
            
        } catch (e) {
            console.error("Pygame 啟動失敗:", e);
            if(typeof showRealtimeNotification === 'function') {
                showRealtimeNotification({type: 'error', title: '啟動失敗', message: '無法連接到伺服器，請檢查後端狀態。'});
            }
        }
    }
}

// 3. 觸發下一回合自動戰鬥
function triggerNextAutoTurn() {
    if(!currentGameId || !isAutoMode) return;
    
    // 延遲 1 秒讓動畫播完，再送出請求
    autoTimer = setTimeout(() => {
        console.log('[Auto] 請求下一回合...');
        socket.emit('web_auto_action', { game_id: currentGameId });
    }, 1000);
}

// 4. 發送手動動作 (防連點)
function sendAction(skillId) {
    if (!currentGameId || isAutoMode) return; 
    
    // 檢查是否正在等待回應
    if (isActionPending) {
        console.log("操作過快，請稍候...");
        return; 
    }

    // 檢查按鈕是否 CD 中
    const btn = document.querySelector(`button[data-skill="${skillId}"]`);
    if(btn && btn.classList.contains('on-cooldown')) return;

    // 鎖定操作
    isActionPending = true;
    disableAllSkillButtons(true);

    socket.emit('web_action', {
        game_id: currentGameId,
        action: skillId
    });
}

// 5. 監聽後端回傳的狀態更新
socket.on('web_update', function(state) {
    // 解除鎖定
    isActionPending = false;
    
    if(state.error) {
        showRealtimeNotification({type: 'error', title: '錯誤', message: state.error});
        disableAllSkillButtons(false); 
        return;
    }
    
    // 更新畫面
    updateGameUI(state);
    
    // 處理遊戲結束
    if(state.game_over) {
        clearTimeout(autoTimer);
        setTimeout(() => {
             showVictoryCrown(state.winner);
             const battleStatus = document.getElementById('battleStatus');
             if(battleStatus) battleStatus.innerHTML = `<span style="color: gold;">${state.winner} 獲勝！</span>`;
             
             setTimeout(() => {
                 closeGameArea();
                 if(typeof loadStats === 'function') loadStats();
                 if(typeof loadRecentGames === 'function') loadRecentGames();
             }, 3000);
        }, 500);
    } else {
        if(isAutoMode) {
            triggerNextAutoTurn();
        }
    }
});

// 6. 更新 UI (血量、特效、CD)
function updateGameUI(state) {
    const dHpEl = document.getElementById('dragonHp');
    const pHpEl = document.getElementById('personHp');
    const dSprite = document.getElementById('dragonSprite');
    const pSprite = document.getElementById('personSprite');
    
    // 觸發特效 (從事件列表)
    if (state.turn_events && Array.isArray(state.turn_events)) {
        state.turn_events.forEach((event, index) => {
            setTimeout(() => {
                const targetSprite = event.target === 'dragon' ? dSprite : pSprite;
                const attackerSprite = event.target === 'dragon' ? pSprite : dSprite;

                if (event.type === 'damage') {
                    triggerDamageEffect(targetSprite);
                    showFloatingDamage(event.value, targetSprite, 'damage');
                    if (event.is_crit) {
                        setTimeout(() => {
                             showFloatingDamage(null, targetSprite, 'crit');
                        }, 100);
                    }
                    triggerAttackEffect(attackerSprite);

                } else if (event.type === 'heal') {
                    showFloatingDamage(event.value, targetSprite, 'heal');
                }
            }, index * 300);
        });
    }

    // 更新血量數值
    if(dHpEl) dHpEl.innerText = state.dragon.hp;
    if(pHpEl) pHpEl.innerText = state.person.hp;

    // 更新按鈕 CD 狀態
    [1, 2, 3].forEach(id => {
        const btn = document.querySelector(`button[data-skill="${id}"]`);
        if(!btn) return;
        
        const cd = state.person.cooldowns[id];
        const indicator = btn.querySelector('.cd-indicator');
        
        if(cd > 0) {
            btn.classList.add('on-cooldown');
            btn.classList.remove('ready');
            btn.disabled = true;
            if(indicator) { indicator.style.display = 'block'; indicator.innerText = cd + 'T'; }
        } else {
            btn.classList.remove('on-cooldown');
            btn.classList.add('ready');
            btn.disabled = false;
            // 只有在非鎖定狀態下才啟用按鈕
            if (!isActionPending) {
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
            if(indicator) { indicator.style.display = 'none'; }
        }
    });
}

// 7. 輔助函式：禁用/啟用所有技能按鈕
function disableAllSkillButtons(disabled) {
    const btns = document.querySelectorAll('.skill-btn-cyber');
    btns.forEach(btn => {
        btn.disabled = disabled;
        if (disabled) {
            btn.style.opacity = '0.5';
            btn.style.cursor = 'wait';
        } else {
            // 注意：解除禁用時，具體樣式會由 updateGameUI 根據 CD 決定，這裡只做基礎還原
            btn.style.cursor = 'pointer';
        }
    });
}

// === UI 特效函式 ===

function triggerDamageEffect(spriteElement) {
    if (!spriteElement) return;
    spriteElement.classList.remove('anim-damage');
    void spriteElement.offsetWidth;
    spriteElement.classList.add('anim-damage');
}

function triggerAttackEffect(spriteElement) {
    if (!spriteElement) return;
    spriteElement.classList.remove('anim-attack');
    void spriteElement.offsetWidth;
    spriteElement.classList.add('anim-attack');
}

function showFloatingDamage(amount, targetElement, type) {
    if (!targetElement) return;
    
    const floatEl = document.createElement('div');
    floatEl.className = `float-text ${type}`;
    
    if (type === 'heal') {
        floatEl.innerText = `+${amount}`;
    } else if (type === 'crit') {
        floatEl.innerText = "暴擊!";
        floatEl.style.fontSize = '40px';
        floatEl.style.color = '#ff0000';
        floatEl.style.textShadow = '0 0 10px yellow';
        floatEl.style.zIndex = '2001';
    } else {
        floatEl.innerText = `-${amount}`;
    }
    
    const rect = targetElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    floatEl.style.left = (rect.left + scrollLeft + rect.width / 2 - 30) + 'px'; 
    floatEl.style.top = (rect.top + scrollTop - 20) + 'px'; 
    
    document.body.appendChild(floatEl);
    setTimeout(() => { floatEl.remove(); }, 1000);
}

function showVictoryCrown(winnerName) {
    let targetSprite;
    if (winnerName === '勇者') {
        targetSprite = document.getElementById('personSprite');
    } else if (winnerName === '龍王') {
        targetSprite = document.getElementById('dragonSprite');
    }

    if (!targetSprite) targetSprite = document.body; 

    const rect = targetSprite.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    const topPos = rect.top + scrollTop - 60;
    const leftPos = rect.left + scrollLeft + (rect.width / 2);

    const crown = document.createElement('div');
    crown.innerHTML = '👑';
    crown.style.position = 'absolute';
    crown.style.fontSize = '80px';
    crown.style.top = `${topPos}px`;
    crown.style.left = `${leftPos}px`;
    crown.style.transform = 'translate(-50%, 0) scale(0)';
    crown.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    crown.style.zIndex = '9999';
    crown.style.textShadow = '0 0 20px gold';
    crown.style.pointerEvents = 'none';
    
    document.body.appendChild(crown);
    
    requestAnimationFrame(() => {
        crown.style.transform = 'translate(-50%, 0) scale(1)';
    });
    
    setTimeout(() => crown.remove(), 3000);
}

function closeGameArea() {
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) gameContainer.classList.add('hidden');

    const webBattleArea = document.getElementById('webBattleArea');
    if (webBattleArea) webBattleArea.style.display = 'none';

    const modal = document.getElementById('playerNameModal');
    if (modal) modal.style.display = 'none'; 

    const gameStatus = document.getElementById('gameStatus');
    if (gameStatus) {
        gameStatus.innerText = '';
        gameStatus.className = 'game-status-tech';
    }

    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) connectionStatus.innerText = '等待連接...';
    
    currentGameId = null;
    isAutoMode = false;
    if (typeof autoTimer !== 'undefined' && autoTimer) {
        clearTimeout(autoTimer);
    }

    const dHp = document.getElementById('dragonHp');
    const pHp = document.getElementById('personHp');
    if(dHp) dHp.innerText = '20';
    if(pHp) pHp.innerText = '20';
}

// === 模態框與設定邏輯 (包含記憶功能) ===

// 1. 選擇模式
function selectMode(mode) {
    selectedDisplayMode = mode;
    localStorage.setItem('displayMode', mode); // 記憶模式
    
    const webBtn = document.getElementById('modeWeb');
    const pyBtn = document.getElementById('modePygame');
    
    if (webBtn && pyBtn) {
        webBtn.classList.remove('active');
        pyBtn.classList.remove('active');
        
        if (mode === 'web') {
            webBtn.classList.add('active');
        } else {
            pyBtn.classList.add('active');
        }
    }
}

// 2. 啟動遊戲 (確認設定)
async function startGame() {
    const nameInput = document.getElementById('playerNameInput');
    const finalName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : '匿名玩家';

    currentPlayerName = finalName;
    window.GameConfig.currentPlayerName = finalName;
    localStorage.setItem('playerName', finalName); // 記憶名字
    
    // 標記本次工作階段已就緒
    sessionStorage.setItem('isPlayerReady', 'true');

    if (typeof updatePlayerNameDisplay === 'function') {
        updatePlayerNameDisplay();
    }
    
    currentDisplayMode = selectedDisplayMode; 
    localStorage.setItem('displayMode', currentDisplayMode); // 再次確認記憶

    console.log(`[Config] 設定完成: 玩家=${currentPlayerName}, 模式=${currentDisplayMode}`);

    const modal = document.getElementById('playerNameModal');
    if (modal) modal.style.display = 'none';

    document.getElementById('gameContainer').classList.add('hidden');
    document.getElementById('webBattleArea').style.display = 'none';
    document.getElementById('pygameMessage').classList.add('hidden');
    
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) connectionStatus.innerText = '等待啟動...';
}

// === 綁定全域變數與事件 ===

// 頁面載入時，恢復按鈕狀態
document.addEventListener('DOMContentLoaded', () => {
    selectMode(currentDisplayMode);
});

// 暴露給 HTML 呼叫
window.startWebGameBackend = startWebGameBackend;
window.sendAction = sendAction;
window.selectMode = selectMode;
window.startGame = startGame;
// game.js (Python 後端託管版)
let currentDisplayMode = 'web'; // 預設網頁版
let currentPlayerName = '匿名玩家';
let currentGameId = null;
let socket = io();
let isAutoMode = false;
let autoTimer = null;

// 1. 初始化遊戲 (呼叫後端 API 建立遊戲)
async function startWebGameBackend(auto = false) {
    const difficulty = window.GameConfig.difficulty || 'normal';
    
    // 設定是否為自動模式 (給前端邏輯用)
    isAutoMode = auto;

    if (currentDisplayMode === 'web') {
        // ==========================
        //  情況 A: 啟動網頁版 (原本的邏輯)
        // ==========================
        
        // 1. 顯示網頁版介面
        document.getElementById('gameContainer').classList.remove('hidden');
        document.getElementById('webBattleArea').style.display = 'block';

        const battleStatus = document.getElementById('battleStatus');
        if (battleStatus) battleStatus.innerHTML = '';
        
        // 2. 呼叫網頁版 API
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
            if(typeof showRealtimeNotification === 'function') {
                showRealtimeNotification({type: 'error', title: '啟動失敗', message: '無法連接到伺服器，請檢查後端狀態。'});
            }
        }

    } else {
        // ==========================
        //  情況 B: 啟動 Pygame 版 (新邏輯)
        // ==========================
        
        // ★★★ 關鍵修改：不顯示 web 介面，也不顯示第二張圖的提示框，直接呼叫 API 啟動視窗 ★★★
        document.getElementById('gameContainer').classList.add('hidden');
        document.getElementById('webBattleArea').style.display = 'none';
        document.getElementById('pygameMessage').classList.add('hidden');

        try {
            // 2. 顯示系統通知
            if(typeof showRealtimeNotification === 'function') {
                const modeMsg = isAutoMode ? '自動模式' : '手動模式';
                showRealtimeNotification({type: 'info', title: '系統', message: `正在啟動 Pygame 視窗 (${modeMsg})...`});
            }

            // 3. ★★★ 根據模式呼叫不同的 API ★★★
            if (isAutoMode) {
                // === 自動模式：呼叫 /api/run_game_auto ===
                console.log("[UI] 正在請求 Pygame 自動戰鬥 API...");
                await fetch('/api/run_game_auto', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        player_name: currentPlayerName,
                        mode: 'auto',
                        display_mode: 'pygame',
                        difficulty: difficulty
                    })
                });
            } else {
                // === 手動模式：呼叫 /api/run_game ===
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
            
        } catch (e) {
            if(typeof showRealtimeNotification === 'function') {
                showRealtimeNotification({type: 'error', title: '啟動失敗', message: '無法連接到伺服器，請檢查後端狀態。'});
            }
        }
    }
}

// 2. 觸發下一回合自動戰鬥
function triggerNextAutoTurn() {
    if(!currentGameId || !isAutoMode) return;
    
    // 延遲 1 秒讓動畫播完，再送出請求
    autoTimer = setTimeout(() => {
        console.log('[Auto] 請求下一回合...');
        socket.emit('web_auto_action', { game_id: currentGameId });
    }, 1000);
}

// 3. 發送手動動作
function sendAction(skillId) {
    if (!currentGameId || isAutoMode) return; // 自動模式下禁止手動按
    
    // 檢查按鈕是否 CD 中 (根據前端 UI 狀態)
    const btn = document.querySelector(`button[data-skill="${skillId}"]`);
    if(btn && btn.classList.contains('on-cooldown')) return;

    socket.emit('web_action', {
        game_id: currentGameId,
        action: skillId
    });
}

// 4. 監聽後端回傳的狀態更新
socket.on('web_update', function(state) {
    if(state.error) {
        showRealtimeNotification({type: 'error', title: '錯誤', message: state.error});
        return;
    }
    
    // 更新畫面
    updateGameUI(state);
    
    // 處理遊戲結束
    if(state.game_over) {
        clearTimeout(autoTimer);
        setTimeout(() => {
             // 顯示勝利王冠
             showVictoryCrown(state.winner);
             
             // 顯示結束訊息
             const battleStatus = document.getElementById('battleStatus');
             battleStatus.innerHTML = `<span style="color: gold;">${state.winner} 獲勝！</span>`;
             
             // 3秒後關閉
             setTimeout(() => {
                 closeGameArea();
                 // 重新載入數據
                 if(typeof loadStats === 'function') loadStats();
                 if(typeof loadRecentGames === 'function') loadRecentGames();
             }, 3000);
        }, 500);
    } else {
        // 遊戲沒結束，如果是自動模式，繼續下一回合
        if(isAutoMode) {
            triggerNextAutoTurn();
        }
    }
});

// 5. 更新 UI (血量、特效、CD)
function updateGameUI(state) {
    const dHpEl = document.getElementById('dragonHp');
    const pHpEl = document.getElementById('personHp');
    const dSprite = document.getElementById('dragonSprite');
    const pSprite = document.getElementById('personSprite');
    
    // ★★★ 關鍵修改：使用後端傳來的事件列表來觸發特效 ★★★
    // 不再比較新舊血量，這樣可以精確顯示每一次的傷害和暴擊
    if (state.turn_events && Array.isArray(state.turn_events)) {
        state.turn_events.forEach((event, index) => {
            // 使用 setTimeout 稍微錯開連續的事件，讓動畫更清楚
            setTimeout(() => {
                const targetSprite = event.target === 'dragon' ? dSprite : pSprite;
                const attackerSprite = event.target === 'dragon' ? pSprite : dSprite;

                if (event.type === 'damage') {
                    // 1. 觸發受傷特效
                    triggerDamageEffect(targetSprite);
                    // 2. 顯示精確的傷害數字
                    showFloatingDamage(event.value, targetSprite, 'damage');
                    // 3. 如果是暴擊，額外顯示「暴擊!」文字
                    if (event.is_crit) {
                        // 稍微延遲一點點顯示暴擊文字，製造層次感
                        setTimeout(() => {
                             showFloatingDamage(null, targetSprite, 'crit');
                        }, 100);
                    }
                    // 4. 觸發攻擊者的攻擊動畫
                    triggerAttackEffect(attackerSprite);

                } else if (event.type === 'heal') {
                    // 顯示治療數字
                    showFloatingDamage(event.value, targetSprite, 'heal');
                }
            }, index * 300); // 每個事件間隔 300ms
        });
    }

    // --- 更新數值顯示 ---
    // 直接更新為最新血量
    if(dHpEl) dHpEl.innerText = state.dragon.hp;
    if(pHpEl) pHpEl.innerText = state.person.hp;

    // --- 更新按鈕 CD 狀態 (這部分保持不變) ---
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
            if(indicator) { indicator.style.display = 'none'; }
        }
    });
}

// === 補上缺失的 UI 特效函式 (貼在 game.js 最下方) ===

// 1. 受傷特效 (紅色閃爍 + 震動)
function triggerDamageEffect(spriteElement) {
    if (!spriteElement) return;
    // 移除舊 class 以便能重複觸發
    spriteElement.classList.remove('anim-damage');
    // 強制瀏覽器重繪 (Reflow) 以重啟動畫
    void spriteElement.offsetWidth;
    spriteElement.classList.add('anim-damage');
}

// 2. 攻擊特效 (向前衝刺)
function triggerAttackEffect(spriteElement) {
    if (!spriteElement) return;
    spriteElement.classList.remove('anim-attack');
    void spriteElement.offsetWidth;
    spriteElement.classList.add('anim-attack');
}

// 3. 浮動傷害數字
function showFloatingDamage(amount, targetElement, type) {
    if (!targetElement) return;
    
    // 建立浮動文字元素
    const floatEl = document.createElement('div');
    // 根據類型設定樣式
    floatEl.className = `float-text ${type}`;
    
    // ★★★ 新增：設定文字內容 ★★★
    if (type === 'heal') {
        floatEl.innerText = `+${amount}`;
    } else if (type === 'crit') {
        floatEl.innerText = "暴擊!";
        // 暴擊時，文字稍微大一點，顏色更亮
        floatEl.style.fontSize = '40px';
        floatEl.style.color = '#ff0000';
        floatEl.style.textShadow = '0 0 10px yellow';
        floatEl.style.zIndex = '2001'; // 確保在傷害數字上面
    } else {
        // 一般傷害
        floatEl.innerText = `-${amount}`;
    }
    
    // 計算位置 (在目標頭上)
    const rect = targetElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    floatEl.style.left = (rect.left + scrollLeft + rect.width / 2 - 30) + 'px'; 
    floatEl.style.top = (rect.top + scrollTop - 20) + 'px'; // 稍微往上提一點
    
    document.body.appendChild(floatEl);
    
    // 動畫結束後移除元素
    setTimeout(() => {
        floatEl.remove();
    }, 1000);
}

// 4. 顯示勝利王冠 (遊戲結束時用到)
function showVictoryCrown(winnerName) {
    // ★★★ 關鍵修改：找出獲勝者的圖片元素 ★★★
    let targetSprite;
    if (winnerName === '勇者') {
        targetSprite = document.getElementById('personSprite');
    } else if (winnerName === '龍王') {
        targetSprite = document.getElementById('dragonSprite');
    }

    if (!targetSprite) {
        console.error("找不到獲勝者的圖片元素");
        // 如果找不到，降級為顯示在畫面中間 (以防萬一)
        targetSprite = document.body; 
    }

    // 計算目標頭上的位置
    const rect = targetSprite.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    // 計算中心點上方的位置
    const topPos = rect.top + scrollTop - 60;
    const leftPos = rect.left + scrollLeft + (rect.width / 2);

    const crown = document.createElement('div');
    crown.innerHTML = '👑';
    crown.style.position = 'absolute';
    crown.style.fontSize = '80px';
    // ★★★ 設定計算好的位置 ★★★
    crown.style.top = `${topPos}px`;
    crown.style.left = `${leftPos}px`;
    // 使用 translate(-50%, 0) 讓它水平置中對齊 leftPos
    crown.style.transform = 'translate(-50%, 0) scale(0)';
    crown.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    crown.style.zIndex = '9999';
    crown.style.textShadow = '0 0 20px gold';
    crown.style.pointerEvents = 'none'; // 避免擋住點擊
    
    document.body.appendChild(crown);
    
    // 顯示動畫
    requestAnimationFrame(() => {
        crown.style.transform = 'translate(-50%, 0) scale(1)';
    });
    
    // 3秒後移除
    setTimeout(() => crown.remove(), 3000);
}

// 5. 關閉遊戲區域 (遊戲結束時用到)
function closeGameArea() {
    console.log("正在關閉戰鬥區域，返回主頁面...");

    // 1. 隱藏整個遊戲容器 (包含截圖中的「龍王VS勇者」、技能按鈕、連線狀態)
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.classList.add('hidden');
    }

    // 2. 隱藏網頁戰鬥區塊 (確保角色圖片也隱藏)
    const webBattleArea = document.getElementById('webBattleArea');
    if (webBattleArea) {
        webBattleArea.style.display = 'none';
    }

    // 3. ★★★ 關鍵修改：強制隱藏玩家名稱輸入框 (Modal) ★★★
    // 這樣就不會跳出「戰鬥準備」視窗，而是停留在主頁面
    const modal = document.getElementById('playerNameModal');
    if (modal) {
        modal.style.display = 'none'; 
    }

    // 4. 清除頂部的狀態文字 (截圖最上方的「自動戰鬥進行中...」)
    const gameStatus = document.getElementById('gameStatus');
    if (gameStatus) {
        gameStatus.innerText = '';
        gameStatus.className = 'game-status-tech'; // 重置樣式
    }

    // 5. 重置連線狀態文字
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) {
        connectionStatus.innerText = '等待連接...';
    }
    
    // 6. 重置遊戲變數
    currentGameId = null;
    isAutoMode = false;
    if (typeof autoTimer !== 'undefined' && autoTimer) {
        clearTimeout(autoTimer);
    }

    // 7. 重置血量顯示 (讓下次打開時不會顯示殘血)
    const dHp = document.getElementById('dragonHp');
    const pHp = document.getElementById('personHp');
    if(dHp) dHp.innerText = '20';
    if(pHp) pHp.innerText = '20';
}

// 6. 顯示通知 (如果 ui.js 沒定義的話)
if (typeof showRealtimeNotification === 'undefined') {
    window.showRealtimeNotification = function(data) {
        const notif = document.createElement('div');
        notif.style.position = 'fixed';
        notif.style.bottom = '20px';
        notif.style.right = '20px';
        notif.style.background = data.type === 'error' ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 255, 255, 0.8)';
        notif.style.padding = '15px';
        notif.style.borderRadius = '5px';
        notif.style.color = 'white';
        notif.style.zIndex = '10000';
        notif.innerText = data.message || data.title;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 3000);
    };
}

// 綁定到 window 讓 index.html 按鈕可以呼叫
window.startWebGameBackend = startWebGameBackend;
window.sendAction = sendAction;

// === 補上缺失的模態框與啟動邏輯 (貼在 game.js 最下方) ===

let selectedDisplayMode = 'web'; // 預設為網頁版

// 1. 選擇模式 (被 index.html 的模式按鈕呼叫)
function selectMode(mode) {
    selectedDisplayMode = mode;
    
    // 更新按鈕樣式 (Highlight 選中的項目)
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

// 2. 啟動遊戲 (被 index.html 的「確認設定」按鈕呼叫)
async function startGame() {
    // 1. 取得並儲存輸入的設定
    const nameInput = document.getElementById('playerNameInput');
    const finalName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : '匿名玩家';

    currentPlayerName = finalName;
    window.GameConfig.currentPlayerName = finalName;
    localStorage.setItem('playerName', finalName);

    sessionStorage.setItem('isPlayerReady', 'true');

    if (typeof updatePlayerNameDisplay === 'function') {
        updatePlayerNameDisplay();
    }
    
    // selectedDisplayMode 是由 selectMode() 函式設定的全域變數
    currentDisplayMode = selectedDisplayMode; 

    console.log(`[Config] 設定完成: 玩家=${currentPlayerName}, 模式=${currentDisplayMode}`);

    // 2. 隱藏模態框
    const modal = document.getElementById('playerNameModal');
    if (modal) modal.style.display = 'none';

    // 3. ★★★ 關鍵修改：確保所有戰鬥畫面都是隱藏的 ★★★
    // 因為這時候還沒按下「啟動決鬥」，所以不能顯示網頁戰鬥區，也不能顯示 Pygame 提示
    document.getElementById('gameContainer').classList.add('hidden');
    document.getElementById('webBattleArea').style.display = 'none';
    document.getElementById('pygameMessage').classList.add('hidden');
    
    // 4. 重置連線狀態文字
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) connectionStatus.innerText = '等待啟動...';
}

// ★★★ 關鍵：綁定到 window 全域物件，讓 HTML onclick 找得到 ★★★
window.selectMode = selectMode;
window.startGame = startGame;
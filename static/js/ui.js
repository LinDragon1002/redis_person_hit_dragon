// ========== 粒子系統 ==========
class ParticleSystem {
    constructor() {
        this.canvas = document.getElementById('particleCanvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.createParticles();
        this.animate();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createParticles() {
        const count = 50;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 2 + 1,
                color: Math.random() > 0.5 ? 'rgba(0, 255, 255, 0.5)' : 'rgba(255, 0, 255, 0.5)'
            });
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.fill();
        });

        // 繪製連線
        this.particles.forEach((p1, i) => {
            this.particles.slice(i + 1).forEach(p2 => {
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 150) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.strokeStyle = `rgba(0, 255, 255, ${0.2 * (1 - dist / 150)})`;
                    this.ctx.lineWidth = 0.5;
                    this.ctx.stroke();
                }
            });
        });

        requestAnimationFrame(() => this.animate());
    }
}

// ========== 通知系統 ==========
function showRealtimeNotification({ type = 'info', title, message, duration = 3000 }) {
    const container = document.getElementById('realtimeNotifications');
    if (!container) return;
    
    // 創建通知元素
    const notification = document.createElement('div');
    notification.className = `notification-item ${type}`;
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // 根據類型選擇圖標
    let icon = '<i class="fas fa-bullhorn"></i>';
    if (type === 'success') icon = '<i class="fas fa-check-circle"></i>';
    else if (type === 'warning') icon = '<i class="fas fa-exclamation-triangle"></i>';
    else if (type === 'error') icon = '<i class="fas fa-times-circle"></i>';
    
    notification.innerHTML = `
        <div class="notification-header">
            <div class="notification-title">
                <span class="notification-icon">${icon}</span>
                ${title}
            </div>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="notification-body">${message}</div>
        <div class="notification-time">${timeStr}</div>
    `;
    
    // 添加到容器
    container.insertBefore(notification, container.firstChild);
    
    // 自動移除
    if (duration > 0) {
        setTimeout(() => {
            notification.classList.add('removing');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }
    
    // 限制通知數量（最多 5 個）
    const notifications = container.querySelectorAll('.notification-item');
    if (notifications.length > 5) {
        notifications[notifications.length - 1].remove();
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification-toast';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed; top: 100px; right: 30px;
        background: linear-gradient(135deg, #ffd700, #ff8c00);
        color: #000; padding: 15px 25px; border-radius: 8px;
        font-family: var(--font-tech); font-size: 14px;
        box-shadow: 0 0 30px rgba(255, 215, 0, 0.6);
        z-index: 1000;
        animation: slideIn 0.5s ease, slideOut 0.5s ease 2.5s;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function playNotificationSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}

// ========== HTML 生成器 ==========
function createGameItemHTML(game) {
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
    
    return `
        <div class="game-item-tech winner-${winnerClass} new-game-highlight" data-game-id="${game.game_id}">
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
                    <div style="color: #fff; font-weight: 700; font-size: 16px;">${game.total_rounds}</div>
                </div>
                <div style="text-align: center; padding: 8px; background: rgba(255,51,102,0.1); border-radius: 6px;">
                    <div style="color: #888; font-size: 11px;">龍王 HP</div>
                    <div style="color: #ff3366; font-weight: 700; font-size: 16px;">${game.dragon_stats.final_hp}</div>
                </div>
                <div style="text-align: center; padding: 8px; background: rgba(0,217,255,0.1); border-radius: 6px;">
                    <div style="color: #888; font-size: 11px;">勇者 HP</div>
                    <div style="color: #00d9ff; font-weight: 700; font-size: 16px;">${game.person_stats.final_hp}</div>
                </div>
                <div style="text-align: center; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 6px;">
                    <div style="color: #888; font-size: 11px;">龍王傷害</div>
                    <div style="color: #fff; font-weight: 700; font-size: 16px;">${game.dragon_stats.total_damage_dealt}</div>
                </div>
                <div style="text-align: center; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 6px;">
                    <div style="color: #888; font-size: 11px;">勇者傷害</div>
                    <div style="color: #fff; font-weight: 700; font-size: 16px;">${game.person_stats.total_damage_dealt}</div>
                </div>
            </div>
        </div>
    `;
}

// 添加 CSS 動畫
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
    #realtimeNotifications { overflow: hidden !important; padding-right: 0 !important; scrollbar-width: none; -ms-overflow-style: none; }
    #realtimeNotifications::-webkit-scrollbar { display: none; }
`;
document.head.appendChild(style);
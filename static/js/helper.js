function setupHelpModal() {
            const helpBtn = document.getElementById('helpBtn');
            const helpModal = document.getElementById('helpModal');
            const closeBtn = document.getElementById('closeHelpModal');
            
            helpBtn?.addEventListener('click', () => helpModal.style.display = 'flex');
            closeBtn?.addEventListener('click', () => helpModal.style.display = 'none');
            window.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.style.display = 'none'; });
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
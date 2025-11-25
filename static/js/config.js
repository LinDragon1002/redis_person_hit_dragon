// 全域狀態管理
window.GameConfig = {
    winRateChart: null,
    soundEnabled: true,
    currentPlayerName: localStorage.getItem("playerName") || "",
    socket: null,
    // 新增：難度設定 (easy, normal, hard)
    difficulty: localStorage.getItem("gameDifficulty") || "normal"
};

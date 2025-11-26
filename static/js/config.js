// 全域狀態管理
window.GameConfig = {
    winRateChart: null,
    soundEnabled: true,
    currentPlayerName: localStorage.getItem("playerName") || "",
    socket: null,
    // 難度設定 (easy, normal, hard)
    difficulty: localStorage.getItem("gameDifficulty") || "normal",
    // 顯示模式 (web, pygame)
    displayMode: "web"
};

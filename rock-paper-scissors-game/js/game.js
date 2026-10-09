document.addEventListener('DOMContentLoaded', () => {
    // Game State
    let playerScore = 0;
    let cpuScore = 0;
    let totalRounds = 0;
    let currentStreak = 0;
    let isPlaying = false;

    // Weapon mappings
    const weapons = {
        rock: { name: 'Rock', icon: '🪨', beats: 'scissors' },
        paper: { name: 'Paper', icon: '📄', beats: 'rock' },
        scissors: { name: 'Scissors', icon: '✂️', beats: 'paper' }
    };

    const weaponKeys = { '1': 'rock', '2': 'paper', '3': 'scissors' };

    // DOM Elements
    const playerScoreEl = document.getElementById('player-score');
    const cpuScoreEl = document.getElementById('cpu-score');
    const totalRoundsEl = document.getElementById('total-rounds');
    const winRateEl = document.getElementById('win-rate');
    const streakCountEl = document.getElementById('streak-count');
    
    const roundStatusEl = document.getElementById('round-status');
    const battleOutcomeEl = document.getElementById('battle-outcome');
    
    const playerAvatarEl = document.getElementById('player-avatar');
    const cpuAvatarEl = document.getElementById('cpu-avatar');
    const playerCardEl = document.getElementById('player-fighter-card');
    const cpuCardEl = document.getElementById('cpu-fighter-card');
    
    const weaponBtns = document.querySelectorAll('.weapon-btn');
    const resetBtn = document.getElementById('reset-btn');
    const rulesBtn = document.getElementById('rules-btn');
    const closeModalBtn = document.getElementById('close-modal');
    const rulesModal = document.getElementById('rules-modal');

    // Event Listeners for Weapons
    weaponBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const choice = btn.getAttribute('data-choice');
            playRound(choice);
        });
    });

    // Keyboard support (1, 2, 3)
    document.addEventListener('keydown', (e) => {
        if (rulesModal.classList.contains('active')) return;
        if (weaponKeys[e.key] && !isPlaying) {
            playRound(weaponKeys[e.key]);
        }
    });

    // Reset Match
    resetBtn.addEventListener('click', () => {
        playerScore = 0;
        cpuScore = 0;
        totalRounds = 0;
        currentStreak = 0;
        updateUI();
        
        playerAvatarEl.textContent = '❓';
        cpuAvatarEl.textContent = '❓';
        battleOutcomeEl.textContent = 'READY';
        battleOutcomeEl.className = 'battle-outcome-badge';
        roundStatusEl.textContent = 'Choose your weapon to initiate duel';
    });

    // Rules Modal toggles
    rulesBtn.addEventListener('click', () => {
        rulesModal.classList.add('active');
    });

    closeModalBtn.addEventListener('click', () => {
        rulesModal.classList.remove('active');
    });

    rulesModal.addEventListener('click', (e) => {
        if (e.target === rulesModal) {
            rulesModal.classList.remove('active');
        }
    });

    // Core Game Logic
    function playRound(playerChoice) {
        if (isPlaying) return;
        isPlaying = true;

        const playerWeapon = weapons[playerChoice];
        const cpuChoiceKey = getCpuChoice();
        const cpuWeapon = weapons[cpuChoiceKey];

        // Reset badge & animations
        battleOutcomeEl.textContent = 'FIGHTING...';
        battleOutcomeEl.className = 'battle-outcome-badge';
        roundStatusEl.textContent = 'Quantum duel in progress...';

        playerAvatarEl.textContent = '⚡';
        cpuAvatarEl.textContent = '⚡';

        playerCardEl.classList.add('animate-shake');
        cpuCardEl.classList.add('animate-shake');

        // Delay for dramatic effect
        setTimeout(() => {
            playerCardEl.classList.remove('animate-shake');
            cpuCardEl.classList.remove('animate-shake');

            // Reveal choices
            playerAvatarEl.textContent = playerWeapon.icon;
            cpuAvatarEl.textContent = cpuWeapon.icon;

            playerCardEl.classList.add('animate-pulse');
            cpuCardEl.classList.add('animate-pulse');

            setTimeout(() => {
                playerCardEl.classList.remove('animate-pulse');
                cpuCardEl.classList.remove('animate-pulse');
            }, 400);

            totalRounds++;

            // Determine Winner
            if (playerChoice === cpuChoiceKey) {
                // Tie
                battleOutcomeEl.textContent = 'TIE';
                battleOutcomeEl.className = 'battle-outcome-badge tie';
                roundStatusEl.textContent = `Both selected ${playerWeapon.name}. Stalemate!`;
                currentStreak = 0;
            } else if (playerWeapon.beats === cpuChoiceKey) {
                // Player Win
                playerScore++;
                currentStreak = Math.max(1, currentStreak + 1);
                battleOutcomeEl.textContent = 'VICTORY';
                battleOutcomeEl.className = 'battle-outcome-badge win';
                roundStatusEl.textContent = `${playerWeapon.name} defeats ${cpuWeapon.name}. You win this round!`;
            } else {
                // CPU Win
                cpuScore++;
                currentStreak = 0;
                battleOutcomeEl.textContent = 'DEFEAT';
                battleOutcomeEl.className = 'battle-outcome-badge lose';
                roundStatusEl.textContent = `${cpuWeapon.name} defeats ${playerWeapon.name}. Quantum AI claims victory!`;
            }

            updateUI();
            isPlaying = false;
        }, 700);
    }

    function getCpuChoice() {
        const keys = Object.keys(weapons);
        const randomIndex = Math.floor(Math.random() * keys.length);
        return keys[randomIndex];
    }

    function updateUI() {
        playerScoreEl.textContent = playerScore;
        cpuScoreEl.textContent = cpuScore;
        totalRoundsEl.textContent = totalRounds;
        streakCountEl.textContent = currentStreak;

        const winRate = totalRounds > 0 ? Math.round((playerScore / totalRounds) * 100) : 0;
        winRateEl.textContent = `${winRate}%`;
    }
});

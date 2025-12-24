export class GameEngine {
    constructor() {
        this.words = [
            // IA / LLM (≤ 6 letras)
            "token", "prompt", "rag", "vector",
            "memory", "window",
            "feature",

            // Kubernetes / Cloud (≤ 6 letras)
            "helm", "kind", "k9s",
            "aws", "az",

            // Docker / Contenedores (≤ 6 letras)
            "docker", "image", "volume",
            "build", "push", "pull", "run", "exec",

            // Linux / CLI (≤ 6 letras)
            "ls", "cd", "pwd", "cp", "mv", "rm", "cat", "tail",
            "head", "grep", "awk", "sed", "chmod",
            "ps", "top", "htop", "kill", "curl", "wget",
            "ssh", "scp", "ping", "uname", "dmesg",
            "mount", "umount", "df", "du",

            // Extra informática / sistemas / dev (≤ 6 letras)
            "cache", "queue", "stack", "heap", "mutex",
            "thread", "async", "await", "event",
            "socket", "tcp", "udp", "http", "https",
            "json", "yaml", "proto",
            "redis", "mysql", "sqlite",
            "nginx", "proxy", "load",
            "auth", "token",
            "build", "debug", "trace",
            "hash", "crypt", "sha",
            "vscode", "vim", "nano",
            "linux", "unix", "posix"
        ];


        this.currentWord = "";
        this.score = 0;
        this.combo = 0;

        // Mode & State
        this.mode = 'normal'; // 'normal', 'zen', 'chaos'
        this.isPlaying = false;
        this.timer = null;

        // Persistence (Ephemeral points, persistent unlocks logic externally handled)
        this.totalScore = 0;

        // Round System
        this.round = 1;
        this.roundDuration = 0; // Current time in round
        this.maxRoundDuration = 20; // 2 minutes to survive
        this.totalRounds = 10;

        // Survival Timer
        this.maxTime = 60;
        this.currentTime = this.maxTime;

        this.listeners = {};
    }

    init() {
        this.resetGame('normal');
    }

    resetGame(mode = 'normal') {
        this.mode = mode;
        this.score = 0;
        this.combo = 0;
        this.round = 1;
        this.roundDuration = 0;
        this.isPlaying = false;

        // Config based on mode
        if (this.mode === 'zen') {
            this.maxTime = 999;
            this.currentTime = 999;
        } else if (this.mode === 'chaos') {
            this.maxTime = 30; // Starts faster
            this.currentTime = this.maxTime;
        } else {
            // Normal
            this.maxTime = 60;
            this.currentTime = this.maxTime;
        }

        if (this.timer) clearInterval(this.timer);

        // Emit initial
        setTimeout(() => {
            this.emit('update-hud', this.getHUDState());
        }, 0);
    }

    startGame(mode) {
        if (mode) this.resetGame(mode);
        this.isPlaying = true;
        this.nextWord();
        this.startTimer();
        this.emit('game-start', { mode: this.mode });
    }

    startTimer() {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            if (!this.isPlaying) return;

            // 1. Survival Timer Logic
            if (this.mode !== 'zen') {
                let decay = 0.1;

                // Difficulty scaling
                if (this.mode === 'normal') {
                    // Easy (1-2), Med (3-5), Hard (6-10)
                    if (this.round <= 2) decay = 0.1;
                    else if (this.round <= 5) decay = 0.15;
                    else decay = 0.25;
                } else if (this.mode === 'chaos') {
                    decay = 0.4; // Ultra fast
                }

                this.currentTime -= decay;
                if (this.currentTime <= 0) {
                    this.gameOver();
                    return;
                }
            }

            // 2. Round Progression Logic (Normal Mode Only)
            if (this.mode === 'normal') {
                this.roundDuration += 0.1;

                // Progress check
                if (this.roundDuration >= this.maxRoundDuration) {
                    this.advanceRound();
                }
            }

            this.emit('update-timer', {
                time: this.currentTime,
                max: this.maxTime,
                roundProgress: (this.roundDuration / this.maxRoundDuration) * 100 // For round bar if needed
            });

        }, 100);
    }

    advanceRound() {
        if (this.round >= this.totalRounds) {
            this.gameWin();
        } else {
            this.round++;
            this.roundDuration = 0;
            // Heal partial time on round change?
            if (this.mode !== 'zen') this.currentTime = Math.min(this.maxTime, this.currentTime + 10);
            this.emit('round-change', { round: this.round });
            this.emit('update-hud', this.getHUDState());
        }
    }

    nextWord() {
        const baseWord = this.words[Math.floor(Math.random() * this.words.length)];

        if (this.mode === 'chaos') {
            // Apply simple corruptions: add char, remove char, or swap
            this.currentWord = this.corruptWord(baseWord);
        } else {
            this.currentWord = baseWord;
        }

        this.emit('new-word', { word: this.currentWord });
    }

    corruptWord(word) {
        if (word.length < 3) return word;
        const r = Math.random();

        if (r < 0.3) {
            // Add random char
            const char = String.fromCharCode(97 + Math.floor(Math.random() * 26));
            const pos = Math.floor(Math.random() * (word.length + 1));
            return word.slice(0, pos) + char + word.slice(pos);
        } else if (r < 0.6) {
            // Remove char
            const pos = Math.floor(Math.random() * word.length);
            return word.slice(0, pos) + word.slice(pos + 1);
        } else {
            // Swap (if possible) or just return original
            const pos = Math.floor(Math.random() * (word.length - 1));
            return word.slice(0, pos) + word[pos + 1] + word[pos] + word.slice(pos + 2);
        }
    }

    validateInput(text) {
        if (!this.isPlaying) return;

        // Force max length constraint (just in case UI didn't catch it)
        if (text.length > 12) {
            // We can return a 'block' action or just process truncated? 
            // Let's rely on UI to limit, but here we process what we get.
        }

        const cleanText = text.trim().toLowerCase();
        const target = this.currentWord;

        // Perfect Match
        if (cleanText === target) {
            this.wordCompleted();
            return { action: 'clear' };
        }

        let matchLength = 0;
        let isError = false;
        let errorIndex = -1;

        for (let i = 0; i < cleanText.length; i++) {
            if (i >= target.length) {
                isError = true;
                errorIndex = i;
                break;
            }
            if (cleanText[i] === target[i]) {
                matchLength++;
            } else {
                isError = true;
                errorIndex = i;
                break;
            }
        }

        if (isError) {
            this.emit('mascot-error');
            if (this.mode !== 'zen') {
                // Penalty
                this.currentTime = Math.max(0, this.currentTime - 1.0);
            }
            if (this.combo > 0) {
                this.combo = 0;
                this.emit('update-hud', this.getHUDState());
            }
        } else {
            this.emit('mascot-typing');
        }

        this.emit('input-check', {
            matchLength: matchLength,
            isError: isError,
            errorIndex: errorIndex,
            inputLength: cleanText.length
        });

        return { action: 'continue' };
    }

    wordCompleted() {
        const points = 10 + (this.combo * 2);
        this.score += points;
        this.totalScore += points; // Ephemeral

        this.combo++;

        // Healing Logic
        if (this.mode === 'normal') {
            // Healing reduces with difficulty
            let cure = 2; // Easy
            if (this.round > 2) cure = 1.5;
            if (this.round > 5) cure = 0.8;
            this.currentTime = Math.min(this.maxTime, this.currentTime + cure);
        } else if (this.mode === 'chaos') {
            this.currentTime = Math.min(this.maxTime, this.currentTime + 1.5);
        }

        this.emit('update-hud', this.getHUDState());
        this.emit('mascot-typing');
        this.nextWord();
    }

    gameOver() {
        this.isPlaying = false;
        clearInterval(this.timer);
        this.emit('game-over', { score: this.score, totalScore: this.totalScore });
    }

    gameWin() {
        this.isPlaying = false;
        clearInterval(this.timer);
        this.emit('game-win', { score: this.score, totalScore: this.totalScore });
    }

    getHUDState() {
        return {
            score: this.score,
            totalScore: this.totalScore,
            combo: this.combo,
            round: this.round,
            totalRounds: this.totalRounds,
            mode: this.mode,
            time: this.currentTime
        };
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
}

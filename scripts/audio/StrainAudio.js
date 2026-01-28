export class StrainAudio {
    constructor() {
        this.audioCtx = null;
        this.oscillator = null;
        this.gainNode = null;
        this.filterNode = null;
        this.enabled = false;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

            this.oscillator = this.audioCtx.createOscillator();
            this.oscillator.type = 'sine';
            this.oscillator.frequency.setValueAtTime(50, this.audioCtx.currentTime);

            this.filterNode = this.audioCtx.createBiquadFilter();
            this.filterNode.type = 'lowpass';
            this.filterNode.frequency.setValueAtTime(800, this.audioCtx.currentTime);
            this.filterNode.Q.setValueAtTime(1, this.audioCtx.currentTime);

            this.gainNode = this.audioCtx.createGain();
            this.gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);

            this.oscillator.connect(this.filterNode);
            this.filterNode.connect(this.gainNode);
            this.gainNode.connect(this.audioCtx.destination);

            this.oscillator.start();

            this.initialized = true;
            this.enabled = true;
        } catch (error) {
        }
    }

    updateStrain(totalStrainEnergy, maxStrainEnergy = 10000) {
        if (!this.initialized || !this.enabled) return;

        const strainRatio = Math.min(totalStrainEnergy / maxStrainEnergy, 1.0);

        const currentTime = this.audioCtx.currentTime;
        const rampTime = 0.1;

        const frequency = 50 + strainRatio * 200;
        this.oscillator.frequency.linearRampToValueAtTime(
            frequency,
            currentTime + rampTime
        );

        const volume = strainRatio * 0.15;
        this.gainNode.gain.linearRampToValueAtTime(
            volume,
            currentTime + rampTime
        );

        if (strainRatio < 0.3) {
            this.oscillator.type = 'sine';
        } else if (strainRatio < 0.6) {
            this.oscillator.type = 'triangle';
        } else if (strainRatio < 0.8) {
            this.oscillator.type = 'square';
        } else {
            this.oscillator.type = 'sawtooth';
        }

        const filterFreq = 400 + strainRatio * 1200;
        this.filterNode.frequency.linearRampToValueAtTime(
            filterFreq,
            currentTime + rampTime
        );
    }

    triggerFailureSound() {
        if (!this.initialized || !this.enabled) return;

        const currentTime = this.audioCtx.currentTime;

        this.oscillator.frequency.setValueAtTime(400, currentTime);
        this.oscillator.frequency.linearRampToValueAtTime(100, currentTime + 0.2);

        this.gainNode.gain.setValueAtTime(0.3, currentTime);
        this.gainNode.gain.linearRampToValueAtTime(0, currentTime + 0.2);
    }

    toggle() {
        this.enabled = !this.enabled;

        if (!this.enabled) {
            const currentTime = this.audioCtx.currentTime;
            this.gainNode.gain.linearRampToValueAtTime(0, currentTime + 0.5);
        }

        return this.enabled;
    }

    setEnabled(enabled) {
        if (enabled && !this.initialized) {
            this.initialize();
        } else {
            this.enabled = enabled;
        }
    }

    cleanup() {
        if (this.oscillator) {
            this.oscillator.stop();
        }
        if (this.audioCtx) {
            this.audioCtx.close();
        }
        this.initialized = false;
        this.enabled = false;
    }
}

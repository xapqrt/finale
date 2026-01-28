export class StrainCalculator {
    constructor() {
    }

    calculateAllStrains(elements, displacements) {
        let maxStrain = 0;
        let totalStrainEnergy = 0;
        let failedCount = 0;

        for (let element of elements) {
            if (element.failed) {
                failedCount++;
                continue;
            }

            const strain = element.calculateStrain(displacements);
            maxStrain = Math.max(maxStrain, Math.abs(strain));
            totalStrainEnergy += element.getStrainEnergy();
        }

        return {
            maxStrain,
            totalStrainEnergy,
            failedCount,
            activeElements: elements.length - failedCount
        };
    }

    getHeatmapColor(stressRatio) {
        if (stressRatio > 1.0) {
            const flash = Math.sin(Date.now() * 0.01) > 0 ? 1.0 : 0.5;
            return `rgba(255, 0, 255, ${flash})`;
        }

        const t = Math.min(Math.max(stressRatio, 0), 1);

        let r, g, b;

        if (t < 0.25) {
            const local_t = t / 0.25;
            r = 0;
            g = 229 + (255 - 229) * local_t;
            b = 255 * (1 - local_t);
        } else if (t < 0.5) {
            const local_t = (t - 0.25) / 0.25;
            r = 255 * local_t;
            g = 255;
            b = 0;
        } else if (t < 0.75) {
            const local_t = (t - 0.5) / 0.25;
            r = 255;
            g = 255 - 119 * local_t;
            b = 0;
        } else {
            const local_t = (t - 0.75) / 0.25;
            r = 255;
            g = 136 * (1 - local_t);
            b = 0;
        }

        return `rgb(${r|0}, ${g|0}, ${b|0})`;
    }

    getLineWidth(strain) {
        const base = 2;
        const scale = 20;
        return base + Math.abs(strain) * scale;
    }

    getChromaticAberration(maxStrain) {
        return Math.min(maxStrain * 50, 10);
    }
}

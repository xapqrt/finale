import { StrainCalculator } from '../FEA/StrainCalculator.js';

export class CanvasRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.strainCalc = new StrainCalculator();

        this.showNodes = true;
        this.showStrain = true;
        this.chromaticAberration = false;
        this.lineWidthScale = 1.0;
        this.displacementScale = 8.0;
    }

    clear() {
        this.ctx.fillStyle = '#0a0e27';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    renderTruss(nodes, elements, displacements) {
        if (nodes.length === 0) {
            console.warn('[RENDERER] No nodes to render!');
            return;
        }
        if (elements.length === 0) {
            console.warn('[RENDERER] No elements to render!');
            return;
        }
        
        this.clear();

        let maxStrain = 0;
        for (let element of elements) {
            if (!element.failed) {
                maxStrain = Math.max(maxStrain, Math.abs(element.strain));
            }
        }

        if (this.chromaticAberration && maxStrain > 0.01) {
            this.renderWithAberration(nodes, elements, displacements, maxStrain);
        } else {
            this.renderElements(nodes, elements, displacements);
        }

        if (this.showNodes) {
            this.renderNodes(nodes, displacements);
        }
    }

    renderElements(nodes, elements, displacements, offset = {dx: 0, dy: 0}, alpha = 1.0) {
        let renderedCount = 0;
        let failedCount = 0;
        
        for (let element of elements) {
            if (element.failed) {
                failedCount++;
                continue;
            }
            
            renderedCount++;

            const stressRatio = element.getStressRatio();
            const color = this.strainCalc.getHeatmapColor(stressRatio);

            let lineWidth = this.strainCalc.getLineWidth(element.strain);
            lineWidth *= this.lineWidthScale;

            const n1 = element.n1;
            const n2 = element.n2;

            const scale = this.displacementScale;
            const u1x = (displacements[2 * n1] || 0) * scale;
            const u1y = (displacements[2 * n1 + 1] || 0) * scale;
            const u2x = (displacements[2 * n2] || 0) * scale;
            const u2y = (displacements[2 * n2 + 1] || 0) * scale;

            const x1 = nodes[n1].x + u1x + offset.dx;
            const y1 = nodes[n1].y + u1y + offset.dy;
            const x2 = nodes[n2].x + u2x + offset.dx;
            const y2 = nodes[n2].y + u2y + offset.dy;

            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = lineWidth * 1.5;
            this.ctx.lineCap = 'round';
            this.ctx.globalAlpha = alpha;
            this.ctx.shadowBlur = 3;
            this.ctx.shadowColor = color;

            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
            
            this.ctx.shadowBlur = 0;
        }

        if (renderedCount === 0 && elements.length > 0) {
            console.warn(`[RENDERER] No elements rendered! Failed: ${failedCount}/${elements.length}`);
        }

        this.ctx.globalAlpha = 1.0;
    }

    renderWithAberration(nodes, elements, displacements, maxStrain) {
        const aberration = this.strainCalc.getChromaticAberration(maxStrain);

        this.ctx.globalCompositeOperation = 'lighten';
        this.ctx.save();
        this.renderElementsMonochrome(nodes, elements, displacements,
            {dx: -aberration, dy: 0}, 'rgba(255, 0, 0, 0.8)');
        this.ctx.restore();

        this.ctx.save();
        this.renderElementsMonochrome(nodes, elements, displacements,
            {dx: 0, dy: 0}, 'rgba(0, 255, 0, 0.8)');
        this.ctx.restore();

        this.ctx.save();
        this.renderElementsMonochrome(nodes, elements, displacements,
            {dx: aberration, dy: 0}, 'rgba(0, 0, 255, 0.8)');
        this.ctx.restore();

        this.ctx.globalCompositeOperation = 'source-over';
    }

    renderElementsMonochrome(nodes, elements, displacements, offset, color) {
        for (let element of elements) {
            if (element.failed) continue;

            const lineWidth = this.strainCalc.getLineWidth(element.strain);

            const n1 = element.n1;
            const n2 = element.n2;

            const u1x = (displacements[2 * n1] || 0) * this.displacementScale;
            const u1y = (displacements[2 * n1 + 1] || 0) * this.displacementScale;
            const u2x = (displacements[2 * n2] || 0) * this.displacementScale;
            const u2y = (displacements[2 * n2 + 1] || 0) * this.displacementScale;

            const x1 = nodes[n1].x + u1x + offset.dx;
            const y1 = nodes[n1].y + u1y + offset.dy;
            const x2 = nodes[n2].x + u2x + offset.dx;
            const y2 = nodes[n2].y + u2y + offset.dy;

            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = lineWidth;
            this.ctx.lineCap = 'round';

            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
        }
    }

    renderNodes(nodes, displacements) {
        for (let i = 0; i < nodes.length; i++) {
            const ux = (displacements[2 * i] || 0) * this.displacementScale;
            const uy = (displacements[2 * i + 1] || 0) * this.displacementScale;

            const x = nodes[i].x + ux;
            const y = nodes[i].y + uy;

            const isFixed = nodes[i].fixed;
            this.ctx.fillStyle = isFixed ? '#ffaa00' : '#00e5ff';

            this.ctx.beginPath();
            this.ctx.arc(x, y, isFixed ? 5 : 3, 0, Math.PI * 2);
            this.ctx.fill();

            if (nodes.length < 50) {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.font = '10px monospace';
                this.ctx.fillText(i, x + 7, y - 7);
            }
        }
    }

    renderGrid(spacing = 50) {
        this.ctx.strokeStyle = 'rgba(0, 229, 255, 0.1)';
        this.ctx.lineWidth = 1;

        for (let x = 0; x < this.canvas.width; x += spacing) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        for (let y = 0; y < this.canvas.height; y += spacing) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawText(text, x, y, options = {}) {
        const fontSize = options.fontSize || 14;
        const color = options.color || '#00e5ff';
        const align = options.align || 'left';

        this.ctx.fillStyle = color;
        this.ctx.font = `${fontSize}px monospace`;
        this.ctx.textAlign = align;
        this.ctx.fillText(text, x, y);
    }
}

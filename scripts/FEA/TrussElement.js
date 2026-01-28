export class TrussElement {
    constructor(node1Index, node2Index, nodes, E = 200e9, A = 0.01, yieldStress = 250e6) {
        this.n1 = node1Index;
        this.n2 = node2Index;
        this.nodes = nodes;
        
        this.E = E;
        this.A = A;
        this.yieldStress = yieldStress;
        this.yieldStrain = yieldStress / E;
        
        this.failed = false;
        this.strain = 0;
        this.stress = 0;
        
        this.L = 0;
        this.L_original = 0;
        this.c = 0;
        this.s = 0;
        this.k = null;
        
        this.updateGeometry();
        this.L_original = this.L;
    }
    
    updateGeometry() {
        const dx = this.nodes[this.n2].x - this.nodes[this.n1].x;
        const dy = this.nodes[this.n2].y - this.nodes[this.n1].y;
        this.L = Math.sqrt(dx * dx + dy * dy);
        
        if (this.L < 1e-6) this.L = 1e-6;
        
        this.c = dx / this.L;
        this.s = dy / this.L;
        
        const k_factor = (this.E * this.A) / this.L;
        
        const c2 = this.c * this.c;
        const s2 = this.s * this.s;
        const cs = this.c * this.s;
        
        this.k = [
            [ k_factor * c2,  k_factor * cs, -k_factor * c2, -k_factor * cs],
            [ k_factor * cs,  k_factor * s2, -k_factor * cs, -k_factor * s2],
            [-k_factor * c2, -k_factor * cs,  k_factor * c2,  k_factor * cs],
            [-k_factor * cs, -k_factor * s2,  k_factor * cs,  k_factor * s2]
        ];
    }
    
    getGlobalIndices() {
        return [
            2 * this.n1,
            2 * this.n1 + 1,
            2 * this.n2,
            2 * this.n2 + 1
        ];
    }
    
    calculateStrain(displacements) {
        const u1x = displacements[2 * this.n1] || 0;
        const u1y = displacements[2 * this.n1 + 1] || 0;
        const u2x = displacements[2 * this.n2] || 0;
        const u2y = displacements[2 * this.n2 + 1] || 0;
        
        const x1_new = this.nodes[this.n1].x + u1x;
        const y1_new = this.nodes[this.n1].y + u1y;
        const x2_new = this.nodes[this.n2].x + u2x;
        const y2_new = this.nodes[this.n2].y + u2y;
        
        const dx_new = x2_new - x1_new;
        const dy_new = y2_new - y1_new;
        const L_new = Math.sqrt(dx_new * dx_new + dy_new * dy_new);
        
        this.strain = (L_new - this.L_original) / this.L_original;
        this.stress = this.E * this.strain;
        
        if (Math.abs(this.stress) > this.yieldStress && !this.failed) {
            this.failed = true;
        }
        
        return this.strain;
    }
    
    getStrainEnergy() {
        if (this.failed) return 0;
        return 0.5 * this.E * this.strain * this.strain * this.A * this.L_original;
    }
    
    getStressRatio() {
        return Math.abs(this.stress) / this.yieldStress;
    }
}

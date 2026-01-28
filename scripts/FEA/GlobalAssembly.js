export class GlobalAssembly {
    constructor(numNodes) {
        this.numNodes = numNodes;
        this.dof = numNodes * 2;
        this.K = this.createSparseMatrix();
        this.F = new Float64Array(this.dof);
        this.bc = new Set();
    }
    
    createSparseMatrix() {
        const matrix = new Map();
        for (let i = 0; i < this.dof; i++) {
            matrix.set(i, new Map());
        }
        return matrix;
    }
    
    reset() {
        this.K = this.createSparseMatrix();
        this.F.fill(0);
    }
    
    addElement(element) {
        const indices = element.getGlobalIndices();
        const k_local = element.k;
        
        for (let i = 0; i < 4; i++) {
            const globalI = indices[i];
            if (this.bc.has(globalI)) continue;
            
            for (let j = 0; j < 4; j++) {
                const globalJ = indices[j];
                if (this.bc.has(globalJ)) continue;
                
                const currentValue = this.K.get(globalI).get(globalJ) || 0;
                this.K.get(globalI).set(globalJ, currentValue + k_local[i][j]);
            }
        }
    }
    
    applyForce(nodeIndex, fx, fy) {
        const dofX = nodeIndex * 2;
        const dofY = nodeIndex * 2 + 1;
        
        if (!this.bc.has(dofX)) this.F[dofX] += fx;
        if (!this.bc.has(dofY)) this.F[dofY] += fy;
    }
    
    fixNode(nodeIndex) {
        this.bc.add(nodeIndex * 2);
        this.bc.add(nodeIndex * 2 + 1);
    }
    
    fixDOF(nodeIndex, direction) {
        const dof = direction === 'x' ? nodeIndex * 2 : nodeIndex * 2 + 1;
        this.bc.add(dof);
    }
    
    toDenseMatrix() {
        const dense = [];
        for (let i = 0; i < this.dof; i++) {
            dense[i] = new Float64Array(this.dof);
            const row = this.K.get(i);
            for (let [j, value] of row) {
                dense[i][j] = value;
            }
        }
        return dense;
    }
    
    getSparsity() {
        let nonZero = 0;
        for (let [i, row] of this.K) {
            nonZero += row.size;
        }
        const total = this.dof * this.dof;
        const sparsity = 100 * (1 - nonZero / total);
        return { nonZero, total, sparsity };
    }
}

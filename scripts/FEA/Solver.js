export class Solver {
    solve(assembly) {
        
        const startTime = performance.now();
        
        // Convert sparse K to dense (needed for Gaussian elimination)
        const K = assembly.toDenseMatrix();
        const F = new Float64Array(assembly.F);
        const dof = assembly.dof;
        
        // Apply boundary conditions by penalty method
        // For fixed DOFs: set K[i][i] = huge number, F[i] = 0
        // This forces displacement to be essentially zero
        const PENALTY = 1e20;  // Big enough to dominate the system
        
        for (let fixedDOF of assembly.bc) {
            for (let j = 0; j < dof; j++) {
                K[fixedDOF][j] = 0;
                K[j][fixedDOF] = 0;
            }
            K[fixedDOF][fixedDOF] = PENALTY;
            F[fixedDOF] = 0;
        }
        
        const x = this.gaussianElimination(K, F);
        const endTime = performance.now();
        
        return x;
    }
    
    gaussianElimination(K, F) {
        const n = F.length;
        const A = K.map(row => [...row]);
        const b = [...F];
        
        for (let k = 0; k < n - 1; k++) {
            let maxRow = k;
            let maxVal = Math.abs(A[k][k]);
            
            for (let i = k + 1; i < n; i++) {
                if (Math.abs(A[i][k]) > maxVal) {
                    maxVal = Math.abs(A[i][k]);
                    maxRow = i;
                }
            }
            
            if (maxRow !== k) {
                [A[k], A[maxRow]] = [A[maxRow], A[k]];
                [b[k], b[maxRow]] = [b[maxRow], b[k]];
            }
            
            if (Math.abs(A[k][k]) < 1e-12) continue;
            for (let i = k + 1; i < n; i++) {
                const factor = A[i][k] / A[k][k];
                A[i][k] = 0;
                
                for (let j = k + 1; j < n; j++) {
                    A[i][j] -= factor * A[k][j];
                }
                b[i] -= factor * b[k];
            }
        }
        
        const x = new Float64Array(n);
        for (let i = n - 1; i >= 0; i--) {
            if (Math.abs(A[i][i]) < 1e-12) {
                x[i] = 0;
                continue;
            }
            
            let sum = b[i];
            for (let j = i + 1; j < n; j++) {
                sum -= A[i][j] * x[j];
            }
            x[i] = sum / A[i][i];
        }
        
        return x;
    }
    
    calculateResidual(K, x, F) {
        const n = x.length;
        let residual = 0;
        
        for (let i = 0; i < n; i++) {
            let Kx_i = 0;
            const row = K[i];
            for (let j = 0; j < n; j++) {
                Kx_i += row[j] * x[j];
            }
            const diff = Kx_i - F[i];
            residual += diff * diff;
        }
        
        return Math.sqrt(residual);
    }
}

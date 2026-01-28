export class Matrix {
    static multiply(A, B) {
        const m = A.length;
        const n = B[0].length;
        const p = B.length;

        const C = Array(m).fill(0).map(() => Array(n).fill(0));

        for (let i = 0; i < m; i++) {
            for (let j = 0; j < n; j++) {
                for (let k = 0; k < p; k++) {
                    C[i][j] += A[i][k] * B[k][j];
                }
            }
        }

        return C;
    }

    static multiplyVector(A, x) {
        const m = A.length;
        const b = new Float64Array(m);

        for (let i = 0; i < m; i++) {
            for (let j = 0; j < x.length; j++) {
                b[i] += A[i][j] * x[j];
            }
        }

        return b;
    }

    static transpose(A) {
        const m = A.length;
        const n = A[0].length;
        const B = Array(n).fill(0).map(() => Array(m).fill(0));

        for (let i = 0; i < m; i++) {
            for (let j = 0; j < n; j++) {
                B[j][i] = A[i][j];
            }
        }

        return B;
    }

    static identity(n) {
        const I = Array(n).fill(0).map(() => Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            I[i][i] = 1;
        }
        return I;
    }

    static zeros(m, n) {
        return Array(m).fill(0).map(() => Array(n).fill(0));
    }
}

export class SparseMatrix {
    constructor(size) {
        this.size = size;
        this.data = new Map();
        for (let i = 0; i < size; i++) {
            this.data.set(i, new Map());
        }
    }

    set(i, j, value) {
        if (Math.abs(value) > 1e-12) {
            this.data.get(i).set(j, value);
        } else {
            this.data.get(i).delete(j);
        }
    }

    get(i, j) {
        return this.data.get(i).get(j) || 0;
    }

    add(i, j, value) {
        const current = this.get(i, j);
        this.set(i, j, current + value);
    }

    toDense() {
        const dense = Array(this.size).fill(0).map(() => new Float64Array(this.size));
        for (let [i, row] of this.data) {
            for (let [j, value] of row) {
                dense[i][j] = value;
            }
        }
        return dense;
    }

    getNonZeroCount() {
        let count = 0;
        for (let [i, row] of this.data) {
            count += row.size;
        }
        return count;
    }

    getSparsity() {
        const nonZero = this.getNonZeroCount();
        const total = this.size * this.size;
        return 100 * (1 - nonZero / total);
    }
}

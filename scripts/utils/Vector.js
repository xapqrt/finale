export class Vector {
    static dot(a, b) {
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            sum += a[i] * b[i];
        }
        return sum;
    }

    static norm(v) {
        return Math.sqrt(Vector.dot(v, v));
    }

    static add(a, b) {
        const c = new Float64Array(a.length);
        for (let i = 0; i < a.length; i++) {
            c[i] = a[i] + b[i];
        }
        return c;
    }

    static subtract(a, b) {
        const c = new Float64Array(a.length);
        for (let i = 0; i < a.length; i++) {
            c[i] = a[i] - b[i];
        }
        return c;
    }

    static scale(s, a) {
        const c = new Float64Array(a.length);
        for (let i = 0; i < a.length; i++) {
            c[i] = s * a[i];
        }
        return c;
    }

    static zeros(n) {
        return new Float64Array(n);
    }

    static from(arr) {
        return new Float64Array(arr);
    }
}

const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
bgCanvas.width = window.innerWidth;
bgCanvas.height = window.innerHeight;

class BackgroundGrid {
    constructor() {
        this.nodes = [];
        this.time = 0;

        const spacing = 80;
        for (let x = 0; x < bgCanvas.width + spacing; x += spacing) {
            for (let y = 0; y < bgCanvas.height + spacing; y += spacing) {
                this.nodes.push({
                    x: x,
                    y: y,
                    baseX: x,
                    baseY: y,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }
    }

    update() {
        this.time += 0.01;

        for (let node of this.nodes) {
            const wave = Math.sin(this.time + node.phase);
            node.x = node.baseX + wave * 3;
            node.y = node.baseY + wave * 3;
        }
    }

    draw() {
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

        bgCtx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
        bgCtx.lineWidth = 1;

        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const dx = this.nodes[j].x - this.nodes[i].x;
                const dy = this.nodes[j].y - this.nodes[i].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 85) {
                    bgCtx.beginPath();
                    bgCtx.moveTo(this.nodes[i].x, this.nodes[i].y);
                    bgCtx.lineTo(this.nodes[j].x, this.nodes[j].y);
                    bgCtx.stroke();
                }
            }
        }

        bgCtx.fillStyle = 'rgba(0, 229, 255, 0.3)';
        for (let node of this.nodes) {
            bgCtx.beginPath();
            bgCtx.arc(node.x, node.y, 2, 0, Math.PI * 2);
            bgCtx.fill();
        }
    }

    animate() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

const grid = new BackgroundGrid();
grid.animate();

document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', function() {
        const feature = this.getAttribute('data-feature');

        switch(feature) {
            case 'crane':
                window.location.href = 'features/crane.html';
                break;
            case 'turbine':
                window.location.href = 'features/turbine.html';
                break;
            case 'optimizer':
                window.location.href = 'features/optimizer.html';
                break;
            case 'collapse':
                window.location.href = 'features/collapse.html';
                break;
        }
    });
});

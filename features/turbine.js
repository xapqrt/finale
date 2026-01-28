import { TrussElement } from '../scripts/FEA/TrussElement.js';
import { GlobalAssembly } from '../scripts/FEA/GlobalAssembly.js';
import { Solver } from '../scripts/FEA/Solver.js';
import { StrainCalculator } from '../scripts/FEA/StrainCalculator.js';
import { CanvasRenderer } from '../scripts/utils/CanvasRenderer.js';
import { StrainAudio } from '../scripts/audio/StrainAudio.js';

const canvas = document.getElementById('main-canvas');
const renderer = new CanvasRenderer(canvas);

const solver = new Solver();
const strainCalc = new StrainCalculator();
const audio = new StrainAudio();

let nodes = [];
let elements = [];
let displacements = new Float64Array(0);
let shatteredPieces = [];

let angularVelocity = 0;
let targetRPM = 0;
let currentRPM = 0;
let spinning = false;
let time = 0;

const centerX = canvas.width / 2;
const centerY = canvas.height / 2;

const STEEL_E = 200e9;
const STEEL_YIELD = 250e6;
const GLASS_E = 70e9;
const GLASS_YIELD = 50e6;

function buildTurbine() {
    nodes = [];
    elements = [];
    shatteredPieces = [];

    nodes.push({ x: centerX, y: centerY, fixed: true });

    const hubRadius = 60;
    const hubNodes = 12;
    for (let i = 0; i < hubNodes; i++) {
        const angle = (i / hubNodes) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * hubRadius;
        const y = centerY + Math.sin(angle) * hubRadius;
        nodes.push({ x: x, y: y, fixed: false });

        if (i > 0) {
            elements.push(new TrussElement(i, i + 1, nodes, STEEL_E, 0.02, STEEL_YIELD));
        }
        elements.push(new TrussElement(0, i + 1, nodes, STEEL_E, 0.025, STEEL_YIELD));
    }
    elements.push(new TrussElement(1, hubNodes, nodes, STEEL_E, 0.02, STEEL_YIELD));

    const numBlades = 6;
    for (let blade = 0; blade < numBlades; blade++) {
        const bladeAngle = (blade / numBlades) * Math.PI * 2;
        const hubAttachNode = 1 + Math.floor((blade / numBlades) * hubNodes);
        
        const bladeSegments = 8;
        const bladeLength = 250;
        const bladeWidth = 40;

        let prevTopNode = hubAttachNode;
        let prevBottomNode = hubAttachNode;

        for (let seg = 1; seg <= bladeSegments; seg++) {
            const t = seg / bladeSegments;
            const r = hubRadius + bladeLength * t;
            
            const topAngle = bladeAngle + (bladeWidth / r) * 0.5;
            const bottomAngle = bladeAngle - (bladeWidth / r) * 0.5;
            
            const topX = centerX + Math.cos(topAngle) * r;
            const topY = centerY + Math.sin(topAngle) * r;
            const bottomX = centerX + Math.cos(bottomAngle) * r;
            const bottomY = centerY + Math.sin(bottomAngle) * r;

            nodes.push({ x: topX, y: topY, fixed: false });
            nodes.push({ x: bottomX, y: bottomY, fixed: false });

            const currTopNode = nodes.length - 2;
            const currBottomNode = nodes.length - 1;

            const area = 0.005 * (1 - t * 0.7);
            
            elements.push(new TrussElement(prevTopNode, currTopNode, nodes, GLASS_E, area, GLASS_YIELD));
            elements.push(new TrussElement(prevBottomNode, currBottomNode, nodes, GLASS_E, area, GLASS_YIELD));
            elements.push(new TrussElement(currTopNode, currBottomNode, nodes, GLASS_E, area * 0.8, GLASS_YIELD));
            
            if (seg > 1) {
                elements.push(new TrussElement(prevTopNode, currBottomNode, nodes, GLASS_E, area * 0.6, GLASS_YIELD));
                elements.push(new TrussElement(prevBottomNode, currTopNode, nodes, GLASS_E, area * 0.6, GLASS_YIELD));
            }

            prevTopNode = currTopNode;
            prevBottomNode = currBottomNode;
        }
    }

    displacements = new Float64Array(nodes.length * 2);
    angularVelocity = 0;
    currentRPM = 0;
}

function runFEA() {
    const assembly = new GlobalAssembly(nodes.length);
    assembly.fixNode(0);

    for (let element of elements) {
        if (!element.failed) {
            element.updateGeometry();
            assembly.addElement(element);
        }
    }

    const omega = angularVelocity;
    const omegaSq = omega * omega;

    for (let i = 1; i < nodes.length; i++) {
        const dx = nodes[i].x - centerX;
        const dy = nodes[i].y - centerY;
        const r = Math.sqrt(dx * dx + dy * dy);
        
        if (r > 1e-6) {
            const nodeMass = 5.0;
            const centrifugalForce = nodeMass * omegaSq * r;
            
            const forceX = (dx / r) * centrifugalForce;
            const forceY = (dy / r) * centrifugalForce;
            
            assembly.applyForce(i, forceX, forceY);
        }

        const vibrationForce = Math.sin(time * 30 + i) * omegaSq * 0.5;
        assembly.applyForce(i, vibrationForce, vibrationForce * 0.7);
    }

    displacements = solver.solve(assembly);

    const stats = strainCalc.calculateAllStrains(elements, displacements);

    for (let elem of elements) {
        if (elem.failed && Math.random() < 0.05) {
            createShatteredPiece(elem);
        }
    }

    updateShatteredPieces();
    updateStats(stats);
    audio.updateStrain(stats.totalStrainEnergy, 10000);

    return stats;
}

function createShatteredPiece(element) {
    const n1 = element.nodes[element.n1];
    const n2 = element.nodes[element.n2];
    
    const midX = (n1.x + n2.x) / 2;
    const midY = (n1.y + n2.y) / 2;
    
    const dx = midX - centerX;
    const dy = midY - centerY;
    const r = Math.sqrt(dx * dx + dy * dy);
    
    if (r > 1e-6) {
        const tangentVelX = -dy * angularVelocity;
        const tangentVelY = dx * angularVelocity;
        
        const radialVelX = (dx / r) * angularVelocity * r * 0.3;
        const radialVelY = (dy / r) * angularVelocity * r * 0.3;
        
        shatteredPieces.push({
            x: midX,
            y: midY,
            vx: tangentVelX + radialVelX + (Math.random() - 0.5) * 50,
            vy: tangentVelY + radialVelY + (Math.random() - 0.5) * 50,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.3,
            size: 5 + Math.random() * 8,
            life: 1.0
        });
    }
}

function updateShatteredPieces() {
    for (let i = shatteredPieces.length - 1; i >= 0; i--) {
        const piece = shatteredPieces[i];
        
        piece.x += piece.vx * 0.016;
        piece.y += piece.vy * 0.016;
        piece.vy += 200 * 0.016;
        piece.rotation += piece.rotationSpeed;
        piece.life -= 0.008;
        
        if (piece.life <= 0 || piece.y > canvas.height + 50) {
            shatteredPieces.splice(i, 1);
        }
    }
}

function updateStats(stats) {
    document.getElementById('rpm-display').textContent = Math.floor(currentRPM);
    
    const maxCentrifugalForce = 5.0 * angularVelocity * angularVelocity * 310;
    document.getElementById('force-display').textContent = Math.floor(maxCentrifugalForce) + ' N';
    
    document.getElementById('shattered-count').textContent = stats.failedCount;
    
    if (stats.failedCount > 0) {
        document.getElementById('shattered-count').classList.add('warning');
    } else {
        document.getElementById('shattered-count').classList.remove('warning');
    }
    
    const integrity = Math.max(0, 100 * (1 - stats.failedCount / elements.length));
    document.getElementById('integrity-display').textContent = integrity.toFixed(0) + '%';
}

function animate() {
    time += 0.016;

    if (spinning) {
        const rpmAcceleration = 30;
        if (currentRPM < targetRPM) {
            currentRPM = Math.min(targetRPM, currentRPM + rpmAcceleration * 0.016);
        }
    } else {
        const rpmDeceleration = 60;
        currentRPM = Math.max(0, currentRPM - rpmDeceleration * 0.016);
    }

    angularVelocity = (currentRPM * 2 * Math.PI) / 60;

    const rotationAngle = angularVelocity * 0.016;
    for (let i = 1; i < nodes.length; i++) {
        const dx = nodes[i].x - centerX;
        const dy = nodes[i].y - centerY;
        const r = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) + rotationAngle;
        nodes[i].x = centerX + Math.cos(angle) * r;
        nodes[i].y = centerY + Math.sin(angle) * r;
    }

    const stats = runFEA();

    renderer.renderTruss(nodes, elements, displacements);
    drawShatteredPieces();
    drawCenter();

    if (stats.failedCount > elements.length * 0.4) {
        spinning = false;
        targetRPM = 0;
    }

    requestAnimationFrame(animate);
}

function drawShatteredPieces() {
    const ctx = renderer.ctx;
    
    for (let piece of shatteredPieces) {
        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rotation);
        ctx.globalAlpha = piece.life;
        
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, piece.size);
        gradient.addColorStop(0, '#00ffff');
        gradient.addColorStop(0.5, '#00aaff');
        gradient.addColorStop(1, 'rgba(0, 170, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(-piece.size, -piece.size, piece.size * 2, piece.size * 2);
        
        ctx.restore();
    }
}

function drawCenter() {
    const ctx = renderer.ctx;
    
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ffaa00';
    
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 50);
    gradient.addColorStop(0, '#ffaa00');
    gradient.addColorStop(0.7, '#ff6600');
    gradient.addColorStop(1, '#aa4400');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 50, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STEEL', centerX, centerY - 5);
    ctx.fillText('HUB', centerX, centerY + 10);
}

canvas.addEventListener('click', () => {
    if (!spinning) {
        spinning = true;
        targetRPM = 100 + Math.random() * 200;
    } else {
        targetRPM = Math.min(500, targetRPM + 50);
    }
});

document.getElementById('reset-btn').addEventListener('click', () => {
    buildTurbine();
    spinning = false;
    targetRPM = 0;
});

document.getElementById('audio-btn').addEventListener('click', async function() {
    if (!audio.initialized) {
        await audio.initialize();
        this.textContent = 'DISABLE AUDIO';
    } else {
        const enabled = audio.toggle();
        this.textContent = enabled ? 'DISABLE AUDIO' : 'ENABLE AUDIO';
    }
});

document.getElementById('spin-btn').addEventListener('click', () => {
    spinning = true;
    targetRPM = Math.min(500, targetRPM + 100);
});

document.getElementById('stop-btn').addEventListener('click', () => {
    spinning = false;
    targetRPM = 0;
});

const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
bgCanvas.width = window.innerWidth;
bgCanvas.height = window.innerHeight;

function animateBg() {
    bgCtx.fillStyle = 'rgba(10, 14, 39, 0.1)';
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    bgCtx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
    bgCtx.lineWidth = 1;

    for (let i = 0; i < 8; i++) {
        const angle = time * 0.3 + i * Math.PI / 4;
        const x = bgCanvas.width / 2 + Math.cos(angle) * 200;
        const y = bgCanvas.height / 2 + Math.sin(angle) * 200;
        
        bgCtx.beginPath();
        bgCtx.arc(x, y, 50, 0, Math.PI * 2);
        bgCtx.stroke();
    }

    requestAnimationFrame(animateBg);
}

buildTurbine();
animate();
animateBg();

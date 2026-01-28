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

let cargoMass = 100;
let cargoVelocityX = 0;
let cargoVelocityY = 0;
let cargoAccelX = 0;
let cargoAccelY = 0;
let mouseX = canvas.width / 2;
let mouseY = canvas.height / 2;
let hookX = canvas.width / 2;
let hookY = 200;
let cableLength = 150;
let cableAngle = 0;
let cableAngularVel = 0;
const GRAVITY = 9.81;
const DAMPING = 0.98;
const CABLE_K = 500;

let animationRunning = true;
let time = 0;
let windForce = 0;
let structuralIntegrity = 1.0;

function buildCrane() {
    nodes = [];
    elements = [];

    const baseY = 650;
    const baseSpan = 200;
    nodes.push({ x: canvas.width/2 - baseSpan, y: baseY, fixed: true });
    nodes.push({ x: canvas.width/2 + baseSpan, y: baseY, fixed: true });
    nodes.push({ x: canvas.width/2 - baseSpan/2, y: baseY, fixed: true });
    nodes.push({ x: canvas.width/2 + baseSpan/2, y: baseY, fixed: true });

    const towerX = canvas.width / 2;
    const towerTop = 80;
    const towerSegments = 12;
    const towerWidth = 40;

    for (let i = 0; i <= towerSegments; i++) {
        const y = baseY - (baseY - towerTop) * (i / towerSegments);
        const leftX = towerX - towerWidth * (1 - i / towerSegments);
        const rightX = towerX + towerWidth * (1 - i / towerSegments);
        
        nodes.push({ x: leftX, y: y, fixed: false });
        nodes.push({ x: rightX, y: y, fixed: false });

        if (i > 0) {
            const curr_left = nodes.length - 2;
            const curr_right = nodes.length - 1;
            const prev_left = nodes.length - 4;
            const prev_right = nodes.length - 3;
            
            elements.push(new TrussElement(prev_left, curr_left, nodes, 200e9, 0.015, 250e6));
            elements.push(new TrussElement(prev_right, curr_right, nodes, 200e9, 0.015, 250e6));
            elements.push(new TrussElement(curr_left, curr_right, nodes, 200e9, 0.012, 250e6));
            elements.push(new TrussElement(prev_left, curr_right, nodes, 200e9, 0.008, 250e6));
            elements.push(new TrussElement(prev_right, curr_left, nodes, 200e9, 0.008, 250e6));
        }
    }

    elements.push(new TrussElement(0, 4, nodes, 200e9, 0.02, 250e6));
    elements.push(new TrussElement(1, 5, nodes, 200e9, 0.02, 250e6));
    elements.push(new TrussElement(2, 4, nodes, 200e9, 0.018, 250e6));
    elements.push(new TrussElement(3, 5, nodes, 200e9, 0.018, 250e6));

    const towerTopLeft = nodes.length - 2;
    const towerTopRight = nodes.length - 1;
    const boomSegments = 16;
    const boomLength = 450;

    for (let i = 1; i <= boomSegments; i++) {
        const t = i / boomSegments;
        const x = towerX + boomLength * t;
        const sag = Math.sin(t * Math.PI) * 15;
        const y = towerTop + sag;
        
        nodes.push({ x: x, y: y, fixed: false });

        if (i === 1) {
            elements.push(new TrussElement(towerTopRight, nodes.length - 1, nodes, 200e9, 0.012, 250e6));
        } else {
            elements.push(new TrussElement(nodes.length - 2, nodes.length - 1, nodes, 200e9, 0.01, 250e6));
        }
        
        if (i > 2 && i % 2 === 0) {
            elements.push(new TrussElement(towerTopRight, nodes.length - 1, nodes, 200e9, 0.006, 250e6));
        }
        if (i > 3 && i % 3 === 0) {
            elements.push(new TrussElement(nodes.length - 3, nodes.length - 1, nodes, 200e9, 0.005, 250e6));
        }
    }

    const hookNode = nodes.length - 1;
    hookX = nodes[hookNode].x;
    hookY = nodes[hookNode].y + cableLength;
    cableAngle = 0;
    cableAngularVel = 0;

    displacements = new Float64Array(nodes.length * 2);
    structuralIntegrity = 1.0;
}

function runFEA() {
    const assembly = new GlobalAssembly(nodes.length);

    assembly.fixNode(0);
    assembly.fixNode(1);
    assembly.fixNode(2);
    assembly.fixNode(3);

    for (let element of elements) {
        if (!element.failed) {
            element.updateGeometry();
            assembly.addElement(element);
        }
    }

    let hookNode = nodes.length - 1;

    const cargoPosX = nodes[hookNode].x + cableLength * Math.sin(cableAngle);
    const cargoPosY = nodes[hookNode].y + cableLength * Math.cos(cableAngle);
    
    const cargoForceX = cargoMass * GRAVITY * Math.sin(cableAngle) + windForce;
    const cargoForceY = cargoMass * GRAVITY * Math.cos(cableAngle);
    
    const cableTensionX = -cargoForceX;
    const cableTensionY = -cargoForceY - cargoMass * GRAVITY;
    
    const dynamicFactorX = 1.0 + Math.abs(cableAngularVel) * 5;
    const dynamicFactorY = 1.0 + Math.abs(cargoVelocityY) * 2;

    assembly.applyForce(hookNode, cableTensionX * dynamicFactorX, cableTensionY * dynamicFactorY);

    const prevHookNodes = [hookNode - 1, hookNode - 2];
    for (let node of prevHookNodes) {
        if (node >= 4) {
            const distributedForceX = cableTensionX * 0.3 * dynamicFactorX;
            const distributedForceY = cableTensionY * 0.2 * dynamicFactorY;
            assembly.applyForce(node, distributedForceX, distributedForceY);
        }
    }

    windForce = Math.sin(time * 0.8) * 20 + Math.cos(time * 1.3) * 15;
    for (let i = 4; i < nodes.length; i++) {
        const height = (650 - nodes[i].y) / 570;
        const windMagnitude = windForce * height * height;
        assembly.applyForce(i, windMagnitude * 0.5, 0);
    }

    displacements = solver.solve(assembly);

    const stats = strainCalc.calculateAllStrains(elements, displacements);

    let maxStressRatio = 0;
    for (let elem of elements) {
        if (!elem.failed) {
            maxStressRatio = Math.max(maxStressRatio, elem.getStressRatio());
        }
    }
    structuralIntegrity = 1.0 - (stats.failedCount / elements.length);

    updateStats(stats, maxStressRatio);

    audio.updateStrain(stats.totalStrainEnergy, 8000);

    return stats;
}

function updateCargo(dt) {
    const hookNode = nodes.length - 1;
    const hookNodeX = nodes[hookNode].x + (displacements[hookNode * 2] || 0);
    const hookNodeY = nodes[hookNode].y + (displacements[hookNode * 2 + 1] || 0);

    const targetAngle = Math.atan2(mouseX - hookNodeX, 200) * 0.3;
    const angleError = targetAngle - cableAngle;
    
    const torque = angleError * CABLE_K - cableAngularVel * 50;
    const inertia = cargoMass * cableLength * cableLength;
    const angularAccel = torque / inertia;
    
    cableAngularVel += angularAccel * dt;
    cableAngularVel *= DAMPING;
    cableAngle += cableAngularVel * dt;
    
    cableAngle = Math.max(-Math.PI/3, Math.min(Math.PI/3, cableAngle));
    
    const cargoPosX = hookNodeX + cableLength * Math.sin(cableAngle);
    const cargoPosY = hookNodeY + cableLength * Math.cos(cableAngle);
    
    cargoVelocityX = (cargoPosX - hookX) / dt;
    cargoVelocityY = (cargoPosY - hookY) / dt;
    
    hookX = cargoPosX;
    hookY = cargoPosY;
    
    const swayMagnitude = Math.abs(cableAngle);
    if (swayMagnitude > Math.PI/4) {
        const excessForce = (swayMagnitude - Math.PI/4) * cargoMass * 100;
        for (let elem of elements) {
            if (!elem.failed && Math.random() < excessForce * 0.0001) {
                elem.failed = true;
            }
        }
    }
}

function updateStats(stats, maxStressRatio) {
    document.getElementById('max-strain').textContent =
        (stats.maxStrain * 100).toFixed(2) + '%';

    document.getElementById('failed-count').textContent = stats.failedCount;

    if (stats.failedCount > 0) {
        document.getElementById('failed-count').classList.add('warning');
    } else {
        document.getElementById('failed-count').classList.remove('warning');
    }

    document.getElementById('total-energy').textContent =
        stats.totalStrainEnergy.toFixed(0) + ' J';

    const stressPercent = (maxStressRatio * 100).toFixed(1);
    const integrityPercent = (structuralIntegrity * 100).toFixed(0);
    
    document.getElementById('cargo-mass').innerHTML = 
        `${cargoMass} kg<br><small style="font-size:10px;color:#888">Stress: ${stressPercent}% | Integrity: ${integrityPercent}%</small>`;
}

function animate() {
    if (!animationRunning) return;

    time += 0.016;

    updateCargo(0.016);

    const stats = runFEA();

    renderer.renderTruss(nodes, elements, displacements);

    drawCargo();

    if (stats.failedCount > elements.length * 0.3) {
        alert('CRANE COLLAPSE! Too many failed elements.');
        buildCrane();
    }

    requestAnimationFrame(animate);
}

function drawCargo() {
    const ctx = renderer.ctx;

    const hookNode = nodes.length - 1;
    const hookNodeX = nodes[hookNode].x + (displacements[hookNode * 2] || 0);
    const hookNodeY = nodes[hookNode].y + (displacements[hookNode * 2 + 1] || 0);

    const cargoPosX = hookNodeX + cableLength * Math.sin(cableAngle);
    const cargoPosY = hookNodeY + cableLength * Math.cos(cableAngle);

    const tension = Math.abs(cableAngle) * 5;
    const cableColor = `rgba(255, ${170 - tension * 30}, 0, ${0.8 + tension * 0.2})`;
    ctx.strokeStyle = cableColor;
    ctx.lineWidth = 3 + tension * 0.5;
    ctx.beginPath();
    ctx.moveTo(hookNodeX, hookNodeY);
    
    const midX = (hookNodeX + cargoPosX) / 2;
    const midY = (hookNodeY + cargoPosY) / 2 + Math.abs(cableAngle) * 20;
    ctx.quadraticCurveTo(midX, midY, cargoPosX, cargoPosY);
    ctx.stroke();

    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff4444';
    const cargoSize = 18 + cargoMass * 0.15;
    const gradient = ctx.createRadialGradient(cargoPosX, cargoPosY, 0, cargoPosX, cargoPosY, cargoSize);
    gradient.addColorStop(0, '#ff6666');
    gradient.addColorStop(0.7, '#ff2222');
    gradient.addColorStop(1, '#aa0000');
    ctx.fillStyle = gradient;
    
    ctx.save();
    ctx.translate(cargoPosX, cargoPosY);
    ctx.rotate(cableAngle * 0.5);
    ctx.fillRect(-cargoSize/2, -cargoSize/2, cargoSize, cargoSize);
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 2;
    ctx.strokeRect(-cargoSize/2, -cargoSize/2, cargoSize, cargoSize);
    ctx.restore();
    
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${cargoMass}kg`, cargoPosX, cargoPosY + cargoSize + 15);
    
    const swingAngleDeg = (cableAngle * 180 / Math.PI).toFixed(1);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText(`${swingAngleDeg}°`, cargoPosX, cargoPosY + cargoSize + 27);
    
    if (Math.abs(cableAngle) > Math.PI/6) {
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('⚠ HIGH SWING', cargoPosX, cargoPosY - cargoSize - 10);
    }
}

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

document.getElementById('reset-btn').addEventListener('click', () => {
    buildCrane();
    cargoMass = 100;
    cargoVelocityX = 0;
    cargoVelocityY = 0;
    cableAngle = 0;
    cableAngularVel = 0;
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

document.getElementById('add-mass-btn').addEventListener('click', () => {
    cargoMass += 50;
});

document.getElementById('sub-mass-btn').addEventListener('click', () => {
    cargoMass = Math.max(50, cargoMass - 50);
});

const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
bgCanvas.width = window.innerWidth;
bgCanvas.height = window.innerHeight;

function animateBg() {
    bgCtx.fillStyle = 'rgba(10, 14, 39, 0.1)';
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    bgCtx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
    bgCtx.lineWidth = 2;

    for (let i = 0; i < 5; i++) {
        const phase = time * 0.5 + i * Math.PI / 2.5;
        const y = bgCanvas.height / 2 + Math.sin(phase) * 100;

        bgCtx.beginPath();
        for (let x = 0; x < bgCanvas.width; x += 20) {
            const wave = y + Math.sin(x * 0.01 + phase) * 30;
            if (x === 0) {
                bgCtx.moveTo(x, wave);
            } else {
                bgCtx.lineTo(x, wave);
            }
        }
        bgCtx.stroke();
    }

    requestAnimationFrame(animateBg);
}

buildCrane();
animate();
animateBg();

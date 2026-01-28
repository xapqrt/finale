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
let nodeConnections = [];

let generation = 0;
let autoEvolve = false;
let evolutionTimer = 0;
let initialElementCount = 0;

const PRUNE_THRESHOLD = 0.15;
const REINFORCE_THRESHOLD = 0.7;
const EVOLUTION_INTERVAL = 1.5;

const leftSupport = { x: 150, y: 600 };
const rightSupport = { x: 850, y: 600 };
const loadPoint = { x: 500, y: 150 };
const loadForce = 50000;

function buildInitialStructure() {
    nodes = [];
    elements = [];
    nodeConnections = [];
    generation = 0;

    const gridWidth = 15;
    const gridHeight = 10;
    const cellWidth = (rightSupport.x - leftSupport.x) / (gridWidth - 1);
    const cellHeight = (leftSupport.y - loadPoint.y) / (gridHeight - 1);

    for (let row = 0; row < gridHeight; row++) {
        for (let col = 0; col < gridWidth; col++) {
            const x = leftSupport.x + col * cellWidth;
            const y = loadPoint.y + row * cellHeight;
            
            let fixed = false;
            if (row === gridHeight - 1 && (col === 0 || col === gridWidth - 1)) {
                fixed = true;
            }
            
            nodes.push({ x: x, y: y, fixed: fixed });
            nodeConnections.push([]);
        }
    }

    for (let row = 0; row < gridHeight; row++) {
        for (let col = 0; col < gridWidth; col++) {
            const idx = row * gridWidth + col;
            
            if (col < gridWidth - 1) {
                const rightIdx = idx + 1;
                elements.push(new TrussElement(idx, rightIdx, nodes, 200e9, 0.008, 250e6));
                nodeConnections[idx].push(rightIdx);
                nodeConnections[rightIdx].push(idx);
            }
            
            if (row < gridHeight - 1) {
                const downIdx = idx + gridWidth;
                elements.push(new TrussElement(idx, downIdx, nodes, 200e9, 0.008, 250e6));
                nodeConnections[idx].push(downIdx);
                nodeConnections[downIdx].push(idx);
            }
            
            if (col < gridWidth - 1 && row < gridHeight - 1) {
                const diagIdx = idx + gridWidth + 1;
                elements.push(new TrussElement(idx, diagIdx, nodes, 200e9, 0.006, 250e6));
                nodeConnections[idx].push(diagIdx);
                nodeConnections[diagIdx].push(idx);
            }
            
            if (col > 0 && row < gridHeight - 1) {
                const diagIdx = idx + gridWidth - 1;
                elements.push(new TrussElement(idx, diagIdx, nodes, 200e9, 0.006, 250e6));
                nodeConnections[idx].push(diagIdx);
                nodeConnections[diagIdx].push(idx);
            }
        }
    }

    initialElementCount = elements.length;
    displacements = new Float64Array(nodes.length * 2);
}

function runFEA() {
    const assembly = new GlobalAssembly(nodes.length);

    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].fixed) {
            assembly.fixNode(i);
        }
    }

    for (let element of elements) {
        if (!element.failed) {
            element.updateGeometry();
            assembly.addElement(element);
        }
    }

    const loadNodeIdx = Math.floor(gridHeight / 2) * gridWidth + Math.floor(gridWidth / 2);
    assembly.applyForce(loadNodeIdx, 0, loadForce);

    const topLeftQuarter = Math.floor(gridWidth / 4);
    const topRightQuarter = gridWidth - topLeftQuarter - 1;
    assembly.applyForce(topLeftQuarter, 0, loadForce * 0.3);
    assembly.applyForce(topRightQuarter, 0, loadForce * 0.3);

    displacements = solver.solve(assembly);

    const stats = strainCalc.calculateAllStrains(elements, displacements);

    updateStats(stats);
    audio.updateStrain(stats.totalStrainEnergy, 6000);

    return stats;
}

function evolveStructure() {
    const stats = runFEA();
    
    const stressRatios = elements.map(elem => elem.getStressRatio());
    const avgStress = stressRatios.reduce((a, b) => a + b, 0) / stressRatios.length;

    const toRemove = [];
    const toReinforce = [];

    for (let i = elements.length - 1; i >= 0; i--) {
        const elem = elements[i];
        const ratio = elem.getStressRatio();
        
        if (ratio < PRUNE_THRESHOLD && ratio < avgStress * 0.5) {
            const n1Connections = nodeConnections[elem.n1].length;
            const n2Connections = nodeConnections[elem.n2].length;
            
            if (n1Connections > 2 && n2Connections > 2 && !elem.failed) {
                toRemove.push(i);
            }
        }
        
        if (ratio > REINFORCE_THRESHOLD && !elem.failed) {
            toReinforce.push(elem);
        }
    }

    for (let idx of toRemove) {
        const elem = elements[idx];
        const n1Idx = nodeConnections[elem.n1].indexOf(elem.n2);
        const n2Idx = nodeConnections[elem.n2].indexOf(elem.n1);
        if (n1Idx > -1) nodeConnections[elem.n1].splice(n1Idx, 1);
        if (n2Idx > -1) nodeConnections[elem.n2].splice(n2Idx, 1);
        elements.splice(idx, 1);
    }

    for (let elem of toReinforce) {
        elem.A = Math.min(elem.A * 1.1, 0.02);
    }

    if (toRemove.length > 0 || toReinforce.length > 0) {
        generation++;
    }

    return { removed: toRemove.length, reinforced: toReinforce.length };
}

function updateStats(stats) {
    document.getElementById('generation-display').textContent = generation;
    
    const massReduction = ((initialElementCount - elements.length) / initialElementCount * 100);
    document.getElementById('mass-display').textContent = massReduction.toFixed(1) + '%';
    
    document.getElementById('elements-display').textContent = elements.length;
    
    const efficiency = (1 - stats.maxStrain / 2) * 100;
    document.getElementById('efficiency-display').textContent = Math.max(0, efficiency).toFixed(1) + '%';
}

function animate() {
    const dt = 0.016;
    
    if (autoEvolve) {
        evolutionTimer += dt;
        if (evolutionTimer >= EVOLUTION_INTERVAL) {
            const result = evolveStructure();
            evolutionTimer = 0;
            
            if (result.removed === 0 && result.reinforced === 0) {
                autoEvolve = false;
                document.getElementById('evolve-btn').textContent = 'AUTO EVOLVE';
            }
        }
    }

    runFEA();
    renderer.renderTruss(nodes, elements, displacements);
    drawLoadPoints();

    requestAnimationFrame(animate);
}

function drawLoadPoints() {
    const ctx = renderer.ctx;
    
    const loadNodeIdx = Math.floor(gridHeight / 2) * gridWidth + Math.floor(gridWidth / 2);
    const loadNode = nodes[loadNodeIdx];
    
    if (loadNode) {
        const x = loadNode.x + (displacements[loadNodeIdx * 2] || 0);
        const y = loadNode.y + (displacements[loadNodeIdx * 2 + 1] || 0);
        
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y - 30);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 6, y - 12);
        ctx.lineTo(x + 6, y - 12);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${(loadForce/1000).toFixed(0)}kN`, x, y - 35);
    }

    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].fixed) {
            const x = nodes[i].x;
            const y = nodes[i].y;
            
            ctx.fillStyle = '#00ff00';
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 10, y + 15);
            ctx.lineTo(x + 10, y + 15);
            ctx.fill();
            
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            for (let j = 0; j < 5; j++) {
                ctx.beginPath();
                ctx.moveTo(x - 12 + j * 6, y + 15);
                ctx.lineTo(x - 15 + j * 6, y + 20);
                ctx.stroke();
            }
        }
    }
}

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    loadPoint.x = mouseX;
    loadPoint.y = mouseY;
});

document.getElementById('reset-btn').addEventListener('click', () => {
    buildInitialStructure();
    autoEvolve = false;
    evolutionTimer = 0;
    document.getElementById('evolve-btn').textContent = 'AUTO EVOLVE';
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

document.getElementById('evolve-btn').addEventListener('click', () => {
    autoEvolve = !autoEvolve;
    if (autoEvolve) {
        document.getElementById('evolve-btn').textContent = 'STOP EVOLVE';
    } else {
        document.getElementById('evolve-btn').textContent = 'AUTO EVOLVE';
    }
});

document.getElementById('step-btn').addEventListener('click', () => {
    evolveStructure();
});

const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
bgCanvas.width = window.innerWidth;
bgCanvas.height = window.innerHeight;

let time = 0;

function animateBg() {
    time += 0.016;
    
    bgCtx.fillStyle = 'rgba(10, 14, 39, 0.1)';
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    bgCtx.strokeStyle = 'rgba(0, 229, 255, 0.1)';
    bgCtx.lineWidth = 1;

    const gridSize = 80;
    for (let x = 0; x < bgCanvas.width; x += gridSize) {
        for (let y = 0; y < bgCanvas.height; y += gridSize) {
            const wave = Math.sin(x * 0.01 + time) * Math.cos(y * 0.01 + time) * 20;
            const size = 10 + wave;
            
            bgCtx.beginPath();
            bgCtx.arc(x, y, size, 0, Math.PI * 2);
            bgCtx.stroke();
        }
    }

    requestAnimationFrame(animateBg);
}

const gridWidth = 15;
const gridHeight = 10;

buildInitialStructure();
animate();
animateBg();

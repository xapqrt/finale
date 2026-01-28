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
let floorStatus = [];

let earthquakeActive = false;
let earthquakeTime = 0;
let timer = 20.0;
let groundAccelX = 0;
let groundAccelY = 0;
let magnitude = 0;
let buildingLean = 0;

const numFloors = 10;
const floorHeight = 50;
const buildingWidth = 200;
const baseY = 650;
const centerX = canvas.width / 2;

const EARTHQUAKE_DURATION = 20.0;

function buildStructure() {
    nodes = [];
    elements = [];
    floorStatus = [];
    
    const cols = 5;
    const colSpacing = buildingWidth / (cols - 1);
    
    for (let floor = 0; floor <= numFloors; floor++) {
        const y = baseY - floor * floorHeight;
        
        for (let col = 0; col < cols; col++) {
            const x = centerX - buildingWidth/2 + col * colSpacing;
            const fixed = (floor === 0);
            nodes.push({ x: x, y: y, fixed: fixed });
        }
        
        floorStatus.push({ intact: true, failedElements: 0 });
    }

    for (let floor = 0; floor < numFloors; floor++) {
        const floorStart = floor * cols;
        const nextFloorStart = (floor + 1) * cols;
        
        for (let col = 0; col < cols - 1; col++) {
            elements.push(new TrussElement(
                floorStart + col,
                floorStart + col + 1,
                nodes,
                200e9,
                0.015,
                250e6
            ));
        }
        
        for (let col = 0; col < cols; col++) {
            const area = 0.02 * (1 - floor / numFloors * 0.5);
            elements.push(new TrussElement(
                floorStart + col,
                nextFloorStart + col,
                nodes,
                200e9,
                area,
                250e6
            ));
        }
        
        for (let col = 0; col < cols - 1; col++) {
            elements.push(new TrussElement(
                floorStart + col,
                nextFloorStart + col + 1,
                nodes,
                200e9,
                0.008,
                250e6
            ));
            elements.push(new TrussElement(
                floorStart + col + 1,
                nextFloorStart + col,
                nodes,
                200e9,
                0.008,
                250e6
            ));
        }
    }

    displacements = new Float64Array(nodes.length * 2);
    earthquakeTime = 0;
    timer = EARTHQUAKE_DURATION;
    earthquakeActive = false;
}

function runFEA() {
    const assembly = new GlobalAssembly(nodes.length);

    const cols = 5;
    for (let col = 0; col < cols; col++) {
        assembly.fixNode(col);
    }

    for (let element of elements) {
        if (!element.failed) {
            element.updateGeometry();
            assembly.addElement(element);
        }
    }

    if (earthquakeActive) {
        const f1 = 2.3;
        const f2 = 4.7;
        const f3 = 7.1;
        
        const amp = magnitude * 15000;
        groundAccelX = amp * (
            Math.sin(earthquakeTime * f1 * Math.PI * 2) +
            0.6 * Math.sin(earthquakeTime * f2 * Math.PI * 2) +
            0.3 * Math.sin(earthquakeTime * f3 * Math.PI * 2)
        );
        
        groundAccelY = amp * 0.4 * (
            Math.sin(earthquakeTime * f1 * 1.3 * Math.PI * 2) +
            0.5 * Math.cos(earthquakeTime * f2 * 0.8 * Math.PI * 2)
        );

        for (let floor = 1; floor <= numFloors; floor++) {
            if (!floorStatus[floor].intact) continue;
            
            const floorStart = floor * cols;
            const heightFactor = (floor / numFloors);
            const amplification = 1.0 + heightFactor * 2.5;
            
            for (let col = 0; col < cols; col++) {
                const nodeIdx = floorStart + col;
                const floorMass = 800 * (1 + (numFloors - floor) * 0.3);
                
                const inertialForceX = groundAccelX * amplification * floorMass / cols;
                const inertialForceY = groundAccelY * amplification * floorMass / cols;
                
                const swayForce = -buildingLean * 50000 * heightFactor * heightFactor;
                
                assembly.applyForce(nodeIdx, inertialForceX + swayForce, inertialForceY);
            }
        }
    }

    displacements = solver.solve(assembly);

    const stats = strainCalc.calculateAllStrains(elements, displacements);

    updateFloorStatus();
    updateStats(stats);
    audio.updateStrain(stats.totalStrainEnergy, 12000);

    return stats;
}

function updateFloorStatus() {
    const cols = 5;
    
    for (let floor = 1; floor <= numFloors; floor++) {
        if (!floorStatus[floor].intact) continue;
        
        let failedInFloor = 0;
        const floorStart = floor * cols;
        const prevFloorStart = (floor - 1) * cols;
        
        for (let elem of elements) {
            if (elem.failed) {
                const n1Floor = Math.floor(elem.n1 / cols);
                const n2Floor = Math.floor(elem.n2 / cols);
                
                if ((n1Floor === floor || n2Floor === floor) ||
                    (n1Floor === floor - 1 && n2Floor === floor) ||
                    (n1Floor === floor && n2Floor === floor - 1)) {
                    failedInFloor++;
                }
            }
        }
        
        floorStatus[floor].failedElements = failedInFloor;
        
        const totalFloorElements = (cols - 1) + cols + 2 * (cols - 1);
        if (failedInFloor > totalFloorElements * 0.5) {
            floorStatus[floor].intact = false;
        }
    }

    let topX = 0;
    const topFloorStart = numFloors * cols;
    const topFloorCenter = topFloorStart + Math.floor(cols / 2);
    if (topFloorCenter < nodes.length) {
        topX = nodes[topFloorCenter].x + (displacements[topFloorCenter * 2] || 0);
    }
    buildingLean = (topX - centerX) / 100;
}

function updateStats(stats) {
    if (earthquakeActive) {
        timer = Math.max(0, EARTHQUAKE_DURATION - earthquakeTime);
        document.getElementById('timer-display').textContent = timer.toFixed(1) + 's';
        
        if (timer <= 0) {
            earthquakeActive = false;
            showResult(true);
        }
    }
    
    document.getElementById('magnitude-display').textContent = magnitude.toFixed(1);
    
    let collapsedFloors = 0;
    for (let i = 1; i <= numFloors; i++) {
        if (!floorStatus[i].intact) collapsedFloors++;
    }
    document.getElementById('collapsed-display').textContent = `${collapsedFloors}/${numFloors}`;
    
    if (collapsedFloors >= 3 && earthquakeActive) {
        earthquakeActive = false;
        showResult(false);
    }
    
    document.getElementById('lean-display').textContent = (buildingLean * 100).toFixed(1) + '°';
    
    if (Math.abs(buildingLean) > 0.8 && earthquakeActive) {
        earthquakeActive = false;
        showResult(false);
    }
}

function showResult(survived) {
    const overlay = document.getElementById('result-overlay');
    const resultText = document.getElementById('result-text');
    
    if (survived) {
        resultText.textContent = 'SURVIVED!';
        resultText.style.color = '#00ff00';
        overlay.style.borderColor = '#00ff00';
    } else {
        resultText.textContent = 'COLLAPSED!';
        resultText.style.color = '#ff4444';
        overlay.style.borderColor = '#ff4444';
    }
    
    overlay.style.display = 'block';
}

function animate() {
    const dt = 0.016;
    
    if (earthquakeActive) {
        earthquakeTime += dt;
        
        const progress = earthquakeTime / EARTHQUAKE_DURATION;
        if (progress < 0.15) {
            magnitude = progress / 0.15 * 3.5;
        } else if (progress < 0.5) {
            magnitude = 3.5 + (progress - 0.15) / 0.35 * 2.5;
        } else if (progress < 0.8) {
            magnitude = 6.0 + Math.sin((progress - 0.5) * Math.PI * 6) * 1.5;
        } else {
            magnitude = 6.0 - (progress - 0.8) / 0.2 * 4.0;
        }
    }

    runFEA();
    renderer.renderTruss(nodes, elements, displacements);
    drawGround();
    drawFloorMarkers();

    requestAnimationFrame(animate);
}

function drawGround() {
    const ctx = renderer.ctx;
    
    const groundY = baseY + 20;
    const shakeOffsetX = earthquakeActive ? groundAccelX * 0.005 : 0;
    const shakeOffsetY = earthquakeActive ? groundAccelY * 0.003 : 0;
    
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, groundY + shakeOffsetY);
    ctx.lineTo(canvas.width, groundY + shakeOffsetY);
    ctx.stroke();
    
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    for (let x = 0; x < canvas.width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x + shakeOffsetX, groundY + shakeOffsetY);
        ctx.lineTo(x + shakeOffsetX - 5, groundY + shakeOffsetY + 10);
        ctx.stroke();
    }
}

function drawFloorMarkers() {
    const ctx = renderer.ctx;
    const cols = 5;
    
    for (let floor = 1; floor <= numFloors; floor++) {
        const floorStart = floor * cols;
        const leftNode = nodes[floorStart];
        const rightNode = nodes[floorStart + cols - 1];
        
        const leftX = leftNode.x + (displacements[floorStart * 2] || 0);
        const rightX = rightNode.x + (displacements[(floorStart + cols - 1) * 2] || 0);
        const y = leftNode.y + (displacements[floorStart * 2 + 1] || 0);
        
        const midX = (leftX + rightX) / 2;
        
        ctx.fillStyle = floorStatus[floor].intact ? '#888' : '#ff4444';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`F${floor}`, midX - buildingWidth/2 - 30, y);
        
        if (!floorStatus[floor].intact) {
            ctx.fillStyle = 'rgba(255, 68, 68, 0.3)';
            ctx.fillRect(leftX - 10, y - floorHeight/2, rightX - leftX + 20, floorHeight);
        }
    }
}

document.getElementById('reset-btn').addEventListener('click', () => {
    buildStructure();
    earthquakeActive = false;
    document.getElementById('result-overlay').style.display = 'none';
    document.getElementById('start-btn').disabled = false;
    document.getElementById('start-btn').textContent = 'START EARTHQUAKE';
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

document.getElementById('start-btn').addEventListener('click', function() {
    if (!earthquakeActive) {
        earthquakeActive = true;
        earthquakeTime = 0;
        timer = EARTHQUAKE_DURATION;
        this.disabled = true;
        this.textContent = 'EARTHQUAKE IN PROGRESS...';
    }
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

    if (earthquakeActive) {
        const shakeX = Math.sin(time * 20) * 5;
        const shakeY = Math.cos(time * 15) * 3;
        
        bgCtx.save();
        bgCtx.translate(shakeX, shakeY);
    }

    bgCtx.strokeStyle = 'rgba(255, 68, 68, 0.15)';
    bgCtx.lineWidth = 2;

    for (let i = 0; i < 10; i++) {
        const phase = time * 2 + i * Math.PI / 5;
        const amplitude = earthquakeActive ? 150 : 50;
        const y = bgCanvas.height / 2 + Math.sin(phase) * amplitude;

        bgCtx.beginPath();
        for (let x = 0; x < bgCanvas.width; x += 15) {
            const wave = y + Math.sin(x * 0.02 + phase) * 40;
            if (x === 0) {
                bgCtx.moveTo(x, wave);
            } else {
                bgCtx.lineTo(x, wave);
            }
        }
        bgCtx.stroke();
    }

    if (earthquakeActive) {
        bgCtx.restore();
    }

    requestAnimationFrame(animateBg);
}

buildStructure();
animate();
animateBg();

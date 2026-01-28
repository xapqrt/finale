import { TrussElement } from '../scripts/FEA/TrussElement.js';
import { GlobalAssembly } from '../scripts/FEA/GlobalAssembly.js';
import { Solver } from '../scripts/FEA/Solver.js';
import { StrainCalculator } from '../scripts/FEA/StrainCalculator.js';
import { CanvasRenderer } from '../scripts/utils/CanvasRenderer.js';
import { StrainAudio } from '../scripts/audio/StrainAudio.js';

const urlParams = new URLSearchParams(window.location.search);
const currentMode = urlParams.get('mode') || 'crane';

const canvas = document.getElementById('main-canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const renderer = new CanvasRenderer(canvas);
const solver = new Solver();
const strainCalc = new StrainCalculator();
const audio = new StrainAudio();

let nodes = [];
let elements = [];
let displacements = new Float64Array(0);
let animationRunning = true;
let time = 0;

let wreckingState = {
    ballX: 0,
    ballY: 0,
    ballVelX: 0,
    ballVelY: 0,
    ballRadius: 30,
    ballMass: 500,
    anchorX: 0,
    anchorY: 0,
    cableLength: 250,
    dragging: false,
    released: false,
    swingCount: 0,
    buildingNodes: [],
    buildingElements: [],
    particles: [],
    score: 0
};

let turbineState = {
    shatteredPieces: [],
    angularVelocity: 0,
    targetRPM: 0,
    currentRPM: 0,
    maxRPM: 300,
    forceMultiplier: 1.0,
    bladeThickness: 1.0,
    spinning: false,
    centerX: canvas.width / 2,
    centerY: canvas.height / 2
};

let catapultState = {
    armAngle: -0.5,
    armAngularVel: 0,
    armLength: 180,
    projectileX: 0,
    projectileY: 0,
    projectileVelX: 0,
    projectileVelY: 0,
    projectileLaunched: false,
    charging: false,
    chargeTime: 0,
    maxCharge: 2.0,
    launchPower: 1.0,
    projectileRadius: 15,
    projectileMass: 50,
    castleNodes: [],
    castleElements: [],
    particles: [],
    score: 0,
    shotsLeft: 5
};

let bridgeState = {
    leftAnchorX: 150,
    rightAnchorX: 0,
    groundY: 0,
    bridgeY: 0,
    segments: 12,
    buildMode: true,
    testMode: false,
    vehicleX: 0,
    vehicleY: 0,
    vehicleSpeed: 2,
    vehicleMass: 800,
    vehicleOnBridge: false,
    vehiclePassed: false,
    bridgeCollapsed: false,
    particles: [],
    score: 0,
    vehicleType: 'car',
    difficulty: 1
};

const GRAVITY = 9.81;
const DAMPING = 0.98;
const CABLE_K = 500;
const STEEL_E = 200e9;
const STEEL_YIELD = 250e6;
const GLASS_E = 70e9;
const GLASS_YIELD = 50e6;
const RUBBER_E = 0.1e9;  // Very flexible material for dramatic bending
const RUBBER_YIELD = 15e6;
const PRUNE_THRESHOLD = 0.15;
const REINFORCE_THRESHOLD = 0.7;
const EVOLUTION_INTERVAL = 1.5;
const EARTHQUAKE_DURATION = 20.0;

function buildWreckingBall() {
    nodes = [];
    elements = [];
    wreckingState.particles = [];
    wreckingState.score = 0;
    wreckingState.swingCount = 0;
    wreckingState.released = false;
    wreckingState.buildingNodes = [];
    wreckingState.buildingElements = [];

    const groundY = canvas.height - 100;
    
    wreckingState.anchorX = 300;
    wreckingState.anchorY = 180;
    
    wreckingState.ballX = wreckingState.anchorX - 150;
    wreckingState.ballY = wreckingState.anchorY + 150;
    wreckingState.ballVelX = 0;
    wreckingState.ballVelY = 0;
    wreckingState.cableLength = Math.sqrt(
        Math.pow(wreckingState.ballX - wreckingState.anchorX, 2) +
        Math.pow(wreckingState.ballY - wreckingState.anchorY, 2)
    );
    
    const buildingX = 550;
    const buildingWidth = 200;
    const floors = 7;
    const floorHeight = 55;
    const cols = 5;
    const colSpacing = buildingWidth / (cols - 1);
    
    const BUILDING_E = 1.2e9;
    const BUILDING_YIELD = 30e6;
    
    for (let col = 0; col < cols; col++) {
        const x = buildingX + col * colSpacing;
        nodes.push({ x: x, y: groundY, fixed: true });
    }
    
    for (let floor = 1; floor <= floors; floor++) {
        const y = groundY - floor * floorHeight;
        for (let col = 0; col < cols; col++) {
            const x = buildingX + col * colSpacing;
            nodes.push({ x: x, y: y, fixed: false });
            wreckingState.buildingNodes.push(nodes.length - 1);
        }
    }
    
    for (let floor = 0; floor < floors; floor++) {
        const floorStart = floor * cols;
        const nextFloorStart = (floor + 1) * cols;
        
        for (let col = 0; col < cols - 1; col++) {
            const elem = new TrussElement(
                nextFloorStart + col,
                nextFloorStart + col + 1,
                nodes, BUILDING_E, 0.008, BUILDING_YIELD
            );
            elements.push(elem);
            wreckingState.buildingElements.push(elements.length - 1);
        }
        
        for (let col = 0; col < cols; col++) {
            const elem = new TrussElement(
                floorStart + col,
                nextFloorStart + col,
                nodes, BUILDING_E, 0.010, BUILDING_YIELD
            );
            elements.push(elem);
            wreckingState.buildingElements.push(elements.length - 1);
        }
        
        for (let col = 0; col < cols - 1; col++) {
            const elem1 = new TrussElement(
                floorStart + col,
                nextFloorStart + col + 1,
                nodes, BUILDING_E, 0.004, BUILDING_YIELD * 0.6
            );
            const elem2 = new TrussElement(
                floorStart + col + 1,
                nextFloorStart + col,
                nodes, BUILDING_E, 0.004, BUILDING_YIELD * 0.6
            );
            elements.push(elem1, elem2);
            wreckingState.buildingElements.push(elements.length - 2, elements.length - 1);
        }
    }

    displacements = new Float64Array(nodes.length * 2);
}

function buildTurbine() {
    nodes = [];
    elements = [];
    turbineState.shatteredPieces = [];

    nodes.push({ x: turbineState.centerX, y: turbineState.centerY, fixed: true });

    const hubRadius = 80;
    const hubNodes = 16;
    for (let i = 0; i < hubNodes; i++) {
        const angle = (i / hubNodes) * Math.PI * 2;
        const x = turbineState.centerX + Math.cos(angle) * hubRadius;
        const y = turbineState.centerY + Math.sin(angle) * hubRadius;
        nodes.push({ x: x, y: y, fixed: false });

        if (i > 0) {
            elements.push(new TrussElement(i, i + 1, nodes, STEEL_E, 0.03, STEEL_YIELD));
        }
        elements.push(new TrussElement(0, i + 1, nodes, STEEL_E, 0.035, STEEL_YIELD));
    }
    elements.push(new TrussElement(1, hubNodes, nodes, STEEL_E, 0.03, STEEL_YIELD));

    const numBlades = 4;
    for (let blade = 0; blade < numBlades; blade++) {
        const bladeAngle = (blade / numBlades) * Math.PI * 2;
        const hubAttachNode = 1 + Math.floor((blade / numBlades) * hubNodes);
        
        const bladeSegments = 12;
        const bladeLength = 280;
        const bladeWidth = 50;

        let prevTopNode = hubAttachNode;
        let prevBottomNode = hubAttachNode;

        for (let seg = 1; seg <= bladeSegments; seg++) {
            const t = seg / bladeSegments;
            const r = hubRadius + bladeLength * t;
            
            const topAngle = bladeAngle + (bladeWidth / r) * 0.5;
            const bottomAngle = bladeAngle - (bladeWidth / r) * 0.5;
            
            const topX = turbineState.centerX + Math.cos(topAngle) * r;
            const topY = turbineState.centerY + Math.sin(topAngle) * r;
            const bottomX = turbineState.centerX + Math.cos(bottomAngle) * r;
            const bottomY = turbineState.centerY + Math.sin(bottomAngle) * r;

            nodes.push({ x: topX, y: topY, fixed: false });
            nodes.push({ x: bottomX, y: bottomY, fixed: false });

            const currTopNode = nodes.length - 2;
            const currBottomNode = nodes.length - 1;

            const area = 0.002 * (1 - t * 0.8) * turbineState.bladeThickness;
            
            // Use even weaker glass for dramatic shattering
            const WEAK_GLASS_E = 50e9;
            const WEAK_GLASS_YIELD = 30e6;
            
            elements.push(new TrussElement(prevTopNode, currTopNode, nodes, WEAK_GLASS_E, area, WEAK_GLASS_YIELD));
            elements.push(new TrussElement(prevBottomNode, currBottomNode, nodes, WEAK_GLASS_E, area, WEAK_GLASS_YIELD));
            elements.push(new TrussElement(currTopNode, currBottomNode, nodes, WEAK_GLASS_E, area * 0.7, WEAK_GLASS_YIELD));
            
            if (seg > 1) {
                elements.push(new TrussElement(prevTopNode, currBottomNode, nodes, WEAK_GLASS_E, area * 0.5, WEAK_GLASS_YIELD));
                elements.push(new TrussElement(prevBottomNode, currTopNode, nodes, WEAK_GLASS_E, area * 0.5, WEAK_GLASS_YIELD));
            }

            prevTopNode = currTopNode;
            prevBottomNode = currBottomNode;
        }
    }

    displacements = new Float64Array(nodes.length * 2);
    turbineState.angularVelocity = 0;
    turbineState.currentRPM = 0;
}

function buildCatapult() {
    nodes = [];
    elements = [];
    catapultState.particles = [];
    catapultState.score = 0;
    catapultState.shotsLeft = 5;
    catapultState.projectileLaunched = false;
    catapultState.charging = false;
    catapultState.chargeTime = 0;
    catapultState.armAngle = -0.5;
    catapultState.armAngularVel = 0;
    catapultState.castleNodes = [];
    catapultState.castleElements = [];

    const groundY = canvas.height - 100;
    
    const CASTLE_E = 3e9;
    const CASTLE_YIELD = 40e6;
    
    const castleX = canvas.width - 300;
    const castleWidth = 200;
    const castleHeight = 250;
    const cols = 5;
    const rows = 6;
    const colSpacing = castleWidth / (cols - 1);
    const rowSpacing = castleHeight / (rows - 1);
    
    for (let col = 0; col < cols; col++) {
        const x = castleX + col * colSpacing;
        nodes.push({ x: x, y: groundY, fixed: true });
    }
    
    for (let row = 1; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = castleX + col * colSpacing;
            const y = groundY - row * rowSpacing;
            nodes.push({ x: x, y: y, fixed: false });
            catapultState.castleNodes.push(nodes.length - 1);
        }
    }
    
    for (let row = 0; row < rows - 1; row++) {
        const rowStart = row * cols;
        const nextRowStart = (row + 1) * cols;
        
        for (let col = 0; col < cols - 1; col++) {
            const elem = new TrussElement(nextRowStart + col, nextRowStart + col + 1, nodes, CASTLE_E, 0.008, CASTLE_YIELD);
            elements.push(elem);
            catapultState.castleElements.push(elements.length - 1);
        }
        
        for (let col = 0; col < cols; col++) {
            const elem = new TrussElement(rowStart + col, nextRowStart + col, nodes, CASTLE_E, 0.010, CASTLE_YIELD);
            elements.push(elem);
            catapultState.castleElements.push(elements.length - 1);
        }
        
        for (let col = 0; col < cols - 1; col++) {
            const e1 = new TrussElement(rowStart + col, nextRowStart + col + 1, nodes, CASTLE_E, 0.004, CASTLE_YIELD * 0.6);
            const e2 = new TrussElement(rowStart + col + 1, nextRowStart + col, nodes, CASTLE_E, 0.004, CASTLE_YIELD * 0.6);
            elements.push(e1, e2);
            catapultState.castleElements.push(elements.length - 2, elements.length - 1);
        }
    }

    catapultState.baseX = 200;
    catapultState.baseY = groundY - 50;
    updateProjectilePosition();
    
    displacements = new Float64Array(nodes.length * 2);
}

function updateProjectilePosition() {
    if (!catapultState.projectileLaunched) {
        const tipX = catapultState.baseX + Math.cos(catapultState.armAngle) * catapultState.armLength;
        const tipY = catapultState.baseY + Math.sin(catapultState.armAngle) * catapultState.armLength;
        catapultState.projectileX = tipX;
        catapultState.projectileY = tipY;
    }
}

function buildBridge() {
    nodes = [];
    elements = [];
    bridgeState.particles = [];
    bridgeState.score = 0;
    bridgeState.testMode = false;
    bridgeState.buildMode = true;
    bridgeState.vehicleX = 50;
    bridgeState.vehicleOnBridge = false;
    bridgeState.vehiclePassed = false;
    bridgeState.bridgeCollapsed = false;
    
    const groundY = canvas.height - 150;
    bridgeState.groundY = groundY;
    bridgeState.leftAnchorX = 200;
    bridgeState.rightAnchorX = canvas.width - 200;
    bridgeState.bridgeY = groundY - 100;
    
    const bridgeSpan = bridgeState.rightAnchorX - bridgeState.leftAnchorX;
    const segments = bridgeState.segments;
    const segmentWidth = bridgeSpan / segments;
    
    const BRIDGE_E = 5e9;
    const BRIDGE_YIELD = 80e6;
    
    nodes.push({ x: bridgeState.leftAnchorX, y: bridgeState.bridgeY, fixed: true });
    nodes.push({ x: bridgeState.leftAnchorX, y: bridgeState.bridgeY + 40, fixed: true });
    
    for (let i = 1; i <= segments; i++) {
        const x = bridgeState.leftAnchorX + i * segmentWidth;
        const isEnd = i === segments;
        nodes.push({ x: x, y: bridgeState.bridgeY, fixed: isEnd });
        nodes.push({ x: x, y: bridgeState.bridgeY + 40, fixed: isEnd });
    }
    
    for (let i = 0; i <= segments; i++) {
        const topNode = i * 2;
        const bottomNode = i * 2 + 1;
        
        elements.push(new TrussElement(topNode, bottomNode, nodes, BRIDGE_E, 0.006, BRIDGE_YIELD));
        
        if (i < segments) {
            const nextTop = (i + 1) * 2;
            const nextBottom = (i + 1) * 2 + 1;
            
            elements.push(new TrussElement(topNode, nextTop, nodes, BRIDGE_E, 0.010, BRIDGE_YIELD));
            elements.push(new TrussElement(bottomNode, nextBottom, nodes, BRIDGE_E, 0.008, BRIDGE_YIELD));
            
            if (i % 2 === 0) {
                elements.push(new TrussElement(topNode, nextBottom, nodes, BRIDGE_E, 0.005, BRIDGE_YIELD * 0.8));
            } else {
                elements.push(new TrussElement(bottomNode, nextTop, nodes, BRIDGE_E, 0.005, BRIDGE_YIELD * 0.8));
            }
        }
    }

    displacements = new Float64Array(nodes.length * 2);
}

function runFEA() {
    const assembly = new GlobalAssembly(nodes.length);

    if (currentMode === 'crane') {
        for (let i = 0; i < 4; i++) {
            if (nodes[i] && nodes[i].fixed) {
                assembly.fixNode(i);
            }
        }

        for (let element of elements) {
            if (!element.failed) {
                element.updateGeometry();
                assembly.addElement(element);
            }
        }

        for (let nodeIdx of wreckingState.buildingNodes) {
            if (nodeIdx < nodes.length && !nodes[nodeIdx].fixed) {
                assembly.applyForce(nodeIdx, 0, 2000);
            }
        }

        if (wreckingState.released) {
            const impactRadius = wreckingState.ballRadius + 30;
            for (let nodeIdx of wreckingState.buildingNodes) {
                if (nodeIdx >= nodes.length) continue;
                const node = nodes[nodeIdx];
                const dx = node.x - wreckingState.ballX;
                const dy = node.y - wreckingState.ballY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < impactRadius && dist > 1) {
                    const impactForce = wreckingState.ballMass * 
                        Math.sqrt(wreckingState.ballVelX**2 + wreckingState.ballVelY**2) * 50;
                    const forceX = (dx / dist) * impactForce;
                    const forceY = (dy / dist) * impactForce;
                    assembly.applyForce(nodeIdx, forceX, forceY);
                    
                    if (Math.random() < 0.3) {
                        createWreckingParticle(node.x, node.y);
                    }
                }
            }
        }

    } else if (currentMode === 'turbine') {
        assembly.fixNode(0);

        for (let element of elements) {
            if (!element.failed) {
                element.updateGeometry();
                assembly.addElement(element);
            }
        }

        const omega = turbineState.angularVelocity;
        const omegaSq = omega * omega;

        for (let i = 1; i < nodes.length; i++) {
            const dx = nodes[i].x - turbineState.centerX;
            const dy = nodes[i].y - turbineState.centerY;
            const r = Math.sqrt(dx * dx + dy * dy);
            
            if (r > 1e-6) {
                const nodeMass = 5.0;
                const centrifugalForce = nodeMass * omegaSq * r * turbineState.forceMultiplier;
                
                const forceX = (dx / r) * centrifugalForce;
                const forceY = (dy / r) * centrifugalForce;
                
                assembly.applyForce(i, forceX, forceY);
            }

            const vibrationForce = Math.sin(time * 30 + i) * omegaSq * 0.5;
            assembly.applyForce(i, vibrationForce, vibrationForce * 0.7);
        }

    } else if (currentMode === 'optimizer') {
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

        for (let nodeIdx of catapultState.castleNodes) {
            if (nodeIdx < nodes.length && !nodes[nodeIdx].fixed) {
                assembly.applyForce(nodeIdx, 0, 1500);
            }
        }

        if (catapultState.projectileLaunched) {
            const impactRadius = catapultState.projectileRadius + 25;
            for (let nodeIdx of catapultState.castleNodes) {
                if (nodeIdx >= nodes.length) continue;
                const node = nodes[nodeIdx];
                const dx = node.x - catapultState.projectileX;
                const dy = node.y - catapultState.projectileY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < impactRadius && dist > 1) {
                    const impactForce = catapultState.projectileMass * 
                        Math.sqrt(catapultState.projectileVelX**2 + catapultState.projectileVelY**2) * 80;
                    const forceX = (dx / dist) * impactForce;
                    const forceY = (dy / dist) * impactForce;
                    assembly.applyForce(nodeIdx, forceX, forceY);
                    
                    if (Math.random() < 0.4) {
                        createCatapultParticle(node.x, node.y);
                    }
                }
            }
        }

    } else if (currentMode === 'collapse') {
        assembly.fixNode(0);
        assembly.fixNode(1);
        const lastTop = (bridgeState.segments) * 2;
        const lastBottom = (bridgeState.segments) * 2 + 1;
        assembly.fixNode(lastTop);
        assembly.fixNode(lastBottom);

        for (let element of elements) {
            if (!element.failed) {
                element.updateGeometry();
                assembly.addElement(element);
            }
        }

        for (let i = 2; i < nodes.length - 2; i++) {
            if (!nodes[i].fixed) {
                assembly.applyForce(i, 0, 500);
            }
        }

        if (bridgeState.testMode && bridgeState.vehicleOnBridge) {
            const vehicleProgress = (bridgeState.vehicleX - bridgeState.leftAnchorX) / 
                (bridgeState.rightAnchorX - bridgeState.leftAnchorX);
            
            if (vehicleProgress >= 0 && vehicleProgress <= 1) {
                const segmentFloat = vehicleProgress * bridgeState.segments;
                const segment = Math.floor(segmentFloat);
                const fraction = segmentFloat - segment;
                
                const topNode1 = Math.min(segment * 2, nodes.length - 2);
                const topNode2 = Math.min((segment + 1) * 2, nodes.length - 2);
                
                const vehicleLoad = bridgeState.vehicleMass * 10 * bridgeState.difficulty;
                
                if (topNode1 < nodes.length && !nodes[topNode1].fixed) {
                    assembly.applyForce(topNode1, 0, vehicleLoad * (1 - fraction));
                }
                if (topNode2 < nodes.length && !nodes[topNode2].fixed) {
                    assembly.applyForce(topNode2, 0, vehicleLoad * fraction);
                }
            }
        }
    }

    displacements = solver.solve(assembly);
    
    const stats = strainCalc.calculateAllStrains(elements, displacements);

    if (currentMode === 'turbine') {
        for (let elem of elements) {
            if (elem.failed && Math.random() < 0.05) {
                createShatteredPiece(elem);
            }
        }
        updateShatteredPieces();
    }

    updateStats(stats);
    audio.updateStrain(stats.totalStrainEnergy, currentMode === 'turbine' ? 10000 : currentMode === 'collapse' ? 12000 : currentMode === 'optimizer' ? 6000 : 8000);

    return stats;
}

function createShatteredPiece(element) {
    const n1 = element.nodes[element.n1];
    const n2 = element.nodes[element.n2];
    
    const midX = (n1.x + n2.x) / 2;
    const midY = (n1.y + n2.y) / 2;
    
    const dx = midX - turbineState.centerX;
    const dy = midY - turbineState.centerY;
    const r = Math.sqrt(dx * dx + dy * dy);
    
    if (r > 1e-6) {
        const tangentVelX = -dy * turbineState.angularVelocity;
        const tangentVelY = dx * turbineState.angularVelocity;
        
        const radialVelX = (dx / r) * turbineState.angularVelocity * r * 0.3;
        const radialVelY = (dy / r) * turbineState.angularVelocity * r * 0.3;
        
        turbineState.shatteredPieces.push({
            x: midX,
            y: midY,
            vx: tangentVelX + radialVelX + (Math.random() - 0.5) * 50,
            vy: tangentVelY + radialVelY + (Math.random() - 0.5) * 50,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.3,
            size: 5 + Math.random() * 8,
            life: 1.0
        });
        
        for (let j = 0; j < 8; j++) {
            turbineState.shatteredPieces.push({
                x: midX + (Math.random() - 0.5) * 30,
                y: midY + (Math.random() - 0.5) * 30,
                vx: tangentVelX * 0.7 + (Math.random() - 0.5) * 200,
                vy: tangentVelY * 0.7 + (Math.random() - 0.5) * 200,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.5,
                size: 2 + Math.random() * 4,
                life: 1.0
            });
        }
    }
}

function updateShatteredPieces() {
    for (let i = turbineState.shatteredPieces.length - 1; i >= 0; i--) {
        const piece = turbineState.shatteredPieces[i];
        
        piece.x += piece.vx * 0.016;
        piece.y += piece.vy * 0.016;
        piece.vy += 200 * 0.016;
        piece.rotation += piece.rotationSpeed;
        piece.life -= 0.008;
        
        if (piece.life <= 0 || piece.y > canvas.height + 50) {
            turbineState.shatteredPieces.splice(i, 1);
        }
    }
}

function updateStats(stats) {
    const safeUpdate = (id, content) => {
        const el = document.getElementById(id);
        if (el) el.textContent = content;
    };
    
    if (currentMode === 'crane') {
        // Wrecking ball stats - handled in drawWreckingScore
        
    } else if (currentMode === 'turbine') {
        const integrity = Math.max(0, 100 * (1 - stats.failedCount / elements.length));
        
    } else if (currentMode === 'optimizer') {
        // Optimizer stats handled in UI if needed
        
    } else if (currentMode === 'collapse') {
        // Bridge stats - handled in drawBridgeScore
    }
}

function animate() {
    if (!animationRunning && currentMode !== 'crane') return;

    time += 0.016;
    const dt = 0.016;

    if (currentMode === 'crane') {
        // WRECKING BALL PHYSICS
        if (wreckingState.released) {
            // Pendulum physics with gravity
            const dx = wreckingState.ballX - wreckingState.anchorX;
            const dy = wreckingState.ballY - wreckingState.anchorY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Apply gravity
            wreckingState.ballVelY += GRAVITY * 30 * dt;
            
            // Apply damping
            wreckingState.ballVelX *= 0.998;
            wreckingState.ballVelY *= 0.998;
            
            // Update position
            wreckingState.ballX += wreckingState.ballVelX * dt * 60;
            wreckingState.ballY += wreckingState.ballVelY * dt * 60;
            
            // Constrain to cable length (pendulum)
            const newDx = wreckingState.ballX - wreckingState.anchorX;
            const newDy = wreckingState.ballY - wreckingState.anchorY;
            const newDist = Math.sqrt(newDx * newDx + newDy * newDy);
            
            if (newDist > wreckingState.cableLength) {
                const scale = wreckingState.cableLength / newDist;
                wreckingState.ballX = wreckingState.anchorX + newDx * scale;
                wreckingState.ballY = wreckingState.anchorY + newDy * scale;
                
                // Remove radial velocity component
                const nx = newDx / newDist;
                const ny = newDy / newDist;
                const radialVel = wreckingState.ballVelX * nx + wreckingState.ballVelY * ny;
                if (radialVel > 0) {
                    wreckingState.ballVelX -= radialVel * nx * 0.8;
                    wreckingState.ballVelY -= radialVel * ny * 0.8;
                }
            }
        }
        
        // Update particles
        updateWreckingParticles();
        
        const stats = runFEA();
        
        // Count destroyed elements for score
        let destroyed = 0;
        for (let elem of elements) {
            if (elem.failed) destroyed++;
        }
        wreckingState.score = destroyed * 10;
        
    } else if (currentMode === 'turbine') {
        if (turbineState.spinning) {
            const rpmAcceleration = 50;
            if (turbineState.currentRPM < turbineState.targetRPM) {
                turbineState.currentRPM = Math.min(turbineState.targetRPM, turbineState.currentRPM + rpmAcceleration * dt);
            }
        } else {
            const rpmDeceleration = 80;
            turbineState.currentRPM = Math.max(0, turbineState.currentRPM - rpmDeceleration * dt);
        }

        turbineState.angularVelocity = (turbineState.currentRPM * 2 * Math.PI) / 60;
        
        let maxStress = 0;
        for (let elem of elements) {
            if (!elem.failed) {
                maxStress = Math.max(maxStress, elem.getStressRatio());
            }
        }
        if (turbineState.currentRPM > 200 && audio.updateStrain) {
            audio.updateStrain(maxStress * turbineState.currentRPM * 10, 5000);
        }

        const rotationAngle = turbineState.angularVelocity * dt;
        for (let i = 1; i < nodes.length; i++) {
            const dx = nodes[i].x - turbineState.centerX;
            const dy = nodes[i].y - turbineState.centerY;
            const r = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) + rotationAngle;
            nodes[i].x = turbineState.centerX + Math.cos(angle) * r;
            nodes[i].y = turbineState.centerY + Math.sin(angle) * r;
        }

        const stats = runFEA();

        if (stats.failedCount > elements.length * 0.3) {
            for (let i = 0; i < 5; i++) {
                createShatteredPiece(elements[Math.floor(Math.random() * elements.length)]);
            }
            turbineState.targetRPM = Math.max(0, turbineState.targetRPM - 100);
        }
        
    } else if (currentMode === 'optimizer') {
        if (catapultState.charging) {
            catapultState.chargeTime = Math.min(catapultState.chargeTime + dt, catapultState.maxCharge);
        }
        
        if (catapultState.projectileLaunched) {
            catapultState.projectileVelY += GRAVITY * 20 * dt;
            catapultState.projectileX += catapultState.projectileVelX * dt * 60;
            catapultState.projectileY += catapultState.projectileVelY * dt * 60;
            
            if (catapultState.projectileY > canvas.height - 80) {
                catapultState.projectileLaunched = false;
                catapultState.shotsLeft--;
                
                if (catapultState.shotsLeft <= 0) {
                    let destroyed = 0;
                    for (let elem of elements) {
                        if (elem.failed) destroyed++;
                    }
                    if (destroyed > elements.length * 0.5) {
                        catapultState.score += 500;
                    }
                }
                
                resetCatapult();
            }
        }
        
        updateCatapultParticles();
        
        let destroyed = 0;
        for (let elem of elements) {
            if (elem.failed) destroyed++;
        }
        catapultState.score = destroyed * 15;
        
        runFEA();
        
    } else if (currentMode === 'collapse') {
        if (bridgeState.testMode && !bridgeState.bridgeCollapsed) {
            bridgeState.vehicleX += bridgeState.vehicleSpeed * bridgeState.difficulty;
            
            if (bridgeState.vehicleX >= bridgeState.leftAnchorX && 
                bridgeState.vehicleX <= bridgeState.rightAnchorX) {
                bridgeState.vehicleOnBridge = true;
            } else {
                bridgeState.vehicleOnBridge = false;
            }
            
            if (bridgeState.vehicleX > bridgeState.rightAnchorX + 100) {
                bridgeState.vehiclePassed = true;
                bridgeState.testMode = false;
                bridgeState.score += 100 * bridgeState.difficulty;
                bridgeState.difficulty += 0.5;
                
                setTimeout(() => {
                    bridgeState.vehicleX = 50;
                    bridgeState.vehiclePassed = false;
                    const testBtn = document.getElementById('startBtn');
                    if (testBtn) {
                        testBtn.disabled = false;
                        testBtn.textContent = `TEST (Level ${Math.floor(bridgeState.difficulty)})`;
                    }
                }, 1500);
            }
            
            // Check for bridge collapse
            let failedCount = 0;
            for (let elem of elements) {
                if (elem.failed) failedCount++;
            }
            if (failedCount > elements.length * 0.3) {
                bridgeState.bridgeCollapsed = true;
                bridgeState.testMode = false;
                createBridgeCollapseParticles();
            }
        }
        
        updateBridgeParticles();
        runFEA();
    }

    if (currentMode === 'turbine') {
        drawTurbineStressIndicators();
    }
    
    renderer.renderTruss(nodes, elements, displacements);

    if (currentMode === 'crane') {
        drawWreckingBall();
        drawWreckingParticles();
        drawWreckingScore();
    } else if (currentMode === 'turbine') {
        drawShatteredPieces();
        drawCenter();
    } else if (currentMode === 'optimizer') {
        drawCatapult();
        drawCatapultParticles();
        drawCatapultScore();
    } else if (currentMode === 'collapse') {
        drawBridgeScene();
        drawVehicle();
        drawBridgeParticles();
        drawBridgeScore();
    }

    requestAnimationFrame(animate);
}

function drawWreckingBall() {
    const ctx = renderer.ctx;
    
    // Draw crane tower/anchor
    ctx.fillStyle = '#666';
    ctx.fillRect(wreckingState.anchorX - 20, wreckingState.anchorY - 30, 40, 30);
    ctx.fillRect(wreckingState.anchorX - 30, wreckingState.anchorY, 60, canvas.height - wreckingState.anchorY);
    
    // Draw cable
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(wreckingState.anchorX, wreckingState.anchorY);
    ctx.lineTo(wreckingState.ballX, wreckingState.ballY);
    ctx.stroke();
    
    // Draw wrecking ball with gradient
    const gradient = ctx.createRadialGradient(
        wreckingState.ballX - 10, wreckingState.ballY - 10, 5,
        wreckingState.ballX, wreckingState.ballY, wreckingState.ballRadius
    );
    gradient.addColorStop(0, '#888');
    gradient.addColorStop(0.5, '#444');
    gradient.addColorStop(1, '#222');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(wreckingState.ballX, wreckingState.ballY, wreckingState.ballRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Ball highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(wreckingState.ballX - 8, wreckingState.ballY - 8, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Ground
    ctx.fillStyle = '#333';
    ctx.fillRect(0, canvas.height - 100, canvas.width, 100);
    
    // Instruction text
    if (!wreckingState.released) {
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CLICK & DRAG BALL, THEN RELEASE TO SWING!', canvas.width / 2, 50);
    }
}

function createWreckingParticle(x, y) {
    for (let i = 0; i < 5; i++) {
        wreckingState.particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10 - 5,
            size: 3 + Math.random() * 8,
            life: 1.0,
            color: Math.random() > 0.5 ? '#ff6600' : '#ffaa00'
        });
    }
}

function updateWreckingParticles() {
    for (let i = wreckingState.particles.length - 1; i >= 0; i--) {
        const p = wreckingState.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.5; // Gravity
        p.life -= 0.02;
        if (p.life <= 0) {
            wreckingState.particles.splice(i, 1);
        }
    }
}

function drawWreckingParticles() {
    const ctx = renderer.ctx;
    for (let p of wreckingState.particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
}

function drawWreckingScore() {
    const ctx = renderer.ctx;
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`DESTRUCTION: ${wreckingState.score}`, 20, 80);
    
    // Count destroyed elements
    let destroyed = 0;
    for (let elem of elements) {
        if (elem.failed) destroyed++;
    }
    ctx.fillStyle = '#ff4444';
    ctx.fillText(`ELEMENTS DESTROYED: ${destroyed}/${elements.length}`, 20, 110);
}

function drawBridgeScene() {
    const ctx = renderer.ctx;
    
    // Draw ravine/water below
    ctx.fillStyle = '#1a3a5c';
    ctx.fillRect(bridgeState.leftAnchorX, bridgeState.bridgeY + 60, 
        bridgeState.rightAnchorX - bridgeState.leftAnchorX, 
        canvas.height - bridgeState.bridgeY - 60);
    
    // Draw ground/cliffs
    ctx.fillStyle = '#4a3520';
    ctx.fillRect(0, bridgeState.groundY, bridgeState.leftAnchorX, canvas.height - bridgeState.groundY);
    ctx.fillRect(bridgeState.rightAnchorX, bridgeState.groundY, 
        canvas.width - bridgeState.rightAnchorX, canvas.height - bridgeState.groundY);
    
    // Grass on top
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, bridgeState.groundY - 10, bridgeState.leftAnchorX, 15);
    ctx.fillRect(bridgeState.rightAnchorX, bridgeState.groundY - 10, 
        canvas.width - bridgeState.rightAnchorX, 15);
    
    // Anchor points
    ctx.fillStyle = '#666';
    ctx.fillRect(bridgeState.leftAnchorX - 20, bridgeState.bridgeY - 10, 25, 60);
    ctx.fillRect(bridgeState.rightAnchorX - 5, bridgeState.bridgeY - 10, 25, 60);
}

function drawVehicle() {
    const ctx = renderer.ctx;
    
    if (!bridgeState.testMode && !bridgeState.vehiclePassed && !bridgeState.bridgeCollapsed) return;
    
    // Calculate vehicle Y position based on bridge deformation
    let vehicleY = bridgeState.bridgeY - 25;
    
    if (bridgeState.vehicleOnBridge && nodes.length > 0) {
        const progress = (bridgeState.vehicleX - bridgeState.leftAnchorX) / 
            (bridgeState.rightAnchorX - bridgeState.leftAnchorX);
        const segment = Math.floor(progress * bridgeState.segments);
        const topNode = Math.min(segment * 2, nodes.length - 2);
        
        if (topNode < nodes.length && displacements.length > topNode * 2 + 1) {
            vehicleY = nodes[topNode].y + 
                (displacements[topNode * 2 + 1] || 0) * renderer.displacementScale - 25;
        }
    }
    
    // Draw vehicle (truck/car)
    const vx = bridgeState.vehicleX;
    
    // Truck body
    ctx.fillStyle = bridgeState.bridgeCollapsed ? '#ff4444' : '#3388ff';
    ctx.fillRect(vx - 30, vehicleY - 20, 60, 25);
    
    // Cabin
    ctx.fillStyle = bridgeState.bridgeCollapsed ? '#aa2222' : '#2266cc';
    ctx.fillRect(vx - 30, vehicleY - 35, 25, 15);
    
    // Wheels
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(vx - 18, vehicleY + 8, 8, 0, Math.PI * 2);
    ctx.arc(vx + 18, vehicleY + 8, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Weight indicator
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(bridgeState.vehicleMass * bridgeState.difficulty)}kg`, vx, vehicleY - 40);
    
    // Status message
    if (bridgeState.vehiclePassed) {
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 30px monospace';
        ctx.fillText('SUCCESS!', canvas.width / 2, 100);
    } else if (bridgeState.bridgeCollapsed) {
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 30px monospace';
        ctx.fillText('BRIDGE COLLAPSED!', canvas.width / 2, 100);
    }
}

function createBridgeCollapseParticles() {
    for (let i = 0; i < 30; i++) {
        const x = bridgeState.leftAnchorX + Math.random() * 
            (bridgeState.rightAnchorX - bridgeState.leftAnchorX);
        bridgeState.particles.push({
            x: x,
            y: bridgeState.bridgeY + Math.random() * 40,
            vx: (Math.random() - 0.5) * 8,
            vy: Math.random() * 5,
            size: 5 + Math.random() * 15,
            life: 1.0,
            rotation: Math.random() * Math.PI * 2
        });
    }
}

function updateBridgeParticles() {
    for (let i = bridgeState.particles.length - 1; i >= 0; i--) {
        const p = bridgeState.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3;
        p.rotation += 0.1;
        p.life -= 0.01;
        if (p.life <= 0 || p.y > canvas.height) {
            bridgeState.particles.splice(i, 1);
        }
    }
}

function drawBridgeParticles() {
    const ctx = renderer.ctx;
    for (let p of bridgeState.particles) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.life;
        ctx.fillStyle = '#8b7355';
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

function drawBridgeScore() {
    const ctx = renderer.ctx;
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${bridgeState.score}`, 20, 40);
    ctx.fillText(`LEVEL: ${Math.floor(bridgeState.difficulty)}`, 20, 70);
    
    let maxStress = 0;
    for (let elem of elements) {
        if (!elem.failed) {
            maxStress = Math.max(maxStress, elem.getStressRatio());
        }
    }
    
    const stressColor = maxStress < 0.5 ? '#00ff00' : maxStress < 0.8 ? '#ffff00' : '#ff0000';
    ctx.fillStyle = stressColor;
    ctx.fillText(`MAX STRESS: ${(maxStress * 100).toFixed(0)}%`, 20, 100);
}

function drawCatapult() {
    const ctx = renderer.ctx;
    
    ctx.fillStyle = '#333';
    ctx.fillRect(0, canvas.height - 100, canvas.width, 100);
    
    ctx.fillStyle = '#654321';
    ctx.fillRect(catapultState.baseX - 40, catapultState.baseY, 80, canvas.height - catapultState.baseY - 100);
    
    ctx.save();
    ctx.translate(catapultState.baseX, catapultState.baseY);
    ctx.rotate(catapultState.armAngle);
    
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-10, -catapultState.armLength * 0.2, 20, catapultState.armLength * 1.2);
    
    ctx.fillStyle = '#5C3317';
    ctx.beginPath();
    ctx.arc(catapultState.armLength, 0, 20, 0, Math.PI, true);
    ctx.fill();
    
    ctx.restore();
    
    if (!catapultState.projectileLaunched) {
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.arc(catapultState.projectileX, catapultState.projectileY, catapultState.projectileRadius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#777';
        ctx.beginPath();
        ctx.arc(catapultState.projectileX - 4, catapultState.projectileY - 4, 5, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.arc(catapultState.projectileX, catapultState.projectileY, catapultState.projectileRadius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(catapultState.projectileX, catapultState.projectileY);
        ctx.lineTo(catapultState.projectileX - catapultState.projectileVelX * 2, 
                   catapultState.projectileY - catapultState.projectileVelY * 2);
        ctx.stroke();
    }
    
    if (catapultState.charging) {
        const power = catapultState.chargeTime / catapultState.maxCharge;
        ctx.fillStyle = `rgb(${255 * power}, ${255 * (1-power)}, 0)`;
        ctx.fillRect(catapultState.baseX - 50, catapultState.baseY - 80, 100 * power, 20);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(catapultState.baseX - 50, catapultState.baseY - 80, 100, 20);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`POWER: ${Math.floor(power * 100)}%`, catapultState.baseX, catapultState.baseY - 90);
    }
    
    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    if (!catapultState.projectileLaunched && catapultState.shotsLeft > 0) {
        ctx.fillText('HOLD SPACE TO CHARGE, RELEASE TO FIRE!', canvas.width / 2, 50);
    }
}

function resetCatapult() {
    catapultState.armAngle = -0.5;
    catapultState.chargeTime = 0;
    catapultState.charging = false;
    updateProjectilePosition();
}

function launchProjectile(power) {
    const launchSpeed = 15 + power * 25 * catapultState.launchPower;
    const launchAngle = -0.8;
    
    catapultState.projectileVelX = Math.cos(launchAngle) * launchSpeed;
    catapultState.projectileVelY = Math.sin(launchAngle) * launchSpeed;
    catapultState.projectileLaunched = true;
    
    catapultState.armAngle = 0.3;
}

function createCatapultParticle(x, y) {
    for (let i = 0; i < 4; i++) {
        catapultState.particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() - 0.5) * 12 - 3,
            size: 4 + Math.random() * 10,
            life: 1.0,
            color: Math.random() > 0.5 ? '#8B7355' : '#A0522D'
        });
    }
}

function updateCatapultParticles() {
    for (let i = catapultState.particles.length - 1; i >= 0; i--) {
        const p = catapultState.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.4;
        p.life -= 0.025;
        if (p.life <= 0) {
            catapultState.particles.splice(i, 1);
        }
    }
}

function drawCatapultParticles() {
    const ctx = renderer.ctx;
    for (let p of catapultState.particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 3);
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

function drawCatapultScore() {
    const ctx = renderer.ctx;
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${catapultState.score}`, 20, 40);
    ctx.fillText(`SHOTS LEFT: ${catapultState.shotsLeft}`, 20, 70);
    
    let destroyed = 0;
    for (let elem of elements) {
        if (elem.failed) destroyed++;
    }
    ctx.fillStyle = '#ff6600';
    ctx.fillText(`DESTROYED: ${destroyed}/${elements.length}`, 20, 100);
}

function drawShatteredPieces() {
    const ctx = renderer.ctx;
    
    for (let piece of turbineState.shatteredPieces) {
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

function drawTurbineStressIndicators() {
    const ctx = renderer.ctx;
    
    let maxStress = 0;
    let criticalElements = 0;
    
    for (let elem of elements) {
        if (!elem.failed) {
            const ratio = elem.getStressRatio();
            if (ratio > maxStress) maxStress = ratio;
            if (ratio > 0.7) criticalElements++;
        }
    }
    
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    
    const stressPercent = (maxStress * 100).toFixed(1);
    const color = maxStress > 0.9 ? '#ff0000' : maxStress > 0.7 ? '#ff8800' : '#00ff00';
    
    ctx.fillStyle = color;
    ctx.fillText(`MAX STRESS: ${stressPercent}%`, 20, canvas.height - 60);
    
    if (criticalElements > 0) {
        ctx.fillStyle = '#ff4444';
        ctx.fillText(`⚠ ${criticalElements} BLADES CRITICAL`, 20, canvas.height - 35);
    }
    
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`RPM: ${turbineState.currentRPM.toFixed(0)}`, 20, canvas.height - 10);
}

function drawCenter() {
    const ctx = renderer.ctx;
    
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ffaa00';
    
    const gradient = ctx.createRadialGradient(turbineState.centerX, turbineState.centerY, 0, turbineState.centerX, turbineState.centerY, 50);
    gradient.addColorStop(0, '#ffaa00');
    gradient.addColorStop(0.7, '#ff6600');
    gradient.addColorStop(1, '#aa4400');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(turbineState.centerX, turbineState.centerY, 50, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STEEL', turbineState.centerX, turbineState.centerY - 5);
    ctx.fillText('HUB', turbineState.centerX, turbineState.centerY + 10);
}

function setupEventListeners() {
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (currentMode === 'crane') buildWreckingBall();
            else if (currentMode === 'turbine') buildTurbine();
            else if (currentMode === 'optimizer') buildCatapult();
            else if (currentMode === 'collapse') buildBridge();
        });
    }

    if (currentMode === 'crane') {
        const massSlider = document.getElementById('massSlider');
        const massLabel = document.getElementById('massLabel');
        const cableSlider = document.getElementById('cableSlider');
        const cableLabel = document.getElementById('cableLabel');
        
        if (massSlider && massLabel) {
            massLabel.textContent = `BALL MASS: ${wreckingState.ballMass} kg`;
            massSlider.value = wreckingState.ballMass;
            massSlider.addEventListener('input', (e) => {
                wreckingState.ballMass = parseInt(e.target.value);
                massLabel.textContent = `BALL MASS: ${wreckingState.ballMass} kg`;
                wreckingState.ballRadius = 20 + wreckingState.ballMass * 0.02;
            });
        }

        if (cableSlider && cableLabel) {
            cableSlider.value = wreckingState.cableLength;
            cableSlider.addEventListener('input', (e) => {
                wreckingState.cableLength = parseInt(e.target.value);
                cableLabel.textContent = `CABLE LENGTH: ${wreckingState.cableLength}`;
            });
        }

        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            
            const dx = mx - wreckingState.ballX;
            const dy = my - wreckingState.ballY;
            if (Math.sqrt(dx*dx + dy*dy) < wreckingState.ballRadius + 20) {
                wreckingState.dragging = true;
                wreckingState.released = false;
            }
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (wreckingState.dragging) {
                const rect = canvas.getBoundingClientRect();
                wreckingState.ballX = e.clientX - rect.left;
                wreckingState.ballY = e.clientY - rect.top;
                
                const dx = wreckingState.ballX - wreckingState.anchorX;
                const dy = wreckingState.ballY - wreckingState.anchorY;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist > wreckingState.cableLength) {
                    wreckingState.ballX = wreckingState.anchorX + dx / dist * wreckingState.cableLength;
                    wreckingState.ballY = wreckingState.anchorY + dy / dist * wreckingState.cableLength;
                }
            }
        });
        
        canvas.addEventListener('mouseup', (e) => {
            if (wreckingState.dragging) {
                wreckingState.dragging = false;
                wreckingState.released = true;
                wreckingState.swingCount++;
            }
        });
        
    } else if (currentMode === 'turbine') {
        const spinBtn = document.getElementById('spinBtn');
        const stopBtn = document.getElementById('stopBtn');
        const rpmSlider = document.getElementById('rpmSlider');
        const rpmLabel = document.getElementById('rpmLabel');
        const forceSlider = document.getElementById('forceSlider');
        const forceLabel = document.getElementById('forceLabel');
        const bladeSlider = document.getElementById('bladeSlider');
        const bladeLabel = document.getElementById('bladeLabel');
        
        if (rpmSlider && rpmLabel) {
            turbineState.maxRPM = 300;
            rpmSlider.addEventListener('input', (e) => {
                turbineState.maxRPM = parseInt(e.target.value);
                rpmLabel.textContent = `MAX RPM: ${turbineState.maxRPM}`;
            });
        }
        
        if (forceSlider && forceLabel) {
            turbineState.forceMultiplier = 1.0;
            forceSlider.addEventListener('input', (e) => {
                turbineState.forceMultiplier = parseInt(e.target.value) / 10;
                forceLabel.textContent = `CENTRIFUGAL: ${turbineState.forceMultiplier.toFixed(1)}x`;
            });
        }
        
        if (bladeSlider && bladeLabel) {
            turbineState.bladeThickness = 1.0;
            bladeSlider.addEventListener('input', (e) => {
                turbineState.bladeThickness = parseInt(e.target.value) / 10;
                bladeLabel.textContent = `BLADE THICK: ${turbineState.bladeThickness.toFixed(1)}x`;
                buildTurbine();
            });
        }
        
        if (spinBtn) {
            spinBtn.addEventListener('click', () => {
                turbineState.spinning = true;
                turbineState.targetRPM = Math.min(turbineState.maxRPM, turbineState.targetRPM + 100);
            });
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                turbineState.spinning = false;
                turbineState.targetRPM = 0;
            });
        }

        canvas.addEventListener('click', () => {
            if (!turbineState.spinning) {
                turbineState.spinning = true;
                turbineState.targetRPM = turbineState.maxRPM * 0.5;
            } else {
                turbineState.targetRPM = Math.min(turbineState.maxRPM, turbineState.targetRPM + 50);
            }
        });
        
    } else if (currentMode === 'optimizer') {
        const fireBtn = document.getElementById('fireBtn');
        const powerSlider = document.getElementById('powerSlider');
        const powerLabel = document.getElementById('powerLabel');
        const massSlider = document.getElementById('massSlider');
        const massLabel = document.getElementById('massLabel');
        
        if (powerSlider && powerLabel) {
            catapultState.launchPower = 1.0;
            powerSlider.addEventListener('input', (e) => {
                catapultState.launchPower = parseInt(e.target.value) / 10;
                powerLabel.textContent = `POWER: ${catapultState.launchPower.toFixed(1)}x`;
            });
        }
        
        if (massSlider && massLabel) {
            massSlider.addEventListener('input', (e) => {
                catapultState.projectileMass = parseInt(e.target.value);
                massLabel.textContent = `BOULDER: ${catapultState.projectileMass} kg`;
                catapultState.projectileRadius = 12 + (catapultState.projectileMass - 20) * 0.05;
            });
        }

        if (fireBtn) {
            fireBtn.addEventListener('click', () => {
                if (!catapultState.projectileLaunched && catapultState.shotsLeft > 0) {
                    launchProjectile(1.0);
                }
            });
        }
        
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !catapultState.charging && !catapultState.projectileLaunched && catapultState.shotsLeft > 0) {
                catapultState.charging = true;
                catapultState.chargeTime = 0;
                e.preventDefault();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && catapultState.charging) {
                launchProjectile(catapultState.chargeTime / catapultState.maxCharge);
                catapultState.charging = false;
                e.preventDefault();
            }
        });
        
    } else if (currentMode === 'collapse') {
        const startBtn = document.getElementById('startBtn');
        const segmentSlider = document.getElementById('segmentSlider');
        const segmentLabel = document.getElementById('segmentLabel');
        const vehicleSlider = document.getElementById('vehicleSlider');
        const vehicleLabel = document.getElementById('vehicleLabel');
        const speedSlider = document.getElementById('speedSlider');
        const speedLabel = document.getElementById('speedLabel');
        
        if (segmentSlider && segmentLabel) {
            segmentSlider.value = bridgeState.segments;
            segmentSlider.addEventListener('input', (e) => {
                bridgeState.segments = parseInt(e.target.value);
                segmentLabel.textContent = `SEGMENTS: ${bridgeState.segments}`;
                buildBridge();
            });
        }
        
        if (vehicleSlider && vehicleLabel) {
            vehicleSlider.value = bridgeState.vehicleMass;
            vehicleSlider.addEventListener('input', (e) => {
                bridgeState.vehicleMass = parseInt(e.target.value);
                vehicleLabel.textContent = `VEHICLE MASS: ${bridgeState.vehicleMass} kg`;
            });
        }
        
        if (speedSlider && speedLabel) {
            speedSlider.value = bridgeState.vehicleSpeed;
            speedSlider.addEventListener('input', (e) => {
                bridgeState.vehicleSpeed = parseInt(e.target.value);
                speedLabel.textContent = `SPEED: ${bridgeState.vehicleSpeed}x`;
            });
        }
        
        if (startBtn) {
            startBtn.textContent = 'TEST BRIDGE';
            startBtn.addEventListener('click', function() {
                if (!bridgeState.testMode && !bridgeState.bridgeCollapsed) {
                    bridgeState.testMode = true;
                    bridgeState.vehicleX = 50;
                    bridgeState.vehicleOnBridge = false;
                    bridgeState.vehiclePassed = false;
                    this.disabled = true;
                    this.textContent = 'TESTING...';
                } else if (bridgeState.bridgeCollapsed) {
                    buildBridge();
                    this.disabled = false;
                    this.textContent = 'TEST BRIDGE';
                }
            });
        }
    }
}

console.log('[INIT] Current mode:', currentMode);
console.log('[INIT] Canvas size:', canvas.width, 'x', canvas.height);

if (currentMode === 'crane') {
    buildWreckingBall();
    renderer.displacementScale = 15;
} else if (currentMode === 'turbine') {
    buildTurbine();
    renderer.displacementScale = 5;
} else if (currentMode === 'optimizer') {
    buildCatapult();
    renderer.displacementScale = 12;
} else if (currentMode === 'collapse') {
    buildBridge();
    renderer.displacementScale = 20;
}

console.log('[INIT] After build - nodes:', nodes.length, 'elements:', elements.length);

function showInstructions() {
    const modal = document.getElementById('instructionModal');
    const title = document.getElementById('instructionTitle');
    const text = document.getElementById('instructionText');
    
    const instructions = {
        crane: {
            title: 'DEMOLITION',
            text: `<p>Physics-based demolition with real FEA stress analysis!</p>
                   <p><strong>DRAG:</strong> Click and drag the wrecking ball</p>
                   <p><strong>RELEASE:</strong> Let go to swing and smash!</p>
                   <p><strong>GOAL:</strong> Destroy the building structure!</p>`
        },
        turbine: {
            title: 'TURBINE',
            text: `<p>Centrifugal force testing with glass blade analysis.</p>
                   <p><strong>SPIN UP:</strong> Increase rotation speed</p>
                   <p><strong>STOP:</strong> Halt rotation</p>
                   <p><strong>WATCH:</strong> Blades shatter under centrifugal force</p>`
        },
        optimizer: {
            title: 'SIEGE',
            text: `<p>Destroy the castle using catapult physics!</p>
                   <p><strong>SPACE:</strong> Hold to charge, release to fire</p>
                   <p><strong>POWER:</strong> Adjust launch power</p>
                   <p><strong>WATCH:</strong> Castle crumbles with stress analysis!</p>`
        },
        collapse: {
            title: 'BRIDGE',
            text: `<p>Test bridge design with heavy vehicles!</p>
                   <p><strong>TEST:</strong> Send a vehicle across</p>
                   <p><strong>LEVELS:</strong> Each success increases difficulty</p>
                   <p><strong>WATCH:</strong> Real-time stress shows weak points!</p>`
        }
    };
    
    const content = instructions[currentMode] || instructions.crane;
    title.textContent = content.title;
    text.innerHTML = content.text;
    modal.classList.add('show');
}

function closeInstruction() {
    document.getElementById('instructionModal').classList.remove('show');
}

window.closeInstruction = closeInstruction;

function initializeMode() {
    const modeIndicator = document.getElementById('modeIndicator');
    const modeNames = {
        crane: 'DEMOLITION',
        turbine: 'TURBINE',
        optimizer: 'SIEGE',
        collapse: 'BRIDGE'
    };
    
    if (modeIndicator) {
        modeIndicator.textContent = modeNames[currentMode] || 'UNKNOWN MODE';
    }
    
    document.querySelectorAll('.mode-controls').forEach(el => el.style.display = 'none');
    
    const controlIds = {
        crane: 'craneControls',
        turbine: 'turbineControls',
        optimizer: 'optimizerControls',
        collapse: 'collapseControls'
    };
    
    const controlElement = document.getElementById(controlIds[currentMode]);
    if (controlElement) {
        controlElement.style.display = 'flex';
    }
}

initializeMode();
setupEventListeners();
showInstructions();
animate();

// State management
let combatLogFile = null;
let rawCombatLogFile = null;
let wasmReady = false;
let currentState = null;

// DOM elements
const combatLogInput = document.getElementById('combatLog');
const rawCombatLogInput = document.getElementById('rawCombatLog');
const parseButton = document.getElementById('parseButton');
const statusDiv = document.getElementById('status');
const outputDiv = document.getElementById('output');
const resultsSection = document.getElementById('resultsSection');
const combatLogInfo = document.getElementById('combatLogInfo');
const rawCombatLogInfo = document.getElementById('rawCombatLogInfo');

// Initialize WASM
async function initWasm() {
    showStatus('loading', 'Loading WASM module...');
    
    try {
        const go = new Go();
        const result = await WebAssembly.instantiateStreaming(fetch('parser.wasm'), go.importObject);
        go.run(result.instance);
        
        wasmReady = true;
        showStatus('success', '✓ WASM module loaded successfully!');
        setTimeout(() => hideStatus(), 2000);
        
        console.log('WASM initialized successfully');
    } catch (error) {
        console.error('Failed to initialize WASM:', error);
        showStatus('error', `Failed to load WASM module: ${error.message}`);
    }
}

// File input handlers
combatLogInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        combatLogFile = file;
        combatLogInfo.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
        combatLogInfo.style.color = '#2e7d32';
        checkFilesReady();
    }
});

rawCombatLogInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        rawCombatLogFile = file;
        rawCombatLogInfo.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
        rawCombatLogInfo.style.color = '#2e7d32';
        checkFilesReady();
    }
});

// Check if both files are selected
function checkFilesReady() {
    if (combatLogFile && rawCombatLogFile && wasmReady) {
        parseButton.disabled = false;
    }
}

// Parse button handler
parseButton.addEventListener('click', async () => {
    if (!combatLogFile || !rawCombatLogFile) {
        showStatus('error', 'Please select both log files');
        return;
    }

    parseButton.disabled = true;
    showStatus('loading', '⏳ Parsing combat logs...');
    resultsSection.style.display = 'none';

    try {
        // Read both files as ArrayBuffer
        const combatLogBuffer = await readFileAsArrayBuffer(combatLogFile);
        const rawCombatLogBuffer = await readFileAsArrayBuffer(rawCombatLogFile);

        // Convert to Uint8Array for WASM
        const combatLogBytes = new Uint8Array(combatLogBuffer);
        const rawCombatLogBytes = new Uint8Array(rawCombatLogBuffer);

        console.log('Files loaded, calling WASM parser...');
        console.log('Combat log size:', combatLogBytes.length);
        console.log('Raw combat log size:', rawCombatLogBytes.length);

        // Call the WASM function
        const result = parseWoWLogs(combatLogBytes, rawCombatLogBytes);

        console.log('Parser result:', result);

        if (result.error) {
            showStatus('error', `Error: ${result.error}`);
            parseButton.disabled = false;
            return;
        }

        if (result.success) {
            showStatus('success', '✓ Parsing completed successfully!');
            displayResults(result.state);
            setTimeout(() => hideStatus(), 2000);
        }
    } catch (error) {
        console.error('Error parsing logs:', error);
        showStatus('error', `Error: ${error.message}`);
    } finally {
        parseButton.disabled = false;
        checkFilesReady();
    }
});

// Helper functions
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

function showStatus(type, message) {
    statusDiv.className = `status ${type}`;
    if (type === 'loading') {
        statusDiv.innerHTML = `<span class="spinner"></span>${message}`;
    } else {
        statusDiv.textContent = message;
    }
    statusDiv.style.display = 'block';
}

function hideStatus() {
    statusDiv.style.display = 'none';
}

function displayResults(stateJson) {
    try {
        const state = JSON.parse(stateJson);
        currentState = state;
        
        // Display raw JSON
        outputDiv.textContent = JSON.stringify(state, null, 2);
        
        // Create fight displays
        createFightsDisplay(state);
        
        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
        console.error('Error displaying results:', error);
        outputDiv.textContent = stateJson;
        resultsSection.style.display = 'block';
    }
}

function createFightsDisplay(state) {
    const fightsContainer = document.getElementById('fightsContainer');
    
    if (!state.Fights || !state.Fights.Fights || state.Fights.Fights.length === 0) {
        fightsContainer.innerHTML = '<div class="no-fights">No fights recorded in this log</div>';
        return;
    }
    
    // Filter completed fights only
    const fights = state.Fights.Fights.filter(fight => fight.Start && fight.End);
    
    if (fights.length === 0) {
        fightsContainer.innerHTML = '<div class="no-fights">No completed fights found</div>';
        return;
    }
    
    fightsContainer.innerHTML = '';
    
    // Summary header
    const summary = document.createElement('div');
    summary.className = 'fights-summary';
    summary.innerHTML = `<h3>🗡️ ${fights.length} Fight${fights.length !== 1 ? 's' : ''} Found</h3>`;
    fightsContainer.appendChild(summary);
    
    // Create fight cards
    fights.forEach((fight, index) => {
        const fightCard = createFightCard(fight, index + 1, state.Units);
        fightsContainer.appendChild(fightCard);
    });
}

function createFightCard(fight, fightNum, unitsDb) {
    const card = document.createElement('div');
    card.className = 'fight-card';
    
    // Calculate duration
    const startTime = new Date(fight.Start.Date);
    const endTime = new Date(fight.End.Date);
    const durationMs = endTime - startTime;
    const duration = formatDuration(durationMs / 1000);
    
    // Get zone info
    const zoneName = fight.CurrentZone?.Name || 'Unknown Zone';
    const instanceId = fight.CurrentZone?.InstanceID || 0;
    
    // Categorize units
    const friendlyUnits = [];
    const enemyUnits = [];
    const unknownUnits = [];
    
    // Process units in the fight
    for (const [guid, unitInfo] of Object.entries(fight.Units || {})) {
        if (fight.FriendlyActive && fight.FriendlyActive[guid] !== undefined) {
            friendlyUnits.push(unitInfo);
        } else if (fight.EnemiesActive && fight.EnemiesActive[guid] !== undefined) {
            enemyUnits.push(unitInfo);
        }
    }
    
    // Process unknown/remaining units
    for (const guid of Object.keys(fight.UnknownActive || {})) {
        unknownUnits.push({ Name: guid, Guid: guid });
    }
    
    // Get deaths
    const deaths = [];
    for (const [guid, deathTime] of Object.entries(fight.Deaths || {})) {
        const unitInfo = fight.Units[guid] || unitsDb?.Info?.[guid];
        const name = unitInfo?.Name || guid;
        deaths.push({ name, time: new Date(deathTime) });
    }
    
    card.innerHTML = `
        <div class="fight-header">
            <div class="fight-title">
                <h3>Fight #${fightNum}</h3>
                <span class="zone-badge">${escapeHtml(zoneName)}${instanceId > 0 ? ` (${instanceId})` : ''}</span>
            </div>
            <div class="fight-duration">
                ⏱️ ${duration}
            </div>
        </div>
        
        <div class="fight-body">
            <div class="units-section">
                <h4>👥 Friendly Units (${friendlyUnits.length})</h4>
                <div class="units-list friendly">
                    ${friendlyUnits.length > 0 
                        ? friendlyUnits.map(u => `<div class="unit-item">${escapeHtml(u.Name)}</div>`).join('')
                        : '<div class="no-units">None</div>'}
                </div>
            </div>
            
            <div class="units-section">
                <h4>⚔️ Hostile Units (${enemyUnits.length})</h4>
                <div class="units-list hostile">
                    ${enemyUnits.length > 0 
                        ? enemyUnits.map(u => `<div class="unit-item">${escapeHtml(u.Name)}</div>`).join('')
                        : '<div class="no-units">None</div>'}
                </div>
            </div>
            
            ${unknownUnits.length > 0 ? `
                <div class="units-section">
                    <h4>❓ Unknown Units (${unknownUnits.length})</h4>
                    <div class="units-list unknown">
                        ${unknownUnits.map(u => `<div class="unit-item">${escapeHtml(u.Name)}</div>`).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${deaths.length > 0 ? `
                <div class="units-section">
                    <h4>💀 Deaths (${deaths.length})</h4>
                    <div class="units-list deaths">
                        ${deaths.map(d => `<div class="unit-item">${escapeHtml(d.name)}</div>`).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    return card;
}

function formatDuration(seconds) {
    if (seconds < 1) {
        return `${Math.round(seconds * 1000)}ms`;
    }
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Toggle JSON view
document.getElementById('toggleJsonBtn').addEventListener('click', function() {
    const jsonOutput = document.getElementById('jsonOutput');
    if (jsonOutput.style.display === 'none' || !jsonOutput.style.display) {
        jsonOutput.style.display = 'block';
        this.textContent = '📋 Hide Raw JSON';
    } else {
        jsonOutput.style.display = 'none';
        this.textContent = '📋 Show Raw JSON';
    }
});

// Initialize on load
window.addEventListener('load', () => {
    initWasm();
});

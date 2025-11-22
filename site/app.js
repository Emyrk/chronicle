// State management
let combatLogFile = null;
let rawCombatLogFile = null;
let wasmReady = false;

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
}

function hideStatus() {
    statusDiv.className = 'status';
}

function displayResults(stateJson) {
    try {
        // Parse and re-stringify for pretty printing
        const state = JSON.parse(stateJson);
        
        // Display raw JSON
        outputDiv.textContent = JSON.stringify(state, null, 2);
        
        // Create graphical display
        createPlayerCards(state);
        
        resultsSection.style.display = 'block';
        
        // Scroll to results
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
        console.error('Error displaying results:', error);
        outputDiv.textContent = stateJson; // Display as-is if JSON parsing fails
        resultsSection.style.display = 'block';
    }
}

function createPlayerCards(state) {
    const playersGrid = document.getElementById('playersGrid');
    const summaryStats = document.getElementById('summaryStats');
    
    if (!state.Participants || !state.ParticipantCasts) {
        playersGrid.innerHTML = '<div class="no-spells">No player data found</div>';
        return;
    }
    
    // Calculate summary statistics
    const playerCount = Object.keys(state.Participants).length;
    let totalSpells = 0;
    let totalUniqueSpells = 0;
    
    for (const guid in state.ParticipantCasts) {
        const spells = state.ParticipantCasts[guid];
        if (spells) {
            totalUniqueSpells += Object.keys(spells).length;
            totalSpells += Object.keys(spells).length;
        }
    }
    
    // Display summary stats
    summaryStats.innerHTML = `
        <div class="stat-item">
            <h3>${playerCount}</h3>
            <p>Players</p>
        </div>
        <div class="stat-item">
            <h3>${totalUniqueSpells}</h3>
            <p>Unique Spells</p>
        </div>
        <div class="stat-item">
            <h3>${Math.round(totalSpells / playerCount)}</h3>
            <p>Avg Spells/Player</p>
        </div>
    `;
    
    // Create player cards
    playersGrid.innerHTML = '';
    
    for (const guid in state.Participants) {
        const participants = state.Participants[guid];
        if (!participants || participants.length === 0) continue;
        
        const player = participants[0]; // Get first instance
        const spells = state.ParticipantCasts[guid] || {};
        const spellCount = Object.keys(spells).length;
        
        const playerClass = (player.HeroClass || 'Unknown').toLowerCase();
        
        const card = document.createElement('div');
        card.className = `player-card ${playerClass}`;
        
        // Create spell items HTML
        let spellsHTML = '';
        if (spellCount > 0) {
            const sortedSpells = Object.values(spells).sort((a, b) => 
                a.Name.localeCompare(b.Name)
            );
            
            spellsHTML = sortedSpells.map(spell => `
                <div class="spell-item">
                    <span class="spell-name">${escapeHtml(spell.Name)}</span>
                    <span class="spell-id">#${spell.ID}</span>
                </div>
            `).join('');
        } else {
            spellsHTML = '<div class="no-spells">No spells recorded</div>';
        }
        
        card.innerHTML = `
            <div class="player-header">
                <div class="player-info">
                    <h3>${escapeHtml(player.Name)}</h3>
                    <span class="player-class ${playerClass}">${player.HeroClass}</span>
                </div>
                <div class="spell-count">
                    ${spellCount} ${spellCount === 1 ? 'Spell' : 'Spells'}
                </div>
            </div>
            <div class="spells-list">
                <h4>Spells Cast</h4>
                ${spellsHTML}
            </div>
        `;
        
        playersGrid.appendChild(card);
    }
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

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Initialize WASM on page load
initWasm();

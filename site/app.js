// State management
let combatLogFile = null;
let rawCombatLogFile = null;
let wasmReady = false;

// NPC Database - maps NPC ID to name
// This is hardcoded for now, will be replaced with API lookup later
const NPC_DATABASE = {
    // Common Vanilla WoW NPCs
    // Molten Core
    11502: "Ragnaros",
    12118: "Lucifron",
    11982: "Magmadar",
    12259: "Gehennas",
    12057: "Garr",
    12264: "Shazzrah",
    12056: "Baron Geddon",
    12098: "Sulfuron Harbinger",
    11988: "Golemagg the Incinerator",
    12018: "Majordomo Executus",
    
    // Blackwing Lair
    12435: "Razorgore the Untamed",
    13020: "Vaelastrasz the Corrupt",
    12017: "Broodlord Lashlayer",
    11983: "Firemaw",
    14020: "Chromaggus",
    11981: "Nefarian",
    
    // Zul'Gurub
    14517: "High Priestess Jeklik",
    14509: "High Priest Venoxis",
    14510: "High Priestess Mar'li",
    14834: "Hakkar",
    
    // AQ40
    15263: "The Prophet Skeram",
    15510: "Fankriss the Unyielding",
    15516: "Battleguard Sartura",
    15509: "Princess Huhuran",
    15276: "Emperor Vek'lor",
    15275: "Emperor Vek'nilash",
    15727: "C'Thun",
    
    // Naxxramas
    15956: "Anub'Rekhan",
    15953: "Grand Widow Faerlina",
    15952: "Maexxna",
    16061: "Instructor Razuvious",
    16060: "Gothik the Harvester",
    16063: "The Four Horsemen",
    15954: "Noth the Plaguebringer",
    15936: "Heigan the Unclean",
    16011: "Loatheb",
    16028: "Patchwerk",
    15931: "Grobbulus",
    15932: "Gluth",
    15928: "Thaddius",
    15989: "Sapphiron",
    15990: "Kel'Thuzad",
    
    // World Bosses
    6109: "Azuregos",
    14887: "Ysondre",
    14888: "Lethon",
    14889: "Emeriss",
    14890: "Taerar",
    12397: "Lord Kazzak",
    
    // Common dungeon bosses
    9017: "Lord Incendius",
    9041: "Warder Stilgiss",
    10363: "General Drakkisath",
    10429: "Warchief Rend Blackhand",
    
    // Default fallback
    0: "Unknown NPC"
};

function getNPCName(npcId) {
    return NPC_DATABASE[npcId] || `NPC ${npcId}`;
}

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
        
        // Create graphical displays
        createFightsDisplay(state);
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

function createFightsDisplay(state) {
    const fightsContainer = document.getElementById('fightsContainer');
    
    if (!state.Fights || state.Fights.length === 0) {
        fightsContainer.innerHTML = '<div class="no-fights">No fights recorded in this log</div>';
        return;
    }
    
    const fights = state.Fights;
    
    fightsContainer.innerHTML = `
        <div class="fights-summary">
            <h3>🗡️ ${fights.length} Fight${fights.length !== 1 ? 's' : ''} Recorded</h3>
        </div>
    `;
    
    fights.forEach((fight, index) => {
        const fightCard = document.createElement('div');
        fightCard.className = 'fight-card';
        
        // Calculate fight duration
        const startTime = new Date(fight.Started);
        const endTime = new Date(fight.Ended);
        const durationMs = endTime - startTime;
        const durationSec = durationMs / 1000;
        
        // Get all participant GUIDs
        const allGuids = Object.keys(fight.Participants || {});
        
        // Categorize participants based on GUID type
        const friendlyGuids = [];
        const enemyGuids = [];
        
        allGuids.forEach(guid => {
            const guidHex = guid.replace('0x', '');
            const guidInt = BigInt('0x' + guidHex);
            
            // Check if player or pet (high bits & 0x00F0)
            const high16 = Number((guidInt >> 48n) & 0xFFFFn);
            const typeBits = high16 & 0x00F0;
            const isPlayer = typeBits === 0x0000;
            const isPet = typeBits === 0x0040;
            
            if (isPlayer || isPet) {
                friendlyGuids.push(guid);
            } else {
                enemyGuids.push(guid);
            }
        });
        
        // Build friendly participants list
        let friendlyHTML = '';
        friendlyGuids.forEach(guid => {
            const combatant = state.Participants[guid];
            const damageDone = fight.DamageDone[guid] || 0;
            const damageTaken = fight.DamageTaken[guid] || 0;
            const dps = durationSec > 0 ? Math.round(damageDone / durationSec) : 0;
            
            if (combatant) {
                // Player with combatant info
                const playerClass = (combatant.HeroClass || 'Unknown').toLowerCase();
                friendlyHTML += `
                    <div class="participant-item player-participant">
                        <span class="participant-class-badge ${playerClass}" title="${combatant.HeroClass}"></span>
                        <span class="participant-name">${escapeHtml(combatant.Name)}</span>
                        <div class="participant-stats">
                            <span class="stat-dps" title="Damage Per Second">⚡ ${formatNumber(dps)}/s</span>
                            <span class="stat-damage-done" title="Total Damage Done">⚔️ ${formatNumber(damageDone)}</span>
                            <span class="stat-damage-taken" title="Total Damage Taken">🛡️ ${formatNumber(damageTaken)}</span>
                        </div>
                    </div>
                `;
            } else {
                // Pet or unknown - extract entry ID
                const guidHex = guid.replace('0x', '');
                const guidInt = BigInt('0x' + guidHex);
                const entryId = Number((guidInt >> 24n) & 0xFFFFFFn);
                const name = getNPCName(entryId);
                
                friendlyHTML += `
                    <div class="participant-item player-participant">
                        <span class="participant-icon">🐾</span>
                        <span class="participant-name">${escapeHtml(name)}</span>
                        <div class="participant-stats">
                            <span class="stat-dps" title="Damage Per Second">⚡ ${formatNumber(dps)}/s</span>
                            <span class="stat-damage-done" title="Total Damage Done">⚔️ ${formatNumber(damageDone)}</span>
                            <span class="stat-damage-taken" title="Total Damage Taken">🛡️ ${formatNumber(damageTaken)}</span>
                        </div>
                    </div>
                `;
            }
        });
        
        // Build enemy participants list
        let enemiesHTML = '';
        enemyGuids.forEach(guid => {
            const guidHex = guid.replace('0x', '');
            const guidInt = BigInt('0x' + guidHex);
            const entryId = Number((guidInt >> 24n) & 0xFFFFFFn);
            const npcName = getNPCName(entryId);
            const damageDone = fight.DamageDone[guid] || 0;
            const damageTaken = fight.DamageTaken[guid] || 0;
            const dps = durationSec > 0 ? Math.round(damageDone / durationSec) : 0;
            
            enemiesHTML += `
                <div class="participant-item enemy-participant">
                    <span class="participant-icon">🔥</span>
                    <div class="participant-info">
                        <span class="participant-name">${escapeHtml(npcName)}</span>
                        <span class="participant-id">(${entryId})</span>
                    </div>
                    <div class="participant-stats">
                        <span class="stat-dps" title="Damage Per Second">⚡ ${formatNumber(dps)}/s</span>
                        <span class="stat-damage-done" title="Total Damage Done">⚔️ ${formatNumber(damageDone)}</span>
                        <span class="stat-damage-taken" title="Total Damage Taken">🛡️ ${formatNumber(damageTaken)}</span>
                    </div>
                </div>
            `;
        });
        
        if (friendlyHTML === '') {
            friendlyHTML = '<div class="no-participants">No friendly participants recorded</div>';
        }
        if (enemiesHTML === '') {
            enemiesHTML = '<div class="no-participants">No enemies recorded</div>';
        }
        
        // Format duration
        const durationStr = formatDuration(durationSec);
        
        // Zone info
        const zoneName = fight.Zone?.Name || 'Unknown Zone';
        const instanceId = fight.Zone?.InstanceID || 0;
        
        fightCard.innerHTML = `
            <div class="fight-header">
                <div class="fight-title">
                    <h3>Fight ${index + 1}</h3>
                    <div class="fight-meta">
                        <span class="fight-zone" title="Zone">📍 ${escapeHtml(zoneName)}${instanceId ? ` (${instanceId})` : ''}</span>
                        <span class="fight-duration" title="Duration">⏱️ ${durationStr}</span>
                    </div>
                </div>
                <div class="fight-stats">
                    <span class="fight-stat">👥 ${friendlyGuids.length} friendl${friendlyGuids.length !== 1 ? 'ies' : 'y'}</span>
                    <span class="fight-stat">⚔️ ${enemyGuids.length} enem${enemyGuids.length !== 1 ? 'ies' : 'y'}</span>
                </div>
            </div>
            <div class="fight-content">
                <div class="participants-section">
                    <h4>Friendly</h4>
                    <div class="participants-list">
                        ${friendlyHTML}
                    </div>
                </div>
                <div class="participants-section">
                    <h4>Enemies</h4>
                    <div class="participants-list">
                        ${enemiesHTML}
                    </div>
                </div>
            </div>
        `;
        
        fightsContainer.appendChild(fightCard);
    });
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

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDuration(seconds) {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
}

// Initialize WASM on page load
initWasm();

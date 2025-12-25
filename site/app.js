// State management
let combatLogFile = null;
let rawCombatLogFile = null;
let wasmReady = false;
let currentTimeline = null;

// DOM elements
const combatLogInput = document.getElementById('combatLog');
const rawCombatLogInput = document.getElementById('rawCombatLog');
const parseButton = document.getElementById('parseButton');
const statusDiv = document.getElementById('status');
const resultsSection = document.getElementById('resultsSection');
const instancesContainer = document.getElementById('instancesContainer');
const fightsContainer = document.getElementById('fightsContainer');
const combatLogInfo = document.getElementById('combatLogInfo');
const rawCombatLogInfo = document.getElementById('rawCombatLogInfo');

// Tab management
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        switchTab(tabName);
    });
});

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        if (t.getAttribute('data-tab') === tabName) {
            t.classList.add('active');
        }
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    if (tabName === 'characters') {
        document.getElementById('charactersTab').classList.add('active');
    } else if (tabName === 'fights') {
        document.getElementById('fightsTab').classList.add('active');
    }
}

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
            showStatus('success', '✓ Timeline created successfully!');
            displayTimeline(result.timeline);
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

function displayTimeline(timelineJson) {
    try {
        const timeline = JSON.parse(timelineJson);
        currentTimeline = timeline;
        
        console.log('Timeline data:', timeline);
        
        // Create timeline visualization
        createTimelineDisplay(timeline);
        
        // Create fights display
        createFightsDisplay(timeline);
        
        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
        console.error('Error displaying timeline:', error);
        showStatus('error', `Failed to display timeline: ${error.message}`);
    }
}

function createTimelineDisplay(timeline) {
    if (!timeline.instances || timeline.instances.length === 0) {
        instancesContainer.innerHTML = '<div class="no-instances">No instances found in the combat log</div>';
        return;
    }
    
    instancesContainer.innerHTML = '';
    
    // Create a card for each instance
    timeline.instances.forEach((instance, index) => {
        const instanceCard = createInstanceCard(instance, index);
        instancesContainer.appendChild(instanceCard);
    });
}

function createInstanceCard(instance, index) {
    const card = document.createElement('div');
    card.className = 'instance-card';
    
    if (!instance.characters || instance.characters.length === 0) {
        card.innerHTML = `
            <div class="instance-header">
                ${escapeHtml(instance.name)}
            </div>
            <div class="timeline-container">
                <div class="no-instances">No character activity recorded</div>
            </div>
        `;
        return card;
    }
    
    // Find the time range for this instance
    const timeRange = getInstanceTimeRange(instance);
    
    if (!timeRange) {
        card.innerHTML = `
            <div class="instance-header">
                ${escapeHtml(instance.name)}
            </div>
            <div class="timeline-container">
                <div class="no-instances">No valid activity periods found</div>
            </div>
        `;
        return card;
    }
    
    const header = document.createElement('div');
    header.className = 'instance-header';
    header.textContent = `${instance.name} (${instance.characters.length} characters)`;
    
    const timelineContainer = document.createElement('div');
    timelineContainer.className = 'timeline-container';
    
    const timeline = createTimeline(instance.characters, timeRange);
    timelineContainer.appendChild(timeline);
    
    card.appendChild(header);
    card.appendChild(timelineContainer);
    
    return card;
}

function getInstanceTimeRange(instance) {
    let minTime = null;
    let maxTime = null;
    
    instance.characters.forEach(char => {
        char.periods.forEach(period => {
            const start = new Date(period.start);
            const end = period.end ? new Date(period.end) : new Date();
            
            if (!minTime || start < minTime) minTime = start;
            if (!maxTime || end > maxTime) maxTime = end;
        });
    });
    
    return minTime && maxTime ? { start: minTime, end: maxTime } : null;
}

// Detect if any periods overlap in time
function detectOverlappingPeriods(periods) {
    if (periods.length <= 1) return false;
    
    for (let i = 0; i < periods.length; i++) {
        const period1 = periods[i];
        const start1 = new Date(period1.start);
        const end1 = period1.end ? new Date(period1.end) : new Date();
        
        for (let j = i + 1; j < periods.length; j++) {
            const period2 = periods[j];
            const start2 = new Date(period2.start);
            const end2 = period2.end ? new Date(period2.end) : new Date();
            
            // Check if periods overlap
            if (start1 < end2 && start2 < end1) {
                return true;
            }
        }
    }
    
    return false;
}

// Assign overlapping periods to separate layers (rows)
function assignPeriodsToLayers(periods) {
    // Sort periods by start time
    const sortedPeriods = [...periods].sort((a, b) => {
        return new Date(a.start) - new Date(b.start);
    });
    
    const layers = [];
    
    sortedPeriods.forEach(period => {
        const start = new Date(period.start);
        const end = period.end ? new Date(period.end) : new Date();
        
        // Find the first layer where this period doesn't overlap
        let placed = false;
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            let canPlace = true;
            
            // Check if this period overlaps with any period in this layer
            for (const existingPeriod of layer) {
                const existingStart = new Date(existingPeriod.start);
                const existingEnd = existingPeriod.end ? new Date(existingPeriod.end) : new Date();
                
                if (start < existingEnd && existingStart < end) {
                    canPlace = false;
                    break;
                }
            }
            
            if (canPlace) {
                layer.push(period);
                placed = true;
                break;
            }
        }
        
        // If we couldn't place it in any existing layer, create a new one
        if (!placed) {
            layers.push([period]);
        }
    });
    
    return layers;
}

function createTimeline(characters, timeRange) {
    const timeline = document.createElement('div');
    timeline.className = 'timeline';
    
    const duration = timeRange.end - timeRange.start;
    
    // Create header with time labels
    const header = document.createElement('div');
    header.className = 'timeline-header';
    header.innerHTML = `
        <div class="character-name-column">Character</div>
        <div class="timeline-grid">
            <div class="time-labels">
                <span>${formatTime(timeRange.start)}</span>
                <span>${formatTime(new Date(timeRange.start.getTime() + duration / 2))}</span>
                <span>${formatTime(timeRange.end)}</span>
            </div>
        </div>
    `;
    timeline.appendChild(header);
    
    // Sort characters - players first, then by name
    const sortedCharacters = [...characters].sort((a, b) => {
        // Players come before non-players
        if (a.isPlayer !== b.isPlayer) {
            return b.isPlayer ? 1 : -1;
        }
        // Within the same category, sort alphabetically by name
        return a.characterName.localeCompare(b.characterName);
    });
    
    // Create a row for each character
    sortedCharacters.forEach(character => {
        const row = createCharacterRow(character, timeRange, duration);
        timeline.appendChild(row);
    });
    
    return timeline;
}

function createCharacterRow(character, timeRange, duration) {
    const row = document.createElement('div');
    row.className = 'character-row';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'character-name';
    
    // Check for overlapping periods
    const hasOverlaps = detectOverlappingPeriods(character.periods);
    
    // Add warning icon if there are overlaps
    if (hasOverlaps) {
        const warningIcon = document.createElement('span');
        warningIcon.className = 'overlap-warning';
        warningIcon.title = 'This character has overlapping activity periods!';
        warningIcon.textContent = '⚠️';
        nameDiv.appendChild(warningIcon);
        nameDiv.appendChild(document.createTextNode(' '));
    }
    
    nameDiv.appendChild(document.createTextNode(character.characterName));
    
    const track = document.createElement('div');
    track.className = 'activity-track';
    
    // If there are overlaps, use multi-row layout
    if (hasOverlaps) {
        track.classList.add('has-overlaps');
        const layers = assignPeriodsToLayers(character.periods);
        
        // Create a sub-track for each layer
        layers.forEach((layerPeriods, layerIndex) => {
            const subTrack = document.createElement('div');
            subTrack.className = 'activity-subtrack';
            subTrack.style.top = `${layerIndex * 35}px`;
            
            layerPeriods.forEach(period => {
                const periodDiv = createActivityPeriod(period, timeRange, duration);
                periodDiv.classList.add('overlapping');
                subTrack.appendChild(periodDiv);
            });
            
            track.appendChild(subTrack);
        });
        
        // Adjust track height to accommodate all layers
        track.style.height = `${layers.length * 35}px`;
    } else {
        // Normal single-row layout
        character.periods.forEach(period => {
            const periodDiv = createActivityPeriod(period, timeRange, duration);
            track.appendChild(periodDiv);
        });
    }
    
    row.appendChild(nameDiv);
    row.appendChild(track);
    
    return row;
}

function createActivityPeriod(period, timeRange, duration) {
    const periodDiv = document.createElement('div');
    periodDiv.className = 'activity-period';
    
    const start = new Date(period.start);
    const end = period.end ? new Date(period.end) : new Date();
    
    // Calculate position and width as percentage
    const startOffset = ((start - timeRange.start) / duration) * 100;
    const periodDuration = ((end - start) / duration) * 100;
    
    periodDiv.style.left = `${Math.max(0, startOffset)}%`;
    periodDiv.style.width = `${Math.max(0.5, periodDuration)}%`;
    
    // Add class based on end reason
    if (period.end) {
        if (period.endReason === 'slain') {
            periodDiv.classList.add('slain');
        } else if (period.endReason === 'timeout') {
            periodDiv.classList.add('timeout');
        } else {
            // Default ended class for other reasons
            periodDiv.classList.add('ended');
        }
    }
    
    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.innerHTML = `
        <strong>Start:</strong> ${formatTime(start)}<br>
        ${period.end ? `<strong>End:</strong> ${formatTime(end)}<br>` : '<strong>Status:</strong> Still active<br>'}
        <strong>Duration:</strong> ${formatDuration((end - start) / 1000)}<br>
        ${period.startReason ? `<strong>Reason:</strong> ${escapeHtml(period.startReason)}` : ''}
        ${period.endReason ? `<br><strong>End reason:</strong> ${escapeHtml(period.endReason)}` : ''}
    `;
    periodDiv.appendChild(tooltip);
    
    return periodDiv;
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

function formatTime(date) {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

function createFightsDisplay(timeline) {
    if (!timeline.instances || timeline.instances.length === 0) {
        fightsContainer.innerHTML = '<div class="no-instances">No instances found in the combat log</div>';
        return;
    }
    
    fightsContainer.innerHTML = '';
    
    // Create a card for each instance's encounters
    timeline.instances.forEach((instance, index) => {
        if (!instance.encounters || instance.encounters.length === 0) {
            return; // Skip instances with no encounters
        }
        
        const instanceCard = createInstanceEncountersCard(instance);
        fightsContainer.appendChild(instanceCard);
    });
}

function createInstanceEncountersCard(instance) {
    const card = document.createElement('div');
    card.className = 'instance-card';
    
    const header = document.createElement('div');
    header.className = 'instance-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    const title = document.createElement('h3');
    title.textContent = instance.name || instance.zoneId;
    title.style.margin = '0';
    
    const encounterCount = document.createElement('span');
    encounterCount.className = 'zone-badge';
    encounterCount.textContent = `${instance.encounters.length} Encounter${instance.encounters.length !== 1 ? 's' : ''}`;
    
    header.appendChild(title);
    header.appendChild(encounterCount);
    card.appendChild(header);
    
    const body = document.createElement('div');
    body.style.padding = '20px';
    
    // Add each encounter
    instance.encounters.forEach((encounter, index) => {
        const encounterCard = createEncounterCard(encounter, index + 1);
        body.appendChild(encounterCard);
    });
    
    card.appendChild(body);
    return card;
}

function createEncounterCard(encounter, encounterNumber) {
    const card = document.createElement('div');
    card.className = 'fight-card';
    
    // Encounter header
    const header = document.createElement('div');
    header.className = 'fight-header';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'fight-title';
    
    const title = document.createElement('h3');
    const encounterName = encounter.name || `Encounter ${encounterNumber}`;
    const killStatus = encounter.isKill ? '✅ Kill' : '❌ Wipe';
    title.textContent = `${encounterName} - ${killStatus}`;
    
    const typeAndHostiles = document.createElement('div');
    typeAndHostiles.style.display = 'flex';
    typeAndHostiles.style.gap = '8px';
    
    const typeBadge = document.createElement('span');
    typeBadge.className = 'zone-badge';
    typeBadge.style.background = encounter.type === 'BOSS' ? '#dc3545' : '#6c757d';
    typeBadge.textContent = encounter.type;
    
    const hostileCount = document.createElement('span');
    hostileCount.className = 'zone-badge';
    hostileCount.textContent = `${encounter.hostiles.length} Hostile${encounter.hostiles.length !== 1 ? 's' : ''}`;
    
    typeAndHostiles.appendChild(typeBadge);
    typeAndHostiles.appendChild(hostileCount);
    titleDiv.appendChild(title);
    titleDiv.appendChild(typeAndHostiles);
    
    const duration = document.createElement('div');
    duration.className = 'fight-duration';
    duration.textContent = formatDuration(encounter.duration);
    
    header.appendChild(titleDiv);
    header.appendChild(duration);
    card.appendChild(header);
    
    // Encounter body
    const body = document.createElement('div');
    body.style.padding = '20px';
    body.style.background = '#f8f9fa';
    
    // Time info
    const timeInfo = document.createElement('div');
    timeInfo.style.marginBottom = '20px';
    timeInfo.style.padding = '15px';
    timeInfo.style.background = 'white';
    timeInfo.style.borderRadius = '8px';
    timeInfo.style.border = '1px solid #e0e0e0';
    
    const startTime = new Date(encounter.start);
    const endTime = new Date(encounter.end);
    
    timeInfo.innerHTML = `
        <div style="display: flex; gap: 30px; font-size: 0.95em;">
            <div>
                <strong style="color: #667eea;">⏱️ Start:</strong> 
                <span>${startTime.toLocaleTimeString()}.${startTime.getMilliseconds().toString().padStart(3, '0')}</span>
            </div>
            <div>
                <strong style="color: #667eea;">⏱️ End:</strong> 
                <span>${endTime.toLocaleTimeString()}.${endTime.getMilliseconds().toString().padStart(3, '0')}</span>
            </div>
            <div>
                <strong style="color: #667eea;">⏱️ Duration:</strong> 
                <span>${formatDuration(encounter.duration)}</span>
            </div>
        </div>
    `;
    body.appendChild(timeInfo);
    
    // Damage tracking section
    if (encounter.damage && encounter.damage.totalDealt && Object.keys(encounter.damage.totalDealt).length > 0) {
        const damageSection = createDamageTrackingSection(encounter.damage);
        body.appendChild(damageSection);
    }
    
    // Hostiles section
    const hostilesTitle = document.createElement('h4');
    hostilesTitle.textContent = '⚔️ Hostile Characters';
    hostilesTitle.style.margin = '20px 0 15px 0';
    hostilesTitle.style.color = '#333';
    body.appendChild(hostilesTitle);
    
    const hostilesGrid = document.createElement('div');
    hostilesGrid.style.display = 'grid';
    hostilesGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
    hostilesGrid.style.gap = '15px';
    
    encounter.hostiles.forEach(hostile => {
        const hostileCard = createHostileCard(hostile);
        hostilesGrid.appendChild(hostileCard);
    });
    
    body.appendChild(hostilesGrid);
    card.appendChild(body);
    
    return card;
}

function createHostileCard(hostile) {
    const card = document.createElement('div');
    card.style.background = 'white';
    card.style.padding = '15px';
    card.style.borderRadius = '8px';
    card.style.border = '2px solid #e0e0e0';
    card.style.transition = 'all 0.2s ease';
    
    card.addEventListener('mouseenter', () => {
        card.style.borderColor = '#667eea';
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
    });
    
    card.addEventListener('mouseleave', () => {
        card.style.borderColor = '#e0e0e0';
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = 'none';
    });
    
    const name = document.createElement('div');
    name.style.fontWeight = '600';
    name.style.fontSize = '1.05em';
    name.style.color = '#333';
    name.style.marginBottom = '10px';
    name.textContent = hostile.characterName;
    card.appendChild(name);
    
    const id = document.createElement('div');
    id.style.fontSize = '0.85em';
    id.style.color = '#666';
    id.style.marginBottom = '12px';
    id.style.fontFamily = 'monospace';
    id.textContent = `ID: ${hostile.characterId}`;
    card.appendChild(id);
    
    // Activity periods
    if (hostile.periods && hostile.periods.length > 0) {
        const periodsTitle = document.createElement('div');
        periodsTitle.style.fontSize = '0.9em';
        periodsTitle.style.fontWeight = '600';
        periodsTitle.style.color = '#667eea';
        periodsTitle.style.marginBottom = '8px';
        periodsTitle.textContent = `Activity Periods (${hostile.periods.length})`;
        card.appendChild(periodsTitle);
        
        hostile.periods.forEach((period, idx) => {
            const periodDiv = document.createElement('div');
            periodDiv.style.fontSize = '0.85em';
            periodDiv.style.padding = '8px';
            periodDiv.style.background = '#f8f9fa';
            periodDiv.style.borderRadius = '4px';
            periodDiv.style.marginBottom = '6px';
            periodDiv.style.borderLeft = '3px solid #667eea';
            
            const start = new Date(period.start);
            const end = new Date(period.end);
            const duration = (end - start) / 1000;
            
            periodDiv.innerHTML = `
                <div style="margin-bottom: 4px;">
                    <strong>Period ${idx + 1}:</strong> ${formatDuration(duration)}
                </div>
                <div style="color: #666; font-size: 0.9em;">
                    <div>Start: ${period.startReason}</div>
                    <div>End: ${period.endReason}</div>
                </div>
            `;
            
            card.appendChild(periodDiv);
        });
    }
    
    return card;
}

function createDamageTrackingSection(damageData) {
    const section = document.createElement('div');
    section.style.marginBottom = '20px';
    
    const title = document.createElement('h4');
    title.textContent = '💥 Damage Tracking';
    title.style.margin = '20px 0 15px 0';
    title.style.color = '#333';
    section.appendChild(title);
    
    const container = document.createElement('div');
    container.style.background = 'white';
    container.style.padding = '15px';
    container.style.borderRadius = '8px';
    container.style.border = '1px solid #e0e0e0';
    
    // Convert damage object to array, filter to only players, and sort by total damage
    const damageArray = Object.values(damageData.totalDealt)
        .filter(unit => unit.isPlayer)
        .sort((a, b) => b.total - a.total);
    
    if (damageArray.length === 0) {
        container.innerHTML = '<div style="color: #666; text-align: center;">No player damage data available</div>';
        section.appendChild(container);
        return section;
    }
    
    // Create damage table
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    
    // Table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
            <th style="padding: 12px; text-align: left; font-weight: 600;">#</th>
            <th style="padding: 12px; text-align: left; font-weight: 600;">Name</th>
            <th style="padding: 12px; text-align: left; font-weight: 600;">Class</th>
            <th style="padding: 12px; text-align: right; font-weight: 600;">Total Damage</th>
            <th style="padding: 12px; text-align: right; font-weight: 600;">DPS</th>
            <th style="padding: 12px; text-align: center; font-weight: 600;">Actions</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Table body
    const tbody = document.createElement('tbody');
    
    damageArray.forEach((unitDamage, index) => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #e9ecef';
        row.style.transition = 'background 0.2s ease';
        
        row.addEventListener('mouseenter', () => {
            row.style.background = '#f8f9fa';
        });
        
        row.addEventListener('mouseleave', () => {
            row.style.background = '';
        });
        
        const classColor = getClassColor(unitDamage.class);
        
        row.innerHTML = `
            <td style="padding: 10px; color: #666;">${index + 1}</td>
            <td style="padding: 10px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 500;">${escapeHtml(unitDamage.unitName)}</span>
                </div>
            </td>
            <td style="padding: 10px;">
                <span style="background: ${classColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.85em; font-weight: 500;">
                    ${unitDamage.class || 'Unknown'}
                </span>
            </td>
            <td style="padding: 10px; text-align: right; font-weight: 600; color: #dc3545;">
                ${formatNumber(unitDamage.total)}
            </td>
            <td style="padding: 10px; text-align: right; font-weight: 500; color: #667eea;">
                ${formatNumber(Math.round(unitDamage.dps))}/s
            </td>
            <td style="padding: 10px; text-align: center;">
                <button class="damage-details-btn" data-unit-id="${unitDamage.unitId}" style="
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.85em;
                    transition: background 0.2s ease;
                ">
                    📊 Details
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
        
        // Add event listener for details button
        const detailsBtn = row.querySelector('.damage-details-btn');
        detailsBtn.addEventListener('click', () => {
            showDamageSourcesModal(unitDamage);
        });
        
        detailsBtn.addEventListener('mouseenter', () => {
            detailsBtn.style.background = '#5568d3';
        });
        
        detailsBtn.addEventListener('mouseleave', () => {
            detailsBtn.style.background = '#667eea';
        });
    });
    
    table.appendChild(tbody);
    container.appendChild(table);
    section.appendChild(container);
    
    return section;
}

function getClassColor(className) {
    const classColors = {
        'Warrior': '#C79C6E',
        'Paladin': '#F58CBA',
        'Hunter': '#ABD473',
        'Rogue': '#FFF569',
        'Priest': '#FFFFFF',
        'Shaman': '#0070DE',
        'Mage': '#69CCF0',
        'Warlock': '#9482C9',
        'Druid': '#FF7D0A',
        'Death Knight': '#C41F3B',
    };
    return classColors[className] || '#6c757d';
}

function showDamageSourcesModal(unitDamage) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0, 0, 0, 0.7)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '1000';
    overlay.style.animation = 'fadeIn 0.2s ease';
    
    // Create modal
    const modal = document.createElement('div');
    modal.style.background = 'white';
    modal.style.padding = '30px';
    modal.style.borderRadius = '12px';
    modal.style.maxWidth = '600px';
    modal.style.maxHeight = '80vh';
    modal.style.overflow = 'auto';
    modal.style.position = 'relative';
    modal.style.boxShadow = '0 20px 60px rgba(0, 0, 0, 0.3)';
    
    // Modal header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '20px';
    header.style.paddingBottom = '15px';
    header.style.borderBottom = '2px solid #e9ecef';
    
    const title = document.createElement('h2');
    title.style.margin = '0';
    title.style.color = '#333';
    title.textContent = `${unitDamage.unitName} - Damage Sources`;
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '24px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.color = '#666';
    closeBtn.style.padding = '0';
    closeBtn.style.width = '30px';
    closeBtn.style.height = '30px';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.transition = 'all 0.2s ease';
    
    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = '#f8f9fa';
        closeBtn.style.color = '#333';
    });
    
    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = 'none';
        closeBtn.style.color = '#666';
    });
    
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
    });
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    modal.appendChild(header);
    
    // Summary stats
    const summary = document.createElement('div');
    summary.style.display = 'grid';
    summary.style.gridTemplateColumns = 'repeat(2, 1fr)';
    summary.style.gap = '15px';
    summary.style.marginBottom = '20px';
    
    const totalBox = document.createElement('div');
    totalBox.style.padding = '15px';
    totalBox.style.background = '#f8f9fa';
    totalBox.style.borderRadius = '8px';
    totalBox.style.textAlign = 'center';
    totalBox.innerHTML = `
        <div style="color: #666; font-size: 0.9em; margin-bottom: 5px;">Total Damage</div>
        <div style="color: #dc3545; font-size: 1.5em; font-weight: 600;">${formatNumber(unitDamage.total)}</div>
    `;
    
    const dpsBox = document.createElement('div');
    dpsBox.style.padding = '15px';
    dpsBox.style.background = '#f8f9fa';
    dpsBox.style.borderRadius = '8px';
    dpsBox.style.textAlign = 'center';
    dpsBox.innerHTML = `
        <div style="color: #666; font-size: 0.9em; margin-bottom: 5px;">DPS</div>
        <div style="color: #667eea; font-size: 1.5em; font-weight: 600;">${formatNumber(Math.round(unitDamage.dps))}/s</div>
    `;
    
    summary.appendChild(totalBox);
    summary.appendChild(dpsBox);
    modal.appendChild(summary);
    
    // Sources list
    const sourcesTitle = document.createElement('h3');
    sourcesTitle.textContent = 'Damage by Source';
    sourcesTitle.style.marginTop = '20px';
    sourcesTitle.style.marginBottom = '15px';
    sourcesTitle.style.color = '#333';
    modal.appendChild(sourcesTitle);
    
    // Sort sources by damage
    const sortedSources = Object.entries(unitDamage.sources).sort((a, b) => b[1] - a[1]);
    
    sortedSources.forEach(([source, damage]) => {
        const percentage = (damage / unitDamage.total * 100).toFixed(1);
        
        const sourceDiv = document.createElement('div');
        sourceDiv.style.marginBottom = '12px';
        sourceDiv.style.padding = '12px';
        sourceDiv.style.background = '#f8f9fa';
        sourceDiv.style.borderRadius = '6px';
        sourceDiv.style.transition = 'all 0.2s ease';
        
        sourceDiv.addEventListener('mouseenter', () => {
            sourceDiv.style.background = '#e9ecef';
            sourceDiv.style.transform = 'translateX(5px)';
        });
        
        sourceDiv.addEventListener('mouseleave', () => {
            sourceDiv.style.background = '#f8f9fa';
            sourceDiv.style.transform = 'translateX(0)';
        });
        
        sourceDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: 500; color: #333;">${escapeHtml(source)}</span>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <span style="color: #dc3545; font-weight: 600;">${formatNumber(damage)}</span>
                    <span style="background: #667eea; color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.85em;">
                        ${percentage}%
                    </span>
                </div>
            </div>
            <div style="background: #dee2e6; height: 6px; border-radius: 3px; overflow: hidden;">
                <div style="background: linear-gradient(90deg, #667eea, #764ba2); height: 100%; width: ${percentage}%; transition: width 0.3s ease;"></div>
            </div>
        `;
        
        modal.appendChild(sourceDiv);
    });
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    });
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

// Initialize on load
window.addEventListener('load', () => {
    initWasm();
});

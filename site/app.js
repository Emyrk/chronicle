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
const timelineSection = document.getElementById('timelineSection');
const instancesContainer = document.getElementById('instancesContainer');
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
    timelineSection.style.display = 'none';

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
        
        timelineSection.style.display = 'block';
        timelineSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    
    // Sort characters by name
    const sortedCharacters = [...characters].sort((a, b) => 
        a.characterName.localeCompare(b.characterName)
    );
    
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
    nameDiv.textContent = character.characterName;
    
    const track = document.createElement('div');
    track.className = 'activity-track';
    
    // Add activity periods
    character.periods.forEach(period => {
        const periodDiv = createActivityPeriod(period, timeRange, duration);
        track.appendChild(periodDiv);
    });
    
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
    
    // Add class if period ended
    if (period.end) {
        periodDiv.classList.add('ended');
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

// Global state
let products = [];
let currentTemplate = {
    name: 'Untitled Template',
    width: 80,
    height: 50,
    elements: []
};
let selectedElement = null;
let isDragging = false;
let isResizing = false;
let dragOffset = { x: 0, y: 0 };
let resizeHandle = null;
let elementIdCounter = 0;
let selectedProducts = [];
let productCopies = {};
let searchHighlightedIndex = -1;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    initializeDesigner();
    initializePrintMode();
    setupEventListeners();
    loadCustomFonts();
    loadPrinterPreference();
    
    // Check if Epson ePOS SDK is loaded
    if (typeof epson !== 'undefined' && epson.ePOSDevice) {
        console.log('✓ Epson ePOS SDK loaded successfully');
    } else {
        console.warn('⚠ Epson ePOS SDK not loaded. Direct Epson printing will not be available.');
        console.warn('Make sure epos-2.27.0.js is in the project folder and the script tag is uncommented in index.html');
    }
});

// Load products from CSV (same-origin; when deployed, file is in repo and updated via webhook)
async function loadProducts() {
    try {
        const response = await fetch('products.csv');
        const csvText = await response.text();
        products = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true
        }).data;
        
        // Populate preview dropdown
        populatePreviewDropdown();
        console.log(`Loaded ${products.length} products`);
    } catch (error) {
        console.error('Error loading products:', error);
        alert('Error loading products.csv. Please ensure the file is in the same directory.');
    }
}

// Initialize designer mode
function initializeDesigner() {
    const canvas = document.getElementById('canvas');
    
    // Make canvas droppable
    canvas.addEventListener('drop', handleDrop);
    canvas.addEventListener('dragover', (e) => e.preventDefault());
    
    // Click to deselect
    canvas.addEventListener('click', (e) => {
        if (e.target === canvas) {
            deselectElement();
        }
    });
    
    // Load default template
    loadTemplateToCanvas();
}

// Setup event listeners
function setupEventListeners() {
    // Header File dropdown
    const headerMenuBtn = document.getElementById('headerMenuBtn');
    const headerDropdownMenu = document.getElementById('headerDropdownMenu');
    if (headerMenuBtn && headerDropdownMenu) {
        headerMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = headerDropdownMenu.classList.toggle('open');
            headerMenuBtn.setAttribute('aria-expanded', open);
        });
        document.addEventListener('click', () => {
            headerDropdownMenu.classList.remove('open');
            headerMenuBtn.setAttribute('aria-expanded', 'false');
        });
        headerDropdownMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (!item) return;
            const action = item.dataset.action;
            headerDropdownMenu.classList.remove('open');
            headerMenuBtn.setAttribute('aria-expanded', 'false');
            if (action === 'saveTemplate') showSaveModal();
            else if (action === 'saveToDisk') saveTemplateToDisk();
            else if (action === 'loadTemplate') showLoadModal();
            else if (action === 'loadFromDisk') document.getElementById('templateFileInput').click();
            else if (action === 'switchMode') switchMode();
        });
    }
    
    // Template management (modals / file input still used by dropdown)
    document.getElementById('confirmSaveBtn').addEventListener('click', saveTemplate);
    document.getElementById('cancelSaveBtn').addEventListener('click', hideSaveModal);
    document.getElementById('cancelLoadBtn').addEventListener('click', hideLoadModal);
    
    // File input for loading templates from disk
    const templateFileInput = document.createElement('input');
    templateFileInput.type = 'file';
    templateFileInput.accept = '.json';
    templateFileInput.id = 'templateFileInput';
    templateFileInput.style.display = 'none';
    templateFileInput.addEventListener('change', loadTemplateFromDisk);
    document.body.appendChild(templateFileInput);
    
    // Canvas controls
    document.getElementById('updateSizeBtn').addEventListener('click', updateCanvasSize);
    document.getElementById('previewBtn').addEventListener('click', updatePreview);
    document.getElementById('clearCanvasBtn').addEventListener('click', clearCanvas);
    
    // Add element buttons
    document.querySelectorAll('.add-element-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.dataset.type;
            addElement(type);
        });
    });
    
    // Variable select
    document.getElementById('variableSelect').addEventListener('change', (e) => {
        if (e.target.value) {
            addVariableElement(e.target.value);
            e.target.value = '';
        }
    });
    
    // Print mode
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('productSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    document.getElementById('productSearch').addEventListener('keydown', (e) => {
        const resultsDiv = document.getElementById('searchResults');
        const items = resultsDiv ? resultsDiv.querySelectorAll('.search-result-item') : [];
        const n = items.length;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (n === 0) return;
            searchHighlightedIndex = searchHighlightedIndex < n - 1 ? searchHighlightedIndex + 1 : 0;
            updateSearchHighlight();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (n === 0) return;
            searchHighlightedIndex = searchHighlightedIndex <= 0 ? n - 1 : searchHighlightedIndex - 1;
            updateSearchHighlight();
        } else if (e.key === 'Enter') {
            if (n > 0 && searchHighlightedIndex >= 0 && items[searchHighlightedIndex]) {
                e.preventDefault();
                const productId = items[searchHighlightedIndex].dataset.id;
                if (productId) addProductToSelection(productId);
            } else {
                e.preventDefault();
                e.target.focus();
            }
        }
    });
    let searchDebounceTimer;
    document.getElementById('productSearch').addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(performSearch, 200);
    });
    document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);
    const printSelectedBtn = document.getElementById('printSelectedBtn');
    if (printSelectedBtn) {
        printSelectedBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Print selected button clicked');
            try {
                printSelectedTags();
            } catch (error) {
                console.error('Error in printSelectedTags:', error);
                alert('Error printing: ' + error.message);
            }
        });
    } else {
        console.warn('printSelectedBtn not found');
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            const btn = document.getElementById('printSelectedBtn');
            if (btn && !btn.disabled) btn.click();
        }
    });
    document.getElementById('clearSelectedBtn').addEventListener('click', clearSelectedProducts);

    // Printer method selection
    document.querySelectorAll('input[name="printMethod"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const epsonConfig = document.getElementById('epsonConfig');
            if (e.target.value === 'epson') {
                epsonConfig.style.display = 'block';
            } else {
                epsonConfig.style.display = 'none';
            }
            updatePrinterSettingsSummary();
        });
    });
    
    // Printer IP selection - save preference when changed
    document.querySelectorAll('input[name="printerIP"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            savePrinterPreference(e.target.value);
            updatePrinterSettingsSummary();
        });
    });
    
    document.getElementById('fastPrintMode')?.addEventListener('change', updatePrinterSettingsSummary);
    updatePrinterSettingsSummary();
    
    // Test Epson connection
    const testConnectionBtn = document.getElementById('testConnectionBtn');
    if (testConnectionBtn) {
        testConnectionBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Test connection button clicked');
            try {
                testEpsonConnection();
            } catch (error) {
                console.error('Error in testEpsonConnection:', error);
                alert('Error testing connection: ' + error.message);
            }
        });
    } else {
        console.warn('testConnectionBtn not found');
    }
    
    // Preview product select
    document.getElementById('previewProductSelect').addEventListener('change', updatePreview);
    
    // Font upload
    document.getElementById('uploadFontBtn').addEventListener('click', () => {
        document.getElementById('fontUpload').click();
    });
    document.getElementById('fontUpload').addEventListener('change', handleFontUpload);
}

// Add element to canvas
function addElement(type) {
    const canvas = document.getElementById('canvas');
    const element = createElement(type);
    
    // Position in center
    const rect = canvas.getBoundingClientRect();
    element.style.left = '50%';
    element.style.top = '50%';
    element.style.transform = 'translate(-50%, -50%)';
    
    canvas.appendChild(element);
    currentTemplate.elements.push({
        id: element.id,
        type: type,
        style: getElementStyle(element),
        content: getElementContent(element)
    });
    
    selectElement(element);
    debouncedUpdatePreview();
}

// Create element
function createElement(type) {
    elementIdCounter++;
    const element = document.createElement('div');
    element.id = `element-${elementIdCounter}`;
    element.className = 'canvas-element';
    
    switch(type) {
        case 'text':
            element.classList.add('canvas-text');
            element.textContent = 'Text';
            element.style.width = '50px';
            element.style.height = '20px';
            break;
        case 'variable':
            element.classList.add('canvas-variable');
            element.textContent = '{{Variable}}';
            element.style.width = '100px';
            element.style.height = '20px';
            break;
        case 'barcode':
            element.classList.add('canvas-barcode');
            element.style.width = '150px';
            element.style.height = '50px';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('id', `barcode-${elementIdCounter}`);
            element.appendChild(svg);
            JsBarcode(`#barcode-${elementIdCounter}`, '123456789012', {
                format: 'EAN13',
                width: 1,
                height: 40
            });
            break;
        case 'rectangle':
            element.classList.add('canvas-rectangle');
            element.style.width = '60px';
            element.style.height = '30px';
            break;
        case 'line':
            element.classList.add('canvas-line');
            element.style.width = '100px';
            element.style.height = '0px';
            break;
    }
    
    setupElementInteractions(element);
    return element;
}

// Add variable element
function addVariableElement(variable) {
    const canvas = document.getElementById('canvas');
    elementIdCounter++;
    const element = document.createElement('div');
    element.id = `element-${elementIdCounter}`;
    element.className = 'canvas-element canvas-variable';
    element.textContent = variable;
    element.dataset.variable = variable;
    element.style.width = '100px';
    element.style.height = '20px';
    
    setupElementInteractions(element);
    
    const rect = canvas.getBoundingClientRect();
    element.style.left = '50%';
    element.style.top = '50%';
    element.style.transform = 'translate(-50%, -50%)';
    
    canvas.appendChild(element);
    currentTemplate.elements.push({
        id: element.id,
        type: 'variable',
        style: getElementStyle(element),
        content: variable
    });
    
    selectElement(element);
    debouncedUpdatePreview();
}

// Setup element interactions (drag, resize, select)
function setupElementInteractions(element) {
    // Make draggable
    element.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('resize-handle') || e.target.classList.contains('delete-btn')) {
            return;
        }
        
        selectElement(element);
        startDrag(e, element);
    });
    
    // Add resize handles
    addResizeHandles(element);
    
    // Add delete button
    addDeleteButton(element);
}

// Add resize handles
function addResizeHandles(element) {
    const handles = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
    handles.forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${pos}`;
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            startResize(e, element, pos);
        });
        element.appendChild(handle);
    });
}

// Add delete button
function addDeleteButton(element) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteElement(element);
    });
    element.appendChild(deleteBtn);
}

// Start dragging
function startDrag(e, element) {
    isDragging = true;
    const rect = element.getBoundingClientRect();
    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    element.classList.add('dragging');
    
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDrag);
}

// Handle drag
function handleDrag(e) {
    if (!isDragging || !selectedElement) return;
    
    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    
    let x = e.clientX - canvasRect.left - dragOffset.x;
    let y = e.clientY - canvasRect.top - dragOffset.y;
    
    // Constrain to canvas bounds
    x = Math.max(0, Math.min(x, canvasRect.width - selectedElement.offsetWidth));
    y = Math.max(0, Math.min(y, canvasRect.height - selectedElement.offsetHeight));
    
    selectedElement.style.left = `${x}px`;
    selectedElement.style.top = `${y}px`;
    selectedElement.style.transform = 'none';
    
    updateElementInTemplate(selectedElement);
}

// Stop dragging
function stopDrag() {
    if (isDragging && selectedElement) {
        selectedElement.classList.remove('dragging');
        // Update input fields to match element's current position
        updatePropertyInputs(selectedElement);
        // Save to template
        updateElementInTemplate(selectedElement);
    }
    isDragging = false;
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', stopDrag);
}

// Update property input fields to match element's current state
function updatePropertyInputs(element) {
    const xInput = document.getElementById('prop-x');
    const yInput = document.getElementById('prop-y');
    const widthInput = document.getElementById('prop-width');
    const heightInput = document.getElementById('prop-height');
    
    if (xInput) xInput.value = parseInt(element.style.left) || 0;
    if (yInput) yInput.value = parseInt(element.style.top) || 0;
    if (widthInput) widthInput.value = parseInt(element.style.width) || element.offsetWidth;
    if (heightInput) heightInput.value = parseInt(element.style.height) || element.offsetHeight;
}

// Start resizing
function startResize(e, element, handle) {
    e.stopPropagation();
    isResizing = true;
    resizeHandle = handle;
    selectElement(element);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = element.offsetWidth;
    const startHeight = element.offsetHeight;
    const startLeft = element.offsetLeft;
    const startTop = element.offsetTop;
    
    function handleResize(e) {
        if (!isResizing) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        const canvas = document.getElementById('canvas');
        
        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLeft = startLeft;
        let newTop = startTop;
        
        if (handle.includes('e')) newWidth = Math.max(20, startWidth + deltaX);
        if (handle.includes('w')) {
            newWidth = Math.max(20, startWidth - deltaX);
            newLeft = startLeft + deltaX;
        }
        if (handle.includes('s')) newHeight = Math.max(20, startHeight + deltaY);
        if (handle.includes('n')) {
            newHeight = Math.max(20, startHeight - deltaY);
            newTop = startTop + deltaY;
        }
        
        // Constrain to canvas
        if (newLeft < 0) {
            newWidth += newLeft;
            newLeft = 0;
        }
        if (newTop < 0) {
            newHeight += newTop;
            newTop = 0;
        }
        if (newLeft + newWidth > canvas.offsetWidth) {
            newWidth = canvas.offsetWidth - newLeft;
        }
        if (newTop + newHeight > canvas.offsetHeight) {
            newHeight = canvas.offsetHeight - newTop;
        }
        
        element.style.width = `${newWidth}px`;
        element.style.height = `${newHeight}px`;
        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
        element.style.transform = 'none';
        
        updateElementInTemplate(element);
    }
    
    function stopResize() {
        isResizing = false;
        // Update input fields to match element's current size/position
        if (selectedElement) {
            updatePropertyInputs(selectedElement);
            updateElementInTemplate(selectedElement);
        }
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
    }
    
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
}

// Select element
function selectElement(element) {
    // Save current element's properties before switching (save actual state, not input fields)
    if (selectedElement && selectedElement !== element && selectedElement.id) {
        updateElementInTemplate(selectedElement);
    }
    // Don't call deselectElement here as it sets selectedElement to null
    // Just remove the selected class from the old element
    if (selectedElement && selectedElement !== element) {
        selectedElement.classList.remove('selected');
    }
    selectedElement = element;
    element.classList.add('selected');
    showProperties(element);
}

// Deselect element
function deselectElement() {
    // Save properties before deselecting (save actual element state)
    if (selectedElement) {
        updateElementInTemplate(selectedElement);
    }
    if (selectedElement) {
        selectedElement.classList.remove('selected');
    }
    selectedElement = null;
    hideProperties();
}

// Save current element's properties from input fields
function saveCurrentElementProperties() {
    if (!selectedElement) return;
    
    // Save the element's actual current state to template (not from input fields)
    // This ensures positions from dragging are preserved
    updateElementInTemplate(selectedElement);
    
    // Also save any input field values that might have been edited
    // but only if they differ from the element's current state
    const props = ['x', 'y', 'width', 'height', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight',
                   'color', 'textAlign', 'content', 'borderColor', 'borderWidth', 
                   'bgColor', 'lineColor', 'lineWidth', 'barcodeValue', 'barcodeFormat'];
    
    props.forEach(prop => {
        const input = document.getElementById(`prop-${prop}`);
        if (input && input.value !== null && input.value !== undefined && input.value !== '') {
            // For number inputs, check if it's a valid number
            if (input.type === 'number') {
                const numValue = parseFloat(input.value);
                if (!isNaN(numValue)) {
                    // Only apply if it's different from current element state
                    const currentValue = prop === 'x' ? parseInt(selectedElement.style.left) || 0 :
                                       prop === 'y' ? parseInt(selectedElement.style.top) || 0 :
                                       prop === 'width' ? parseInt(selectedElement.style.width) || selectedElement.offsetWidth :
                                       prop === 'height' ? parseInt(selectedElement.style.height) || selectedElement.offsetHeight :
                                       prop === 'fontSize' ? parseInt(getComputedStyle(selectedElement).fontSize) : null;
                    
                    if (currentValue === null || Math.abs(numValue - currentValue) > 0.1) {
                        applyProperty(selectedElement, prop, numValue);
                    }
                }
            } else {
                // For non-number inputs, apply the value
                applyProperty(selectedElement, prop, input.value);
            }
        }
    });
    
    // Handle word wrap checkbox
    const wordWrapCheckbox = document.getElementById('prop-wordWrap');
    if (wordWrapCheckbox) {
        const currentWordWrap = selectedElement.classList.contains('word-wrap');
        if (wordWrapCheckbox.checked !== currentWordWrap) {
            applyProperty(selectedElement, 'wordWrap', wordWrapCheckbox.checked);
        }
    }
    
    // Final save to ensure everything is synced
    updateElementInTemplate(selectedElement);
}

// Get font family options HTML
function getFontFamilyOptions(element) {
    const currentFont = getComputedStyle(element).fontFamily || 'Arial';
    const customFonts = getCustomFonts();
    
    let html = `
        <option value="Rubik, sans-serif" ${currentFont.includes('Rubik') ? 'selected' : ''}>Rubik</option>
        <option value="Arial" ${currentFont.includes('Arial') ? 'selected' : ''}>Arial</option>
        <option value="Helvetica" ${currentFont.includes('Helvetica') ? 'selected' : ''}>Helvetica</option>
        <option value="Times New Roman" ${currentFont.includes('Times') ? 'selected' : ''}>Times New Roman</option>
        <option value="Courier New" ${currentFont.includes('Courier') ? 'selected' : ''}>Courier New</option>
        <option value="Verdana" ${currentFont.includes('Verdana') ? 'selected' : ''}>Verdana</option>
        <option value="Georgia" ${currentFont.includes('Georgia') ? 'selected' : ''}>Georgia</option>
    `;
    
    // Add custom fonts
    customFonts.forEach(font => {
        const isSelected = currentFont.includes(font.name);
        html += `<option value="${font.name}" ${isSelected ? 'selected' : ''}>${font.name} (Custom)</option>`;
    });
    
    return html;
}

// Handle font upload
async function handleFontUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check file type
    const validExtensions = ['.otf', '.ttf', '.woff', '.woff2'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    if (!validExtensions.includes(fileExt)) {
        alert('Please upload a valid font file (.otf, .ttf, .woff, or .woff2)');
        return;
    }
    
    // Read file as base64
    const reader = new FileReader();
    reader.onload = async (e) => {
        const fontData = e.target.result;
        const fontName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
        
        try {
            // Create font face
            const fontFace = new FontFace(fontName, `url(${fontData})`);
            await fontFace.load();
            document.fonts.add(fontFace);
            
            // Save font info
            saveCustomFont({
                name: fontName,
                data: fontData,
                format: fileExt.substring(1) // Remove the dot
            });
            
            // Update UI
            updateCustomFontsList();
            
            // If an element is selected, refresh its font options
            if (selectedElement) {
                showProperties(selectedElement);
            }
            
            alert(`Font "${fontName}" loaded successfully!`);
        } catch (error) {
            console.error('Error loading font:', error);
            alert('Error loading font. Please make sure the font file is valid.');
        }
    };
    
    reader.readAsDataURL(file);
    event.target.value = ''; // Reset input
}

// Get custom fonts from storage
function getCustomFonts() {
    try {
        return JSON.parse(localStorage.getItem('customFonts') || '[]');
    } catch (e) {
        return [];
    }
}

// Save custom font
function saveCustomFont(font) {
    const fonts = getCustomFonts();
    // Check if font already exists
    const existingIndex = fonts.findIndex(f => f.name === font.name);
    if (existingIndex >= 0) {
        fonts[existingIndex] = font;
    } else {
        fonts.push(font);
    }
    localStorage.setItem('customFonts', JSON.stringify(fonts));
}

// Load custom fonts on startup
function loadCustomFonts() {
    const fonts = getCustomFonts();
    fonts.forEach(async (font) => {
        try {
            const fontFace = new FontFace(font.name, `url(${font.data})`);
            await fontFace.load();
            document.fonts.add(fontFace);
        } catch (error) {
            console.error(`Error loading font ${font.name}:`, error);
        }
    });
    updateCustomFontsList();
}

// Update custom fonts list UI
function updateCustomFontsList() {
    const fonts = getCustomFonts();
    const listContainer = document.getElementById('customFontsList');
    
    if (fonts.length === 0) {
        listContainer.innerHTML = '<p style="font-size: 0.8rem; color: #95a5a6; margin-top: 0.5rem;">No custom fonts uploaded</p>';
        return;
    }
    
    listContainer.innerHTML = fonts.map(font => `
        <div class="custom-font-item">
            <span style="font-family: '${font.name}'; font-size: 0.85rem;">${font.name}</span>
            <button class="remove-font-btn" data-font="${font.name}" title="Remove font">×</button>
        </div>
    `).join('');
    
    // Add remove handlers
    listContainer.querySelectorAll('.remove-font-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const fontName = btn.dataset.font;
            if (confirm(`Remove font "${fontName}"?`)) {
                removeCustomFont(fontName);
            }
        });
    });
}

// Remove custom font
function removeCustomFont(fontName) {
    const fonts = getCustomFonts();
    const filtered = fonts.filter(f => f.name !== fontName);
    localStorage.setItem('customFonts', JSON.stringify(filtered));
    
    // Remove from document fonts
    const fontFace = Array.from(document.fonts).find(f => f.family === fontName);
    if (fontFace) {
        document.fonts.delete(fontFace);
    }
    
    updateCustomFontsList();
    
    // Refresh selected element if it uses this font
    if (selectedElement) {
        const currentFont = getComputedStyle(selectedElement).fontFamily;
        if (currentFont.includes(fontName)) {
            selectedElement.style.fontFamily = 'Arial';
            showProperties(selectedElement);
        }
    }
}

// Convert RGB color to hex
function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') {
        return '#000000';
    }
    
    // If already hex, return as is
    if (rgb.startsWith('#')) {
        return rgb;
    }
    
    // Parse rgb/rgba
    const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/);
    if (match) {
        const r = parseInt(match[1]).toString(16).padStart(2, '0');
        const g = parseInt(match[2]).toString(16).padStart(2, '0');
        const b = parseInt(match[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }
    
    return '#000000';
}

// Show properties panel
function showProperties(element) {
    const panel = document.getElementById('propertiesPanel');
    const type = element.classList.contains('canvas-text') ? 'text' :
                 element.classList.contains('canvas-variable') ? 'variable' :
                 element.classList.contains('canvas-barcode') ? 'barcode' :
                 element.classList.contains('canvas-rectangle') ? 'rectangle' :
                 element.classList.contains('canvas-line') ? 'line' : 'text';
    
    let html = '';
    
    // Common properties
    html += `
        <div class="property-group">
            <label>X Position (px)</label>
            <input type="number" id="prop-x" value="${parseInt(element.style.left) || 0}">
        </div>
        <div class="property-group">
            <label>Y Position (px)</label>
            <input type="number" id="prop-y" value="${parseInt(element.style.top) || 0}">
        </div>
        <div class="property-group">
            <label>Width (px)</label>
            <input type="number" id="prop-width" value="${parseInt(element.style.width) || element.offsetWidth || 50}">
        </div>
        <div class="property-group">
            <label>Height (px)</label>
            <input type="number" id="prop-height" value="${parseInt(element.style.height) || element.offsetHeight || 20}">
        </div>
    `;
    
    if (type === 'text' || type === 'variable') {
        html += `
            <div class="property-group">
                <label>Font Size (px)</label>
                <input type="number" id="prop-fontSize" value="${parseInt(getComputedStyle(element).fontSize) || 12}">
            </div>
            <div class="property-group">
                <label>Font Family</label>
                <select id="prop-fontFamily">
                    ${getFontFamilyOptions(element)}
                </select>
            </div>
            <div class="property-group">
                <label>Font Weight</label>
                <select id="prop-fontWeight">
                    <option value="normal" ${(getComputedStyle(element).fontWeight || 'normal') === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="bold" ${(getComputedStyle(element).fontWeight || 'normal') === 'bold' ? 'selected' : ''}>Bold</option>
                </select>
            </div>
            <div class="property-group">
                <label>Line Height</label>
                <input type="number" id="prop-lineHeight" value="${parseFloat(element.style.lineHeight) || 1.3}" min="0.5" max="3" step="0.1" title="Unitless multiplier (e.g. 1.3)">
            </div>
            <div class="property-group">
                <label>Text Color</label>
                <input type="color" id="prop-color" value="${rgbToHex(getComputedStyle(element).color) || '#000000'}">
            </div>
            <div class="property-group">
                <label>Text Align</label>
                <select id="prop-textAlign">
                    <option value="left" ${(getComputedStyle(element).textAlign || 'left') === 'left' ? 'selected' : ''}>Left</option>
                    <option value="center" ${(getComputedStyle(element).textAlign || 'left') === 'center' ? 'selected' : ''}>Center</option>
                    <option value="right" ${(getComputedStyle(element).textAlign || 'left') === 'right' ? 'selected' : ''}>Right</option>
                </select>
            </div>
            <div class="property-group">
                <label>
                    <input type="checkbox" id="prop-wordWrap" ${element.classList.contains('word-wrap') ? 'checked' : ''}>
                    Word Wrap
                </label>
            </div>
        `;
        
        if (type === 'text') {
            html += `
                <div class="property-group">
                    <label>Text Content</label>
                    <input type="text" id="prop-content" value="${element.textContent}">
                </div>
            `;
        }
    }
    
    if (type === 'rectangle') {
        const computedStyle = getComputedStyle(element);
        const borderColor = rgbToHex(computedStyle.borderColor) || '#000000';
        const borderWidth = parseInt(computedStyle.borderWidth) || 2;
        const bgColor = computedStyle.backgroundColor === 'rgba(0, 0, 0, 0)' || computedStyle.backgroundColor === 'transparent' 
            ? '#ffffff' 
            : rgbToHex(computedStyle.backgroundColor) || '#ffffff';
        
        html += `
            <div class="property-group">
                <label>Border Color</label>
                <input type="color" id="prop-borderColor" value="${borderColor}">
            </div>
            <div class="property-group">
                <label>Border Width (px)</label>
                <input type="number" id="prop-borderWidth" value="${borderWidth}">
            </div>
            <div class="property-group">
                <label>Background Color</label>
                <input type="color" id="prop-bgColor" value="${bgColor}">
            </div>
        `;
    }
    
    if (type === 'line') {
        const computedStyle = getComputedStyle(element);
        const lineColor = rgbToHex(computedStyle.borderTopColor || computedStyle.borderColor) || '#000000';
        const lineWidth = parseInt(computedStyle.borderTopWidth || computedStyle.borderWidth) || 2;
        
        html += `
            <div class="property-group">
                <label>Line Color</label>
                <input type="color" id="prop-lineColor" value="${lineColor}">
            </div>
            <div class="property-group">
                <label>Line Width (px)</label>
                <input type="number" id="prop-lineWidth" value="${lineWidth}">
            </div>
        `;
    }
    
    if (type === 'barcode') {
        const svg = element.querySelector('svg');
        const barcodeValue = svg ? (svg.getAttribute('data-barcode') || '123456789012') : '123456789012';
        const barcodeFormat = 'EAN13'; // Default, could be stored in data attribute
        
        html += `
            <div class="property-group">
                <label>Barcode Value</label>
                <input type="text" id="prop-barcodeValue" value="${barcodeValue}">
            </div>
            <div class="property-group">
                <label>Barcode Format</label>
                <select id="prop-barcodeFormat">
                    <option value="EAN13" ${barcodeFormat === 'EAN13' ? 'selected' : ''}>EAN13</option>
                    <option value="CODE128" ${barcodeFormat === 'CODE128' ? 'selected' : ''}>CODE128</option>
                    <option value="CODE39" ${barcodeFormat === 'CODE39' ? 'selected' : ''}>CODE39</option>
                    <option value="UPC" ${barcodeFormat === 'UPC' ? 'selected' : ''}>UPC</option>
                </select>
            </div>
        `;
    }
    
    panel.innerHTML = html;
    
    // Add event listeners to properties
    setupPropertyListeners(element);
}

// Setup property listeners
function setupPropertyListeners(element) {
    const props = ['x', 'y', 'width', 'height', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight',
                   'color', 'textAlign', 'content', 'borderColor', 'borderWidth', 
                   'bgColor', 'lineColor', 'lineWidth', 'barcodeValue', 'barcodeFormat'];
    
    props.forEach(prop => {
        const input = document.getElementById(`prop-${prop}`);
        if (input) {
            input.addEventListener('input', () => {
                applyProperty(element, prop, input.value);
            });
        }
    });
    
    // Handle word wrap checkbox separately
    const wordWrapCheckbox = document.getElementById('prop-wordWrap');
    if (wordWrapCheckbox) {
        wordWrapCheckbox.addEventListener('change', (e) => {
            applyProperty(element, 'wordWrap', e.target.checked);
        });
    }
}

// Apply property to element
function applyProperty(element, prop, value) {
    switch(prop) {
        case 'x':
            element.style.left = `${value}px`;
            element.style.transform = 'none';
            break;
        case 'y':
            element.style.top = `${value}px`;
            element.style.transform = 'none';
            break;
        case 'width':
            element.style.width = `${value}px`;
            break;
        case 'height':
            element.style.height = `${value}px`;
            break;
        case 'fontSize':
            element.style.fontSize = `${value}px`;
            break;
        case 'fontFamily':
            element.style.fontFamily = value;
            break;
        case 'fontWeight':
            element.style.fontWeight = value;
            break;
        case 'lineHeight': {
            const v = parseFloat(value);
            if (!isNaN(v) && v >= 0.5 && v <= 3) element.style.lineHeight = String(v);
            break;
        }
        case 'color':
            element.style.color = value;
            break;
        case 'textAlign':
            element.style.textAlign = value;
            break;
        case 'content':
            element.textContent = value;
            break;
        case 'wordWrap':
            if (value) {
                element.classList.add('word-wrap');
                // Remove inline white-space if it exists
                element.style.whiteSpace = '';
                // Ensure element has enough height for wrapping
                const currentHeight = parseInt(element.style.height) || element.offsetHeight;
                if (currentHeight < 40) {
                    element.style.height = '60px';
                }
                // Ensure element has a width constraint for wrapping to work
                const currentWidth = parseInt(element.style.width) || element.offsetWidth || 100;
                if (currentWidth > 0) {
                    element.style.width = `${currentWidth}px`;
                }
            } else {
                element.classList.remove('word-wrap');
                element.style.whiteSpace = 'nowrap';
            }
            updateElementInTemplate(element);
            break;
        case 'borderColor':
            element.style.borderColor = value;
            break;
        case 'borderWidth':
            element.style.borderWidth = `${value}px`;
            break;
        case 'bgColor':
            if (value === 'transparent') {
                element.style.backgroundColor = 'transparent';
            } else {
                element.style.backgroundColor = value;
            }
            break;
        case 'lineColor':
            element.style.borderColor = value;
            break;
        case 'lineWidth':
            element.style.borderWidth = `${value}px`;
            break;
        case 'barcodeValue':
            const svg = element.querySelector('svg');
            if (svg) {
                JsBarcode(`#${svg.id}`, value, {
                    format: document.getElementById('prop-barcodeFormat')?.value || 'EAN13',
                    width: 1,
                    height: 40
                });
            }
            break;
        case 'barcodeFormat':
            const svg2 = element.querySelector('svg');
            if (svg2) {
                const value = document.getElementById('prop-barcodeValue')?.value || '123456789012';
                JsBarcode(`#${svg2.id}`, value, {
                    format: value,
                    width: 1,
                    height: 40
                });
            }
            break;
    }
    
    updateElementInTemplate(element);
}

// Debounced preview update for live preview
let previewUpdateTimeout = null;
function debouncedUpdatePreview() {
    // Clear existing timeout
    if (previewUpdateTimeout) {
        clearTimeout(previewUpdateTimeout);
    }
    
    // Set new timeout to update preview after a short delay
    previewUpdateTimeout = setTimeout(() => {
        try {
            updatePreview();
        } catch (error) {
            console.error('Error updating preview:', error);
        }
    }, 100); // Update after 100ms of no changes
}

// Update preview
function updatePreview() {
    const previewCanvas = document.getElementById('previewCanvas');
    if (!previewCanvas) return; // Safety check
    
    const productSelect = document.getElementById('previewProductSelect');
    if (!productSelect) return; // Safety check
    
    const selectedProductId = productSelect.value;
    
    if (!selectedProductId) {
        previewCanvas.innerHTML = '<p style="padding: 1rem; color: #95a5a6;">Select a product to preview</p>';
        return;
    }
    
    const product = products.find(p => p.publicId === selectedProductId);
    if (!product) return;
    
    // Clear preview
    previewCanvas.innerHTML = '';
    
    // Render elements with product data (handle empty array gracefully)
    if (currentTemplate && currentTemplate.elements && Array.isArray(currentTemplate.elements) && currentTemplate.elements.length > 0) {
        currentTemplate.elements.forEach(elementData => {
            try {
                if (elementData) {
                    const element = createPreviewElement(elementData, product);
                    if (element) {
                        previewCanvas.appendChild(element);
                    }
                }
            } catch (error) {
                console.error('Error creating preview element:', error);
            }
        });
    }
}

// Get element type
function getElementType(element) {
    if (element.classList.contains('canvas-text')) return 'text';
    if (element.classList.contains('canvas-variable')) return 'variable';
    if (element.classList.contains('canvas-barcode')) return 'barcode';
    if (element.classList.contains('canvas-rectangle')) return 'rectangle';
    if (element.classList.contains('canvas-line')) return 'line';
    return 'text';
}

// Get element style
function getElementStyle(element) {
    const style = {
        left: element.style.left || '0px',
        top: element.style.top || '0px',
        width: element.style.width || '50px',
        height: element.style.height || '20px',
        fontSize: element.style.fontSize || '12px',
        fontFamily: element.style.fontFamily || 'Arial',
        fontWeight: element.style.fontWeight || 'normal',
        lineHeight: element.style.lineHeight || '1.3',
        color: element.style.color || '#000000',
        textAlign: element.style.textAlign || 'left',
        borderColor: element.style.borderColor || '#000000',
        borderWidth: element.style.borderWidth || '0px',
        backgroundColor: element.style.backgroundColor || 'transparent',
        wordWrap: element.classList.contains('word-wrap') || false
    };
    return style;
}

// Get element content
function getElementContent(element) {
    if (element.classList.contains('canvas-variable')) {
        return element.dataset.variable || element.textContent;
    }
    if (element.classList.contains('canvas-text')) {
        return element.textContent;
    }
    if (element.classList.contains('canvas-barcode')) {
        const svg = element.querySelector('svg');
        return svg ? svg.getAttribute('data-barcode') || '123456789012' : '123456789012';
    }
    return '';
}

// Update element in template
function updateElementInTemplate(element) {
    if (!element || !element.id) return; // Safety check
    if (!currentTemplate || !currentTemplate.elements) return; // Safety check
    
    const index = currentTemplate.elements.findIndex(el => el && el.id === element.id);
    if (index !== -1) {
        currentTemplate.elements[index] = {
            id: element.id,
            type: getElementType(element),
            style: getElementStyle(element),
            content: getElementContent(element)
        };
        // Update preview automatically
        debouncedUpdatePreview();
    }
}

// Delete element
function deleteElement(element) {
    if (!element || !element.id) return; // Safety check
    if (!currentTemplate || !currentTemplate.elements) return; // Safety check
    
    const index = currentTemplate.elements.findIndex(el => el && el.id === element.id);
    if (index !== -1) {
        currentTemplate.elements.splice(index, 1);
    }
    element.remove();
    deselectElement();
    debouncedUpdatePreview();
}

// Hide properties
function hideProperties() {
    const panel = document.getElementById('propertiesPanel');
    panel.innerHTML = '<p class="no-selection">Select an element to edit properties</p>';
}

// Update canvas size
function updateCanvasSize() {
    const width = document.getElementById('tagWidth').value;
    const height = document.getElementById('tagHeight').value;
    
    const canvas = document.getElementById('canvas');
    canvas.style.width = `${width}mm`;
    canvas.style.height = `${height}mm`;
    
    const previewCanvas = document.getElementById('previewCanvas');
    previewCanvas.style.width = `${width}mm`;
    previewCanvas.style.height = `${height}mm`;
    
    currentTemplate.width = parseInt(width);
    currentTemplate.height = parseInt(height);
    
    debouncedUpdatePreview();
}

// Update preview
function updatePreview() {
    const previewCanvas = document.getElementById('previewCanvas');
    const productSelect = document.getElementById('previewProductSelect');
    const selectedProductId = productSelect.value;
    
    if (!selectedProductId) {
        previewCanvas.innerHTML = '<p style="padding: 1rem; color: #95a5a6;">Select a product to preview</p>';
        return;
    }
    
    const product = products.find(p => p.publicId === selectedProductId);
    if (!product) return;
    
    // Clear preview
    previewCanvas.innerHTML = '';
    
    // Render elements with product data
    currentTemplate.elements.forEach(elementData => {
        const element = createPreviewElement(elementData, product);
        previewCanvas.appendChild(element);
    });
}

// Create preview element
function createPreviewElement(elementData, product) {
    const element = document.createElement('div');
    element.style.position = 'absolute';
    
    // Apply styles (excluding wordWrap which is a class)
    Object.keys(elementData.style).forEach(key => {
        if (key === 'wordWrap') return; // Handle separately
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        element.style[cssKey] = elementData.style[key];
    });
    
    // Set content and classes
    if (elementData.type === 'variable') {
        const variable = elementData.content;
        const value = getVariableValue(variable, product);
        element.textContent = value || variable;
        element.className = 'canvas-variable';
        // Add word wrap class if enabled (after setting base class)
        if (elementData.style.wordWrap) {
            element.classList.add('word-wrap');
        }
    } else if (elementData.type === 'text') {
        element.textContent = elementData.content;
        element.className = 'canvas-text';
        // Add word wrap class if enabled (after setting base class)
        if (elementData.style.wordWrap) {
            element.classList.add('word-wrap');
        }
    } else if (elementData.type === 'barcode') {
        element.className = 'canvas-barcode';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('id', `preview-barcode-${Date.now()}`);
        element.appendChild(svg);
        const barcodeValue = elementData.content || product.UPC || product.SKU || '123456789012';
        JsBarcode(`#${svg.id}`, barcodeValue.replace(/[^0-9]/g, ''), {
            format: 'EAN13',
            width: 1,
            height: 40
        });
    } else if (elementData.type === 'rectangle') {
        element.className = 'canvas-rectangle';
    } else if (elementData.type === 'line') {
        element.className = 'canvas-line';
    }
    
    return element;
}

// Get variable value from product
function getVariableValue(variable, product) {
    const varName = variable.replace(/[{}]/g, '').trim();
    
    // Map variable names to CSV columns
    const mapping = {
        'Title': 'Title',
        'Price': 'Price',
        'SKU': 'SKU',
        'UPC': 'UPC',
        'Category': 'Category',
        'Tags': 'Tags',
        'Distributor': 'Distributor',
        'In Stock': 'In Stock',
        'Unit Cost': 'Unit Cost',
        'Case Cost': 'Case Cost'
    };
    
    // Handle special parsed variables
    if (varName === 'Size') {
        return parseTagValue(product.Tags || '', 'Size');
    }
    
    if (varName === 'Vintage') {
        return parseTagValue(product.Tags || '', 'Vintage');
    }
    
    const columnName = mapping[varName] || varName;
    return product[columnName] || '';
}

// Parse a specific value from Tags field (e.g., "Size: 750 ML" -> "750 ML")
function parseTagValue(tags, tagName) {
    if (!tags) return '';
    
    // Tags format: "Size: 750 ML / Color: Red / Vintage: 2024"
    const regex = new RegExp(`${tagName}:\\s*([^/]+)`, 'i');
    const match = tags.match(regex);
    return match ? match[1].trim() : '';
}

// Populate preview dropdown
function populatePreviewDropdown() {
    const select = document.getElementById('previewProductSelect');
    select.innerHTML = '<option value="">Select a product...</option>';
    
    products.slice(0, 100).forEach(product => {
        const option = document.createElement('option');
        option.value = product.publicId;
        option.textContent = product.Title || 'Untitled Product';
        select.appendChild(option);
    });
}

// Clear canvas
function clearCanvas() {
    if (confirm('Are you sure you want to clear the canvas?')) {
        const canvas = document.getElementById('canvas');
        canvas.innerHTML = '';
        currentTemplate.elements = [];
        deselectElement();
        debouncedUpdatePreview();
    }
}

// Handle drop
function handleDrop(e) {
    e.preventDefault();
    // Drop functionality can be added here if needed
}

// Save template
function saveTemplate() {
    const name = document.getElementById('templateName').value.trim();
    if (!name) {
        alert('Please enter a template name');
        return;
    }
    
    const template = {
        ...currentTemplate,
        name: name,
        savedAt: new Date().toISOString()
    };
    
    const templates = JSON.parse(localStorage.getItem('shelfTagTemplates') || '[]');
    templates.push(template);
    localStorage.setItem('shelfTagTemplates', JSON.stringify(templates));
    
    hideSaveModal();
    alert('Template saved successfully!');
}

// Show save modal
function showSaveModal() {
    document.getElementById('templateModal').classList.add('active');
    document.getElementById('templateName').value = currentTemplate.name;
    document.getElementById('templateName').focus();
}

// Hide save modal
function hideSaveModal() {
    document.getElementById('templateModal').classList.remove('active');
}

// Show load modal
function showLoadModal() {
    const templates = JSON.parse(localStorage.getItem('shelfTagTemplates') || '[]');
    const templateList = document.getElementById('templateList');
    
    if (templates.length === 0) {
        templateList.innerHTML = '<p style="color: #95a5a6; text-align: center; padding: 2rem;">No saved templates</p>';
    } else {
        templateList.innerHTML = templates.reverse().map((template, index) => `
            <div class="template-item" data-index="${templates.length - 1 - index}">
                <h4>${template.name}</h4>
                <div class="template-date">${new Date(template.savedAt).toLocaleString()}</div>
            </div>
        `).join('');
        
        templateList.querySelectorAll('.template-item').forEach(item => {
            item.addEventListener('click', () => {
                loadTemplate(templates[parseInt(item.dataset.index)]);
                hideLoadModal();
            });
        });
    }
    
    document.getElementById('loadTemplateModal').classList.add('active');
}

// Save template to disk as JSON file
function saveTemplateToDisk() {
    // Ensure current template is up to date
    if (selectedElement) {
        updateElementInTemplate(selectedElement);
    }
    
    const template = {
        ...currentTemplate,
        name: currentTemplate.name || 'Untitled Template',
        savedAt: new Date().toISOString(),
        version: '1.0'
    };
    
    // Create JSON blob
    const json = JSON.stringify(template, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('Template saved to disk!');
}

// Load template from disk
function loadTemplateFromDisk(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const template = JSON.parse(e.target.result);
            
            // Validate template structure
            if (!template.elements || !Array.isArray(template.elements)) {
                alert('Invalid template file format');
                return;
            }
            
            // Load the template
            loadTemplate(template);
            
            // Optionally save to localStorage as well
            const templates = JSON.parse(localStorage.getItem('shelfTagTemplates') || '[]');
            const existingIndex = templates.findIndex(t => t.name === template.name);
            if (existingIndex >= 0) {
                templates[existingIndex] = template;
            } else {
                templates.push(template);
            }
            localStorage.setItem('shelfTagTemplates', JSON.stringify(templates));
            
            alert(`Template "${template.name}" loaded successfully!`);
        } catch (error) {
            console.error('Error loading template:', error);
            alert('Error loading template file. Please make sure it is a valid JSON file.');
        }
    };
    
    reader.readAsText(file);
    // Reset input so same file can be loaded again
    event.target.value = '';
}

// Hide load modal
function hideLoadModal() {
    document.getElementById('loadTemplateModal').classList.remove('active');
}

// Load template
function loadTemplate(template) {
    currentTemplate = template;
    
    // Update canvas size
    document.getElementById('tagWidth').value = template.width;
    document.getElementById('tagHeight').value = template.height;
    updateCanvasSize();
    
    // Clear canvas
    const canvas = document.getElementById('canvas');
    canvas.innerHTML = '';
    
    // Load elements
    template.elements.forEach(elementData => {
        const element = recreateElement(elementData);
        canvas.appendChild(element);
    });
    
    updatePreview();
}

// Recreate element from template data
function recreateElement(elementData) {
    const element = document.createElement('div');
    element.id = elementData.id;
    element.className = 'canvas-element';
    
    // Apply type-specific class
    if (elementData.type === 'text') {
        element.classList.add('canvas-text');
        element.textContent = elementData.content;
    } else if (elementData.type === 'variable') {
        element.classList.add('canvas-variable');
        element.textContent = elementData.content;
        element.dataset.variable = elementData.content;
    } else if (elementData.type === 'barcode') {
        element.classList.add('canvas-barcode');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('id', `barcode-${element.id}`);
        element.appendChild(svg);
        JsBarcode(`#barcode-${element.id}`, elementData.content || '123456789012', {
            format: 'EAN13',
            width: 1,
            height: 40
        });
    } else if (elementData.type === 'rectangle') {
        element.classList.add('canvas-rectangle');
    } else if (elementData.type === 'line') {
        element.classList.add('canvas-line');
    }
    
    // Apply styles (excluding wordWrap which is a class)
    Object.keys(elementData.style).forEach(key => {
        if (key === 'wordWrap') return; // Handle separately
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        element.style[cssKey] = elementData.style[key];
    });
    
    // Apply word wrap class if enabled
    if (elementData.style.wordWrap) {
        element.classList.add('word-wrap');
    }
    
    setupElementInteractions(element);
    return element;
}

// Load template to canvas (default)
function loadTemplateToCanvas() {
    const templates = JSON.parse(localStorage.getItem('shelfTagTemplates') || '[]');
    if (templates.length > 0) {
        loadTemplate(templates[templates.length - 1]);
    }
}

// Switch mode
function switchMode() {
    const designerMode = document.getElementById('designerMode');
    const printMode = document.getElementById('printMode');
    const switchLabel = document.getElementById('headerMenuSwitchMode');
    
    if (designerMode.classList.contains('active')) {
        designerMode.classList.remove('active');
        printMode.classList.add('active');
        if (switchLabel) switchLabel.textContent = 'Switch to Designer Mode';
    } else {
        printMode.classList.remove('active');
        designerMode.classList.add('active');
        if (switchLabel) switchLabel.textContent = 'Switch to Print Mode';
    }
}

// Initialize print mode
function initializePrintMode() {
    // Print mode is initialized when switching to it
}

// Save printer preference to localStorage
function savePrinterPreference(printerIP) {
    try {
        localStorage.setItem('printerIPPreference', printerIP);
        console.log('Printer preference saved:', printerIP);
    } catch (error) {
        console.error('Error saving printer preference:', error);
    }
}

// Load printer preference from localStorage
function loadPrinterPreference() {
    try {
        const savedIP = localStorage.getItem('printerIPPreference');
        if (savedIP) {
            const radioButton = document.querySelector(`input[name="printerIP"][value="${savedIP}"]`);
            if (radioButton) {
                radioButton.checked = true;
                console.log('Printer preference loaded:', savedIP);
            } else {
                console.warn('Saved printer IP not found in options:', savedIP);
            }
        }
    } catch (error) {
        console.error('Error loading printer preference:', error);
    }
}

// Update the one-line printer settings summary (when view is "Summary")
function updatePrinterSettingsSummary() {
    const el = document.getElementById('printerSettingsSummary');
    if (!el) return;
    const printMethodRadio = document.querySelector('input[name="printMethod"]:checked');
    const printerIPRadio = document.querySelector('input[name="printerIP"]:checked');
    const fastPrint = document.getElementById('fastPrintMode');
    if (!printMethodRadio) {
        el.textContent = '';
        return;
    }
    if (printMethodRadio.value === 'browser') {
        el.textContent = 'Browser Print Dialog';
        return;
    }
    const parts = ['Epson'];
    if (printerIPRadio) {
        const label = printerIPRadio.closest('label');
        parts.push(label ? label.textContent.replace(/\s+/g, ' ').trim() : printerIPRadio.value);
    }
    if (fastPrint && fastPrint.checked) parts.push('(fast print)');
    el.textContent = parts.join(' · ');
}

// Update keyboard highlight in search results and scroll into view
function updateSearchHighlight() {
    const resultsDiv = document.getElementById('searchResults');
    const items = resultsDiv ? resultsDiv.querySelectorAll('.search-result-item') : [];
    items.forEach((item, i) => {
        item.classList.toggle('highlighted', i === searchHighlightedIndex);
    });
    if (searchHighlightedIndex >= 0 && items[searchHighlightedIndex]) {
        items[searchHighlightedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

// Perform search
function performSearch() {
    const query = document.getElementById('productSearch').value.toLowerCase().trim();
    const resultsDiv = document.getElementById('searchResults');
    
    if (!query) {
        resultsDiv.innerHTML = '<p style="padding: 1rem; color: #95a5a6; text-align: center;">Enter a search term</p>';
        searchHighlightedIndex = -1;
        return;
    }
    
    const results = products.filter(product => {
        const title = (product.Title || '').toLowerCase();
        const sku = (product.SKU || '').toLowerCase();
        const upc = (product.UPC || '').toLowerCase();
        const category = (product.Category || '').toLowerCase();
        
        return title.includes(query) || sku.includes(query) || upc.includes(query) || category.includes(query);
    }).slice(0, 50);
    
    if (results.length === 0) {
        resultsDiv.innerHTML = '<p style="padding: 1rem; color: #95a5a6; text-align: center;">No products found</p>';
        searchHighlightedIndex = -1;
        return;
    }
    
    resultsDiv.innerHTML = results.map(product => `
        <div class="search-result-item" data-id="${product.publicId}">
            <h4>${product.Title || 'Untitled Product'}</h4>
            <div class="result-details">
                ${product.SKU ? `SKU: ${product.SKU} | ` : ''}
                ${product.Price ? `Price: ${product.Price} | ` : ''}
                ${product.Category ? `Category: ${product.Category}` : ''}
            </div>
        </div>
    `).join('');
    
    searchHighlightedIndex = 0;
    updateSearchHighlight();
    
    // Add click handlers
    resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const productId = item.dataset.id;
            addProductToSelection(productId);
        });
    });
}

// Add product to selection (repeated clicks increase copies)
function addProductToSelection(productId) {
    const product = products.find(p => p.publicId === productId);
    if (!product) return;
    const existing = selectedProducts.find(p => p.publicId === productId);
    if (existing) {
        productCopies[productId] = Math.min(99, (productCopies[productId] || 1) + 1);
    } else {
        selectedProducts.push(product);
        productCopies[productId] = 1;
    }
    updateSelectedProductsList();
}

// Update selected products list
function updateSelectedProductsList() {
    const container = document.getElementById('selectedProducts');
    const printBtn = document.getElementById('printSelectedBtn');
    const clearBtn = document.getElementById('clearSelectedBtn');
    if (!container) return;
    if (selectedProducts.length === 0) {
        container.innerHTML = '<p class="empty-message">No products selected. Search and select products to print tags.</p>';
        if (printBtn) printBtn.disabled = true;
        if (clearBtn) clearBtn.disabled = true;
        return;
    }
    
    container.innerHTML = selectedProducts.map(product => {
        var n = Math.max(1, Math.min(99, productCopies[product.publicId] || 1));
        return `<div class="selected-product-item" data-id="${product.publicId}">
            <div class="selected-product-info">
                <h4>${product.Title || 'Untitled Product'}</h4>
                <div class="product-info">
                    ${product.SKU ? `SKU: ${product.SKU} | ` : ''}
                    ${product.Price ? `Price: ${product.Price}` : ''}
                </div>
            </div>
            <div class="product-item-copies">
                <button type="button" class="btn btn-small copies-btn product-copies-minus" data-id="${product.publicId}" aria-label="Decrease copies">−</button>
                <span class="copies-value product-copies-value" data-id="${product.publicId}">${n}</span>
                <button type="button" class="btn btn-small copies-btn product-copies-plus" data-id="${product.publicId}" aria-label="Increase copies">+</button>
            </div>
            <button class="remove-product-btn" data-id="${product.publicId}">Remove</button>
        </div>`;
    }).join('');
    
    if (printBtn) printBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;
    
    container.querySelectorAll('.remove-product-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const productId = btn.dataset.id;
            selectedProducts = selectedProducts.filter(p => p.publicId !== productId);
            delete productCopies[productId];
            updateSelectedProductsList();
        });
    });
    container.querySelectorAll('.product-copies-minus').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            var v = Math.max(1, (productCopies[id] || 1) - 1);
            productCopies[id] = v;
            btn.parentElement.querySelector('.product-copies-value').textContent = String(v);
        });
    });
    container.querySelectorAll('.product-copies-plus').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            var v = Math.min(99, (productCopies[id] || 1) + 1);
            productCopies[id] = v;
            btn.parentElement.querySelector('.product-copies-value').textContent = String(v);
        });
    });
}

// Clear search
function clearSearch() {
    document.getElementById('productSearch').value = '';
    document.getElementById('searchResults').innerHTML = '';
}

// Clear selected products
function clearSelectedProducts() {
    selectedProducts = [];
    productCopies = {};
    updateSelectedProductsList();
}

// Print selected tags
function printSelectedTags() {
    console.log('printSelectedTags called');
    
    if (selectedProducts.length === 0) {
        alert('No products selected');
        return;
    }
    
    // Load the most recent template
    const templates = JSON.parse(localStorage.getItem('shelfTagTemplates') || '[]');
    if (templates.length === 0) {
        alert('No template found. Please create and save a template first.');
        return;
    }
    
    const template = templates[templates.length - 1];
    
    // Check which print method is selected
    const printMethodRadio = document.querySelector('input[name="printMethod"]:checked');
    if (!printMethodRadio) {
        alert('Please select a print method (Browser Print Dialog or Direct Epson Printer)');
        console.error('No print method selected');
        return;
    }
    
    const printMethod = printMethodRadio.value;
    console.log('Print method selected:', printMethod);

    var toPrint = [];
    selectedProducts.forEach(function (p) {
        var n = Math.max(1, Math.min(99, productCopies[p.publicId] || 1));
        for (var i = 0; i < n; i++) toPrint.push(p);
    });
    
    try {
        if (printMethod === 'epson') {
            printToEpson(template, toPrint);
        } else {
            printToBrowser(template, toPrint);
        }
    } catch (error) {
        console.error('Error in printSelectedTags:', error);
        alert('Error printing: ' + error.message);
    }
}

// Print to browser (original method)
function printToBrowser(template, productsToPrint) {
    var list = productsToPrint && productsToPrint.length ? productsToPrint : selectedProducts;
    
    // Create print window
    const printWindow = window.open('', '_blank');
    
    // Get custom fonts for print
    const customFonts = getCustomFonts();
    const fontFaces = customFonts.map(font => `
        @font-face {
            font-family: '${font.name}';
            src: url('${font.data}') format('${font.format}');
        }
    `).join('\n');
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Print Tags</title>
            <link href="https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300..900;1,300..900&display=swap" rel="stylesheet">
            <style>
                ${fontFaces}
                .word-wrap {
                    white-space: normal !important;
                    overflow-wrap: break-word !important;
                    word-wrap: break-word !important;
                    word-break: break-word !important;
                    overflow: hidden;
                }
                .canvas-text,
                .canvas-variable {
                    text-transform: uppercase !important;
                }
                @media print {
                    @page {
                        size: ${template.width}mm ${template.height}mm;
                        margin: 0;
                        /* Force portrait orientation */
                        orientation: portrait;
                    }
                    * {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        width: ${template.width}mm !important;
                        height: ${template.height}mm !important;
                        overflow: hidden;
                        /* Ensure no rotation */
                        transform: rotate(0deg) !important;
                    }
                    .print-tag {
                        width: ${template.width}mm !important;
                        height: ${template.height}mm !important;
                        max-width: ${template.width}mm !important;
                        max-height: ${template.height}mm !important;
                        position: relative !important;
                        page-break-after: always;
                        page-break-inside: avoid;
                        border: 1px solid #ccc;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-sizing: border-box;
                        overflow: hidden;
                        transform: rotate(0deg) !important;
                        /* Ensure proper orientation */
                        writing-mode: horizontal-tb !important;
                        direction: ltr !important;
                    }
                }
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                }
                .print-tag {
                    width: ${template.width}mm;
                    height: ${template.height}mm;
                    position: relative;
                    border: 1px solid #ccc;
                    margin-bottom: 1mm;
                    background: white;
                    box-sizing: border-box;
                }
            </style>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        </head>
        <body>
    `);
    
    // Generate tags for each product
    list.forEach((product, index) => {
        printWindow.document.write(`<div class="print-tag" id="tag-${index}">`);
        
        template.elements.forEach(elementData => {
            const element = createPrintElement(elementData, product);
            printWindow.document.write(element);
        });
        
        printWindow.document.write('</div>');
    });
    
    printWindow.document.write(`
        </body>
        </html>
    `);
    printWindow.document.close();
    
    printWindow.onafterprint = function () { printWindow.close(); };
    setTimeout(function () {
        printWindow.print();
    }, 500);
}

// Print directly to Epson printer using ePOS SDK
async function printToEpson(template, productsToPrint) {
    var toPrint = (productsToPrint && productsToPrint.length) ? productsToPrint : selectedProducts;
    console.log('printToEpson called');
    
    const printerIPRadio = document.querySelector('input[name="printerIP"]:checked');
    const printerNameInput = document.getElementById('printerName');
    
    if (!printerIPRadio) {
        alert('Printer selection not found. Please refresh the page.');
        console.error('printerIP radio button not found');
        return;
    }
    
    const printerIP = printerIPRadio.value.trim();
    const printerName = printerNameInput ? printerNameInput.value.trim() : '';
    
    console.log('Printer IP:', printerIP, 'Printer Name:', printerName);
    
    if (!printerIP) {
        alert('Please select a printer');
        return;
    }
    
    // Check if ePOS SDK is available
    if (typeof epson === 'undefined') {
        alert('Epson ePOS SDK not loaded.\n\nThe epos-2.27.0.js file may not be loading correctly.\n\nPlease check:\n1. The file epos-2.27.0.js exists in the project folder\n2. Open browser console (F12) to check for script loading errors\n3. Make sure you\'re running from a web server (not file://)\n4. Refresh the page after ensuring the file is present');
        console.error('epson object is undefined');
        return;
    }
    
    if (!epson.ePOSDevice) {
        alert('Epson ePOS SDK loaded but ePOSDevice is not available.\n\nPlease check:\n1. The epos-2.27.0.js file is the correct version\n2. Open browser console (F12) to check for errors\n3. Try refreshing the page');
        console.error('epson.ePOSDevice is not available. epson object:', epson);
        return;
    }
    
    // Function to attempt connection with a specific port
    async function tryConnect(port, useSSL = false) {
        return new Promise((resolve, reject) => {
            try {
                const ePosDev = new epson.ePOSDevice();
                const options = useSSL ? {'eposprint': true, 'timeout': 10000} : {'eposprint': true, 'timeout': 10000};
                
                console.log(`Attempting connection to ${printerIP}:${port} (SSL: ${useSSL})`);
                
                ePosDev.connect(printerIP, port, async function(result) {
                    console.log(`Connection result for port ${port}:`, result);
                    
                    if (result === 'OK' || result === 'SSL_CONNECT_OK') {
                        console.log('Connected to printer successfully');
                        resolve({ePosDev, result});
                    } else {
                        reject(new Error(`Connection failed: ${result}`));
                    }
                }, options);
            } catch (error) {
                reject(error);
            }
        });
    }
    
    function tryCreateDevice(ePosDev, deviceName, namesToTry, timeoutMs, retriesLeft) {
        if (retriesLeft === undefined) retriesLeft = 1;
        return new Promise((resolve, reject) => {
            let settled = false;
            const timeoutId = setTimeout(() => {
                if (settled) return;
                settled = true;
                if (retriesLeft > 0) {
                    console.log(`Device "${deviceName}" timed out, retrying once...`);
                    clearTimeout(timeoutId);
                    setTimeout(() => {
                        tryCreateDevice(ePosDev, deviceName, namesToTry, timeoutMs, retriesLeft - 1).then(resolve).catch(reject);
                    }, 400);
                    return;
                }
                console.log(`Device "${deviceName}" timed out (no response), trying next...`);
                if (namesToTry.length > 0) {
                    const nextName = namesToTry.shift();
                    setTimeout(() => {
                        console.log(`Attempting to create device: ${nextName}`);
                        tryCreateDevice(ePosDev, nextName, namesToTry, timeoutMs, 1).then(resolve).catch(reject);
                    }, 400);
                } else {
                    reject(new Error('Printer did not respond to any device name. Check ePOS-Print is enabled and the device name at http://[printer-ip].'));
                }
            }, timeoutMs);

            console.log(`Attempting to create device: ${deviceName}`);
            ePosDev.createDevice(deviceName, ePosDev.DEVICE_TYPE_PRINTER,
                {'crypto': false, 'buffer': false},
                function(printer, createResult) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeoutId);
                    console.log(`createDevice result for "${deviceName}":`, createResult);

                    if (createResult === 'OK') {
                        console.log(`Printer device created successfully: ${deviceName}`);
                        resolve({printer, deviceName});
                    } else if ((createResult === 'device_not_found' || createResult === 'DEVICE_NOT_FOUND') && namesToTry.length > 0) {
                        const nextName = namesToTry.shift();
                        console.log(`Device "${deviceName}" not found, trying: ${nextName}`);
                        setTimeout(() => {
                            tryCreateDevice(ePosDev, nextName, namesToTry, timeoutMs, 1).then(resolve).catch(reject);
                        }, 400);
                    } else {
                        reject(new Error(`Device creation failed: ${createResult}`));
                    }
                });
        });
    }
    
    try {
        let connection = null;
        let ePosDev = null;
        
        // Try HTTP port 8008 first, then HTTPS port 8043
        try {
            connection = await tryConnect('8008', false);
            ePosDev = connection.ePosDev;
        } catch (error) {
            console.log('HTTP connection failed, trying HTTPS:', error.message);
            try {
                connection = await tryConnect('8043', true);
                ePosDev = connection.ePosDev;
            } catch (error2) {
                alert(`Connection failed on both ports.\n\nHTTP (8008) error: ${error.message}\nHTTPS (8043) error: ${error2.message}\n\nMake sure:\n1. Printer is on the same network\n2. Printer IP address is correct (${printerIP})\n3. Printer supports ePOS SDK\n4. Printer is powered on and ready\n5. ePOS-Print is enabled on the printer`);
                return;
            }
        }
        
        // Generate device name variations
        function generateNameVariations(name) {
            if (!name) return [];
            const variations = [name];
            // Try without hyphens
            variations.push(name.replace(/-/g, ''));
            // Try with different cases
            if (name.includes('-')) {
                variations.push(name.toLowerCase());
                variations.push(name.toUpperCase());
                // Try with spaces instead of hyphens
                variations.push(name.replace(/-/g, ' '));
            }
            return [...new Set(variations)]; // Remove duplicates
        }
        
        const defaultNames = ['epos_printer', 'local_printer', 'printer'];
        const tmM30IINames = ['TM-m30II-H', 'TM-m30IIH', 'TM-m30II', 'TM-m30', 'TM-m30II-H_epos', 'TM-m30IIH_epos', 'TM-m30II_epos'];
        const commonNames = [...defaultNames, ...tmM30IINames, 'TM-T88V', 'TM-T82', 'TM-T20', 'TM-T88VI', 'TM-m30III'];

        let namesToTry = [];
        if (printerName) {
            const userVariations = generateNameVariations(printerName);
            namesToTry = [...userVariations, ...commonNames.filter(n => !userVariations.includes(n))];
        } else {
            namesToTry = commonNames;
        }
        console.log(`Will try device names in order:`, namesToTry);

        await new Promise(r => setTimeout(r, 150));

        let printer = null;
        let deviceName = null;
        try {
            const timeoutMs = printerName ? 25000 : 20000;
            const deviceResult = await tryCreateDevice(ePosDev, namesToTry[0], namesToTry.slice(1), timeoutMs, 1);
            printer = deviceResult.printer;
            deviceName = deviceResult.deviceName;
        } catch (error) {
            ePosDev.disconnect();
            let errorMsg = `Failed to create printer device.\n\n`;
            errorMsg += `Tried device names:\n`;
            namesToTry.forEach(name => {
                errorMsg += `  - ${name}\n`;
            });
            errorMsg += `\nError: ${error.message}\n\n`;
            errorMsg += `Please check:\n`;
            errorMsg += `1. The device name matches your printer's configuration\n`;
            errorMsg += `2. The device name is shown in the printer's web interface (usually at http://${printerIP})\n`;
            errorMsg += `3. ePOS-Print is enabled in the printer settings\n`;
            errorMsg += `4. Try entering the exact device name from the printer's web interface`;
            alert(errorMsg);
            return;
        }
        
        // Set up response handler
        printer.onreceive = function(response) {
            if (!response.success) {
                console.error('Printer error:', response);
            }
        };
        
        var fastPrintEl = document.getElementById('fastPrintMode');
        var fastPrint = fastPrintEl ? fastPrintEl.checked : false;
        var usedRaster = false;
        var rasterError = null;
        try {
            var canvas = await renderTagToCanvas(template, toPrint[0], { fastPrint: fastPrint });
            usedRaster = true;
        } catch (e) {
            rasterError = e;
            console.warn('Raster preview failed, falling back to text:', e.message);
        }

        // When 5+ tags are queued, some Epson printers drop the last cut if we send all in one batch.
        // Send each tag (and its cut) in its own send() so the last tag always cuts.
        var BATCH_CUT_THRESHOLD = 5;
        var sendPerTag = toPrint.length >= BATCH_CUT_THRESHOLD;

        if (usedRaster) {
            try {
                var canvases = [canvas];
                for (var i = 1; i < toPrint.length; i++) {
                    var can = await renderTagToCanvas(template, toPrint[i], { fastPrint: fastPrint });
                    canvases.push(can);
                }
                printer.addTextAlign(printer.ALIGN_LEFT);
                for (var k = 0; k < canvases.length; k++) {
                    var c = canvases[k];
                    var ctx = c.getContext('2d');
                    printer.addImage(ctx, 0, 0, c.width, c.height, printer.COLOR_1, printer.MODE_MONO);
                    printer.addCut(printer.CUT_NO_FEED);
                    if (sendPerTag) {
                        printer.send();
                        if (k < canvases.length - 1) {
                            await new Promise(function (r) { setTimeout(r, 150); });
                        }
                    }
                }
                if (!sendPerTag) {
                    printer.send();
                }
                await new Promise(function (r) { setTimeout(r, 400); });
                ePosDev.disconnect();
            } catch (err) {
                console.error('Print error:', err);
                ePosDev.disconnect();
                alert('Error printing: ' + err.message);
            }
        } else {
            try {
                printer.addTextAlign(printer.ALIGN_LEFT);
                for (var j = 0; j < toPrint.length; j++) {
                    var p = toPrint[j];
                    printer.addTextSize(1, 1);
                    printer.addTextStyle(false, false, false, printer.COLOR_1);
                    template.elements.forEach(function (el) { renderEpsonElement(printer, el, p); });
                    printer.addCut(printer.CUT_NO_FEED);
                    if (sendPerTag) {
                        printer.send();
                        if (j < toPrint.length - 1) {
                            await new Promise(function (r) { setTimeout(r, 150); });
                        }
                    }
                }
                if (!sendPerTag) {
                    printer.send();
                }
                await new Promise(function (r) { setTimeout(r, 400); });
                ePosDev.disconnect();
            } catch (err) {
                console.error('Print error:', err);
                ePosDev.disconnect();
                alert('Error printing: ' + err.message);
            }
        }
        
    } catch (error) {
        console.error('Epson print error:', error);
        alert(`Error printing to Epson printer: ${error.message}\n\nMake sure:\n1. Printer is on the same network\n2. Printer IP address is correct\n3. Printer supports ePOS SDK\n4. Printer is powered on and ready`);
    }
}

// Render element to Epson printer
function renderEpsonElement(printer, elementData, product) {
    const style = elementData.style;
    
    if (elementData.type === 'text') {
        const fontSize = parseInt(style.fontSize) || 12;
        const fontScale = Math.min(Math.max(fontSize / 12, 0.5), 2);
        
        printer.addTextSize(Math.floor(fontScale), Math.floor(fontScale));
        printer.addTextStyle(false, style.fontWeight === 'bold', false, printer.COLOR_1);
        printer.addTextAlign(getEpsonAlign(style.textAlign, printer));
        printer.addText(`${elementData.content}\n`);
        
    } else if (elementData.type === 'variable') {
        const variable = elementData.content;
        const value = getVariableValue(variable, product);
        const fontSize = parseInt(style.fontSize) || 12;
        const fontScale = Math.min(Math.max(fontSize / 12, 0.5), 2);
        
        printer.addTextSize(Math.floor(fontScale), Math.floor(fontScale));
        printer.addTextStyle(false, style.fontWeight === 'bold', false, printer.COLOR_1);
        printer.addTextAlign(getEpsonAlign(style.textAlign, printer));
        printer.addText(`${(value || variable).toUpperCase()}\n`);
        
    } else if (elementData.type === 'barcode') {
        const barcodeValue = (product.UPC || product.SKU || '123456789012').replace(/[^0-9]/g, '');
        
        // EAN13 barcode
        printer.addBarcode(barcodeValue, printer.BARCODE_EAN13, 5, 50, printer.BARCODE_HRI_BELOW);
        printer.addFeedLine(1);
        
    } else if (elementData.type === 'line') {
        // Draw line using text
        const lineWidth = parseInt(style.width) || 100;
        const lineChar = '-';
        const lineLength = Math.floor(lineWidth / 3); // Approximate
        printer.addText(lineChar.repeat(lineLength) + '\n');
    }
}

// Convert CSS text-align to Epson alignment
function getEpsonAlign(align, printer) {
    switch(align) {
        case 'center': return printer.ALIGN_CENTER;
        case 'right': return printer.ALIGN_RIGHT;
        default: return printer.ALIGN_LEFT;
    }
}

// Test Epson connection
async function testEpsonConnection() {
    console.log('testEpsonConnection called');
    
    const printerIPRadio = document.querySelector('input[name="printerIP"]:checked');
    const printerNameInput = document.getElementById('printerName');
    
    if (!printerIPRadio) {
        alert('Printer selection not found. Please refresh the page.');
        console.error('printerIP radio button not found');
        return;
    }
    
    const printerIP = printerIPRadio.value.trim();
    const printerName = printerNameInput ? printerNameInput.value.trim() : '';
    
    console.log('Printer IP:', printerIP, 'Printer Name:', printerName);
    
    if (!printerIP) {
        alert('Please select a printer');
        return;
    }
    
    if (typeof epson === 'undefined') {
        alert('Epson ePOS SDK not loaded.\n\nThe epos-2.27.0.js file may not be loading correctly.\n\nPlease check:\n1. The file epos-2.27.0.js exists in the project folder\n2. Open browser console (F12) to check for script loading errors\n3. Make sure you\'re running from a web server (not file://)\n4. Refresh the page after ensuring the file is present');
        console.error('epson object is undefined');
        return;
    }
    
    if (!epson.ePOSDevice) {
        alert('Epson ePOS SDK loaded but ePOSDevice is not available.\n\nPlease check:\n1. The epos-2.27.0.js file is the correct version\n2. Open browser console (F12) to check for errors\n3. Try refreshing the page');
        console.error('epson.ePOSDevice is not available. epson object:', epson);
        return;
    }
    
    // Function to attempt connection with a specific port
    async function tryConnect(port, useSSL = false) {
        return new Promise((resolve, reject) => {
            try {
                const ePosDev = new epson.ePOSDevice();
                const options = useSSL ? {'eposprint': true, 'timeout': 10000} : {'eposprint': true, 'timeout': 10000};
                
                console.log(`Attempting connection to ${printerIP}:${port} (SSL: ${useSSL})`);
                
                ePosDev.connect(printerIP, port, function(result) {
                    console.log(`Connection result for port ${port}:`, result);
                    
                    if (result === 'OK' || result === 'SSL_CONNECT_OK') {
                        console.log('Connected to printer successfully');
                        resolve({ePosDev, result});
                    } else {
                        reject(new Error(`Connection failed: ${result}`));
                    }
                }, options);
            } catch (error) {
                reject(error);
            }
        });
    }
    
    const _deviceTimeoutMs = 8000;
    function tryCreateDevice(ePosDev, deviceName, namesToTry = []) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timeoutId = setTimeout(() => {
                if (settled) return;
                settled = true;
                console.log(`Device "${deviceName}" timed out (no response), trying next...`);
                if (namesToTry.length > 0) {
                    const nextName = namesToTry.shift();
                    tryCreateDevice(ePosDev, nextName, namesToTry).then(resolve).catch(reject);
                } else {
                    reject(new Error('Printer did not respond to any device name. Check ePOS-Print is enabled and the device name at http://[printer-ip].'));
                }
            }, _deviceTimeoutMs);
            console.log(`Attempting to create device: ${deviceName}`);
            ePosDev.createDevice(deviceName, ePosDev.DEVICE_TYPE_PRINTER, {'crypto': false, 'buffer': false},
                function(printer, deviceResult) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeoutId);
                    console.log(`createDevice result for "${deviceName}":`, deviceResult);
                    if (deviceResult === 'OK') {
                        resolve({printer, deviceName});
                    } else if ((deviceResult === 'device_not_found' || deviceResult === 'DEVICE_NOT_FOUND') && namesToTry.length > 0) {
                        const nextName = namesToTry.shift();
                        tryCreateDevice(ePosDev, nextName, namesToTry).then(resolve).catch(reject);
                    } else {
                        reject(new Error(`Device creation failed: ${deviceResult}`));
                    }
                });
        });
    }

    try {
        let connection = null;
        let ePosDev = null;
        try {
            connection = await tryConnect('8008', false);
            ePosDev = connection.ePosDev;
        } catch (error) {
            console.log('HTTP connection failed, trying HTTPS:', error.message);
            try {
                connection = await tryConnect('8043', true);
                ePosDev = connection.ePosDev;
            } catch (error2) {
                alert(`Connection failed on both ports.\n\nHTTP (8008) error: ${error.message}\nHTTPS (8043) error: ${error2.message}\n\nMake sure:\n1. Printer is on the same network\n2. Printer IP address is correct (${printerIP})\n3. Printer supports ePOS SDK\n4. Printer is powered on and ready\n5. ePOS-Print is enabled on the printer`);
                return;
            }
        }
        
        // Generate device name variations
        function generateNameVariations(name) {
            if (!name) return [];
            const variations = [name];
            // Try without hyphens
            variations.push(name.replace(/-/g, ''));
            // Try with different cases
            if (name.includes('-')) {
                variations.push(name.toLowerCase());
                variations.push(name.toUpperCase());
                // Try with spaces instead of hyphens
                variations.push(name.replace(/-/g, ' '));
            }
            return [...new Set(variations)]; // Remove duplicates
        }
        
        // TM-m30II names first (typical target), then ePOS defaults
        const tmM30IINames = ['TM-m30II-H', 'TM-m30IIH', 'TM-m30II', 'TM-m30', 'TM-m30II-H_epos', 'TM-m30IIH_epos', 'TM-m30II_epos'];
        const defaultNames = ['epos_printer', 'local_printer', 'printer'];
        const commonNames = [...tmM30IINames, ...defaultNames, 'TM-T88V', 'TM-T82', 'TM-T20', 'TM-T88VI', 'TM-m30III'];

        let namesToTry = [];
        if (printerName) {
            const userVariations = generateNameVariations(printerName);
            namesToTry = [...userVariations, ...commonNames.filter(n => !userVariations.includes(n))];
        } else {
            namesToTry = commonNames;
        }
        
        console.log(`Will try device names in order:`, namesToTry);
        
        // Try to create device
        let printer = null;
        let deviceName = null;
        
        try {
            const deviceResult = await tryCreateDevice(ePosDev, namesToTry[0], namesToTry.slice(1));
            printer = deviceResult.printer;
            deviceName = deviceResult.deviceName;
            
            let successMsg = `Connection successful! Printer is ready.\n\n`;
            successMsg += `Device name: ${deviceName}\n`;
            successMsg += `Connection port: ${connection.result === 'SSL_CONNECT_OK' ? '8043 (HTTPS)' : '8008 (HTTP)'}\n\n`;
            successMsg += `You can now print tags using this printer.`;
            alert(successMsg);
            ePosDev.disconnect();
            
        } catch (error) {
            ePosDev.disconnect();
            let errorMsg = `Connection successful but device creation failed.\n\n`;
            errorMsg += `Tried device names:\n`;
            namesToTry.forEach(name => {
                errorMsg += `  - ${name}\n`;
            });
            errorMsg += `\nError: ${error.message}\n\n`;
            errorMsg += `Please check:\n`;
            errorMsg += `1. The device name matches your printer's configuration\n`;
            errorMsg += `2. Access the printer's web interface at http://${printerIP} to find the exact device name\n`;
            errorMsg += `3. ePOS-Print is enabled in the printer settings\n`;
            errorMsg += `4. Try entering the exact device name from the printer's web interface in the "Printer Name" field`;
            alert(errorMsg);
        }
        
    } catch (error) {
        console.error('Connection test error:', error);
        alert(`Connection test error: ${error.message}\n\nMake sure:\n1. Printer is on the same network\n2. Printer IP address is correct\n3. Printer supports ePOS SDK\n4. Printer is powered on`);
    }
}

// Create print element
function createPrintElement(elementData, product) {
    let html = '<div style="position: absolute;';
    var s = Object.assign({}, elementData.style);
    if ((elementData.type === 'text' || elementData.type === 'variable') && !s.lineHeight) {
        s.lineHeight = '1.3';
    }
    // Apply styles (excluding wordWrap which needs special handling)
    Object.keys(s).forEach(function (key) {
        if (key === 'wordWrap') return;
        var cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        html += cssKey + ': ' + s[key] + ';';
    });
    
    // Add word wrap class if enabled
    const wordWrapClass = s.wordWrap ? ' word-wrap' : '';
    
    html += '">';
    
    if (elementData.type === 'variable') {
        const variable = elementData.content;
        const value = getVariableValue(variable, product);
        html += `<span class="canvas-variable${wordWrapClass}" style="text-transform: uppercase;">${(value || variable).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
    } else if (elementData.type === 'text') {
        html += `<span class="canvas-text${wordWrapClass}" style="text-transform: uppercase;">${elementData.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
    } else if (elementData.type === 'barcode') {
        const barcodeId = `barcode-${Date.now()}-${Math.random()}`;
        html += `<svg id="${barcodeId}"></svg>`;
        html += `<script>JsBarcode('#${barcodeId}', '${(product.UPC || product.SKU || '123456789012').replace(/[^0-9]/g, '')}', {format: 'EAN13', width: 1, height: 40});</script>`;
    } else if (elementData.type === 'rectangle') {
        html = html.replace('">', '" style="border: 2px solid #000;">');
    } else if (elementData.type === 'line') {
        html = html.replace('">', '" style="border-top: 2px solid #000; height: 0;">');
    }
    
    html += '</div>';
    return html;
}

// Dots per mm at 203 DPI (TM thermal printers)
const PRINTER_DOTS_PER_MM = 8;
const DESIGN_PX_PER_MM = 96 / 25.4;

function buildPrintHtmlForOneTag(template, product) {
    var w = Math.round((template.width || 80) * DESIGN_PX_PER_MM);
    var h = Math.round((template.height || 50) * DESIGN_PX_PER_MM);
    var customFonts = getCustomFonts();
    var fontFaces = customFonts.map(function (f) {
        var fmt = (f.format || 'truetype');
        return '@font-face{font-family:"' + f.name + '";src:url("' + f.data + '") format("' + fmt + '");}';
    }).join('');
    var elementsHtml = (template.elements || []).map(function (el) { return createPrintElement(el, product); }).join('');
    return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        '<link href="https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300..900;1,300..900&display=swap" rel="stylesheet">' +
        '<style>' +
        '*{margin:0;padding:0;box-sizing:border-box}' +
        'html,body{margin:0;padding:0;font-family:Arial,sans-serif;background:#fff;overflow:hidden}' +
        fontFaces +
        '.word-wrap{white-space:normal!important;overflow-wrap:break-word!important;word-break:break-word!important;overflow:hidden}' +
        '.canvas-text,.canvas-variable{text-transform:uppercase!important}' +
        '.print-tag{position:relative;width:' + w + 'px;height:' + h + 'px;margin:0;padding:0;border:0;background:#fff;overflow:hidden}' +
        '</style><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script></head><body>' +
        '<div class="print-tag">' + elementsHtml + '</div></body></html>';
}

function renderTagToCanvas(template, product, opts) {
    if (typeof html2canvas === 'undefined') {
        return Promise.reject(new Error('html2canvas not loaded.'));
    }
    opts = opts || {};
    var wMm = template.width || 80;
    var hMm = template.height || 50;
    var designW = Math.round(wMm * DESIGN_PX_PER_MM);
    var designH = Math.round(hMm * DESIGN_PX_PER_MM);
    // Always use full printer resolution (8 dots/mm) for output so physical size is correct.
    // Fast print stays faster via scale:1 and shorter delays; we no longer shrink the sent image.
    var outW = Math.floor(wMm * PRINTER_DOTS_PER_MM);
    var outH = Math.floor(hMm * PRINTER_DOTS_PER_MM);
    var outWidth = Math.max(8, Math.floor(outW / 8) * 8);
    var outHeight = Math.max(1, outH);

    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;width:' + designW + 'px;height:' + designH + 'px;left:0;top:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    var doc = iframe.contentDocument || iframe.contentWindow.document;

    function cleanup() {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }

    return new Promise(function (resolve, reject) {
        iframe.onload = function () {
            var el = doc.querySelector('.print-tag');
            if (!el) { cleanup(); reject(new Error('Raster: .print-tag not found')); return; }
            setTimeout(function () {
                html2canvas(el, {
                    scale: 1,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff',
                    width: designW,
                    height: designH,
                    logging: false
                }).then(function (capture) {
                    var out = document.createElement('canvas');
                    out.width = outWidth;
                    out.height = outHeight;
                    var ctx = out.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, outWidth, outHeight);
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    var fit = 0.98;
                    var dw = Math.max(1, Math.floor(outWidth * fit));
                    var dh = Math.max(1, Math.floor(outHeight * fit));
                    ctx.drawImage(capture, 0, 0, capture.width, capture.height, 0, 0, dw, dh);
                    resolve(out);
                }).catch(function (err) {
                    reject(new Error('Raster render failed: ' + (err && err.message ? err.message : String(err))));
                }).finally(cleanup);
            }, 50);
        };
        iframe.onerror = function () { cleanup(); reject(new Error('Raster iframe load failed')); };
        doc.open();
        doc.write(buildPrintHtmlForOneTag(template, product));
        doc.close();
    });
}

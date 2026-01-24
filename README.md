# Shelf Tag Designer

A web-based shelf tag designer and printing tool for EPSON tm30 receipt printers. Create custom shelf tags with drag-and-drop elements, variables from your product database, and print them directly.

## Features

### Template Designer
- **Drag & Drop**: Easily position elements on your tag template
- **Resize Elements**: Click and drag corners/edges to resize any element
- **Variable Support**: Use product data variables like `{{Title}}`, `{{Price}}`, `{{SKU}}`, etc.
- **Multiple Element Types**:
  - Text elements
  - Variables (dynamically populated from product data)
  - Barcodes (EAN13, CODE128, CODE39, UPC)
  - Rectangles and lines for borders/separators
- **Font Customization**: Choose font family, size, weight, color, and alignment
- **Live Preview**: See how your tag looks with real product data
- **Save/Load Templates**: Save your designs and reuse them later

### Print Mode
- **Product Search**: Quickly find products by Title, SKU, UPC, or Category
- **Batch Selection**: Select multiple products to print tags for
- **Print Preview**: Preview tags before printing
- **EPSON tm30 Compatible**: Optimized for receipt printer output

## Getting Started

### Requirements
- A modern web browser (Chrome, Firefox, Safari, Edge)
- A local web server (required for loading CSV file due to CORS restrictions)
- `products.csv` file in the same directory

### Setup

1. **Start a Local Web Server**

   Since browsers block loading local files via `file://` protocol, you need to run a local web server:

   **Option 1: Python**
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Python 2
   python -m SimpleHTTPServer 8000
   ```

   **Option 2: Node.js (http-server)**
   ```bash
   npx http-server -p 8000
   ```

   **Option 3: PHP**
   ```bash
   php -S localhost:8000
   ```

2. **Open in Browser**
   ```
   http://localhost:8000
   ```

3. **Load Products**
   The app will automatically load `products.csv` from the same directory.

## Usage Guide

### Creating a Template

1. **Add Elements**
   - Click "Add Text", "Add Variable", "Add Barcode", etc. to add elements to your canvas
   - Or select a variable from the dropdown and it will be added automatically

2. **Position Elements**
   - Click and drag any element to move it
   - Click an element to select it (blue border appears)

3. **Resize Elements**
   - Select an element
   - Drag the corner or edge handles to resize

4. **Customize Properties**
   - Select an element to see its properties panel
   - Adjust position, size, fonts, colors, etc.

5. **Preview**
   - Click "Preview" button
   - Select a test product from the dropdown to see how your tag looks with real data

6. **Save Template**
   - Click "Save Template"
   - Enter a name and save

### Available Variables

- `{{Title}}` - Product title
- `{{Price}}` - Product price
- `{{SKU}}` - SKU code
- `{{UPC}}` - UPC barcode number
- `{{Category}}` - Product category
- `{{Tags}}` - Product tags
- `{{Distributor}}` - Distributor name
- `{{In Stock}}` - Stock quantity
- `{{Unit Cost}}` - Unit cost
- `{{Case Cost}}` - Case cost

### Printing Tags

1. **Switch to Print Mode**
   - Click "Switch to Print Mode" button

2. **Search Products**
   - Enter search terms in the search box
   - Click "Search" or press Enter
   - Click on products to add them to your selection

3. **Print**
   - Review selected products
   - Click "Print Selected Tags"
   - The print dialog will open with all tags ready to print

## EPSON tm30 Printer Setup

The app supports two printing methods:

### Method 1: Browser Print Dialog (Default)
Standard HTML/CSS print output through your browser's print dialog.

**Fixed Orientation Issues:**
- The app now forces portrait orientation in CSS to prevent sideways printing
- If you still experience orientation issues, try:
  1. In Chrome: Use "More settings" → Set "Orientation" to Portrait
  2. Check your printer driver settings
  3. Ensure paper size matches your tag dimensions (default: 80mm x 50mm)

**Recommended Print Settings:**
- Paper Size: Custom (match your tag dimensions)
- Orientation: Portrait
- Margins: Minimal (0mm recommended)
- Scale: 100%

### Method 2: Direct Epson Printing (ePOS SDK) - Recommended for Cutting

For direct control of your Epson printer including automatic cutting:

1. **Download Epson ePOS SDK**
   - Visit: https://download.epson-biz.com/modules/pos/index.php?page=soft&scat=58
   - Download the JavaScript SDK (epos-2.27.0.js or latest version)
   - Extract the `epos-2.27.0.js` file to this project folder

2. **Enable SDK in index.html**
   - Open `index.html`
   - Find the commented line: `<!-- <script src="epos-2.27.0.js"></script> -->`
   - Uncomment it: `<script src="epos-2.27.0.js"></script>`

3. **Configure Printer**
   - Switch to Print Mode
   - Select "Direct Epson Printer (ePOS SDK)"
   - Enter your printer's IP address (find it in printer settings or network config)
   - Optional: Enter printer name (default: TM-m30)
   - Click "Test Connection" to verify

4. **Print with Cutting**
   - Select products and click "Print Selected Tags"
   - Tags will print directly to the Epson printer
   - Each tag will be automatically cut after printing

**Printer Requirements:**
- Epson TM-m30 or compatible Epson label printer
- Printer must be on the same network as your computer
- Printer must support ePOS SDK (most modern Epson printers do)
- Printer IP address must be accessible (check firewall settings)

## File Structure

```
franklin-tagmaker/
├── index.html          # Main HTML file
├── styles.css          # Stylesheet
├── app.js             # Application logic
├── products.csv        # Product database
└── README.md          # This file
```

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

## Troubleshooting

### CSV Not Loading
- Ensure `products.csv` is in the same directory as `index.html`
- Make sure you're using a web server (not opening file directly)
- Check browser console for errors

### Templates Not Saving
- Check browser localStorage is enabled
- Clear browser cache if templates aren't loading

### Print Issues
- Ensure printer driver is installed
- Check printer paper size settings match your tag dimensions
- Try printing one tag first to test

## Technical Details

- **CSV Parsing**: Uses PapaParse library
- **Barcode Generation**: Uses JsBarcode library
- **Storage**: Templates saved in browser localStorage
- **Print**: Standard browser print API

## License

This project is provided as-is for your use.
# tagmaker

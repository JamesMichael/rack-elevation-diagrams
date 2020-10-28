// Number of units in a rack
const DEFAULT_RACK_HEIGHT_UNITS  = 42;

// Space between racks
const DEFAULT_RACK_SPACING_POINTS = 25;

// Height of a single rack unit
const DEFAULT_RACK_UNIT_POINTS    = 25;

// Width of a rack
const DEFAULT_RACK_WIDTH_POINTS   = 300;

// Distance between SVG border and racks
const DEFAULT_SVG_MARGIN          = 25;

const SVG_NS                      = 'http://www.w3.org/2000/svg';

const DEFAULT_COLORS = {
    ups: '#38A169',
    pdu: '#38A169',
    firewall: '#F56565',
    switch: '#FC8181',
    blank: '#E2E8F0',
    patch: '#FAF089',
    cables: '#F6AD55',
    server: '#63B3ED',
    san: '#4FD1C5',
};

const EXPORT_PNG_BUTTON  = '#export-png';
const EXPORT_SVG_BUTTON  = '#export-svg';
const PREVIEW_SELECTOR   = '#preview-pane';
const HELP_SYNTAX_BUTTON = '#help-syntax';

// Similar to React.createElement, returns an Element object
// Where:
// - type is the tag name of the element
// - props is an object of properties
// - children other Element objects, or strings
function createSVGElement(type, props, ...children) {
  const el = document.createElementNS(SVG_NS, type);

  if (props !== undefined) {
      for (const [k, v] of Object.entries(props)) {
        el.setAttribute(k, v);
      }
  }

  children
    .map(child => typeof child === 'string' ? document.createTextNode(child) : child )
    .forEach(child => el.appendChild(child));
  return el;
}

// Attempt to parse a RackML string,
// returns an XMLDocument on success, throws an error on invalid input
function parseRackML(rackml) {
    const parser = new DOMParser();
    const dom    = parser.parseFromString(rackml, 'application/xml');

    if (dom.documentElement.nodeName == 'parsererror') {
        throw 'Failed to parse input';
    }

    return dom.documentElement;
}

// Returns an <svg> element containing a rendering of the contents of a rackset
// Where:
// - racks is a <racks> RackML element
// - parameters is an object which can modify the default spacing
//   - unitHeight: height in points of 1U
//   - rackWidth: width in points of a rack
//   - rackSpacing: space between racks
//   - margin: space between svg border and the racks
function buildSVG(racks, parameters) {
    let { unitHeight, rackWidth, rackSpacing, margin } = parameters;

    if (unitHeight === undefined) {
        unitHeight = DEFAULT_RACK_UNIT_POINTS;
    }

    if (rackWidth === undefined) {
        rackWidth = DEFAULT_RACK_WIDTH_POINTS;
    }

    if (rackSpacing === undefined) {
        rackSpacing = DEFAULT_RACK_SPACING_POINTS;
    }

    if (margin === undefined) {
        margin = DEFAULT_SVG_MARGIN;
    }

    let maxRackHeight = 0;
    for (const rack of racks.children) {
        const rackHeight = rack.getAttribute('height') || DEFAULT_RACK_HEIGHT;
        if (rackHeight > maxRackHeight) {
            maxRackHeight = rackHeight;
        }
    }

    const rackCount = racks.children.length;
    const svgHeight = (2 * margin) + (unitHeight * maxRackHeight);
    const svgWidth  = (2 * margin) + (rackCount * rackWidth) + ((rackCount - 1) * rackSpacing);

    const svg = createSVGElement('svg', {
        baseProfile:   'full',
        height:        svgHeight,
        version:       '1.1',
        width:         svgWidth,
        xmlns:         SVG_NS,
        'xmlns:xlink': 'http://www.w3.org/1999/xlink',
    });

    svg.appendChild(
        createSVGElement('style', {}, `
            a:hover {
                filter: saturate(4);
            }
        `)
    );

    let xOffset = margin;
    for (const rack of racks.children) {
        const rackHeight = rack.getAttribute('height') || DEFAULT_RACK_HEIGHT;

        const dom = drawRack(rack, {
            rackWidth:  rackWidth,
            rackHeight: rackHeight,
            unitHeight: unitHeight,
            margin:     margin,
        });

        dom.setAttribute('transform', `translate(${xOffset}, 0)`);

        svg.appendChild(dom);

        xOffset += rackWidth + rackSpacing;
    }

    return svg;
}

// Draws a single rack at (0,0), returns an SVG <g> element
// Where:
//  - rack is a <rack> element
//  - params is an object width the following entries:
//    - rackWidth: width of the rack in points
//    - rackHeight: height of the rack in rack units
//    - unitHeight: height of a single rack unit in points
//    - margin: space between the border of the SVG and the rack
function drawRack(rack, params) {
  const dom = createSVGElement('g');

  const name = rack.getAttribute('name');
  if (name) {
    dom.appendChild(
      createSVGElement('text', {
        x: params.rackWidth  /2,
        y: params.margin / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': 'sans-serif',
      }, name),
    );
  }

  dom.appendChild(
    createSVGElement('rect', {
      x: 0,
      y: params.margin,
      width: params.rackWidth,
      height: params.rackHeight * params.unitHeight,
      fill: '#4A5568',
      stroke: 'black',
    }),
  );

  const rackBottomY = ( params.rackHeight * params.unitHeight ) + params.margin;
  const nodes = Array.from(rack.children).reverse();
  let currentNode = 0;
  for (const node of nodes) {
    const attrAt = parseInt(node.getAttribute('at'));
    const at     = isNaN(attrAt) ? currentNode : attrAt - 1;

    const attrHeight = parseInt(node.getAttribute('height'));
    const height     = isNaN(attrHeight) ? 1 : attrHeight;

    if (node.tagName === 'gap') {
      currentNode = at + height;
      continue;
    }

    let color = 'white';
    color = DEFAULT_COLORS[ node.tagName ] || 'white';
    if (node.getAttribute('color')) {
      color = node.getAttribute('color');
    }

    const el = createSVGElement('rect', {
      x: 0,
      y: rackBottomY - (( at + height ) * params.unitHeight),
      width: params.rackWidth,
      height: height * params.unitHeight,
      fill: color,
      stroke: 'black',
    });

    const link = node.getAttribute('href');
      let container = document.createDocumentFragment();
      if (link) {
        container = createSVGElement('a', {
          href: link,
        }, el);
      } else {
        container.appendChild(el);
    }

    const text = document.createTextNode(node.textContent);
    const rackName = createSVGElement('text', {
      x:                    (params.rackWidth / 2),
      y:                    rackBottomY - (( at + height ) * params.unitHeight) + ((height * params.unitHeight) / 2),
      'text-anchor':       'middle',
      'dominant-baseline': 'central',
      'font-family':       'sans-serif',
    }, node.textContent);
    container.appendChild(rackName);
    dom.appendChild(container);

    currentNode = at + height;
  }

  return dom;
}

// Pulls the RackML content from the editor and renders the SVG into the
// preview panel.
function builder(editor) {
  try {
    const raw = editor.session.getValue();
    const dom = parseRackML(raw, {});
    const svg = buildSVG(dom, {});

    const preview = document.querySelector(PREVIEW_SELECTOR);
    preview.innerHTML = '';
    preview.appendChild(svg);
  } catch(err) { console.err(err) }
}

document.addEventListener('DOMContentLoaded', ev => {
  const editor = ace.edit('editor');
  editor.session.setMode('ace/mode/xml');
  editor.session.on('change', () => builder(editor));
  builder(editor);

  document.querySelector(EXPORT_PNG_BUTTON).addEventListener('click', () => exportPNG(editor));
  document.querySelector(EXPORT_SVG_BUTTON).addEventListener('click', () => exportSVG(editor));
  document.querySelector(HELP_SYNTAX_BUTTON).addEventListener('click', () => location.href = "/syntax.html");
});

// Returns a SVG document as text
function toSVG(rackml) {
  const dom = parseRackML(rackml, {});
  const svg = buildSVG(dom, {})
  return svg.outerHTML;
}

// Creates and makes the browser download the SVG document
function exportSVG(editor) {
  try {
    const svg  = toSVG(editor.session.getValue());
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    downloadFile(url, 'rack.svg');
    URL.revokeObjectURL(url);
  } catch(err) { console.error(err) }
}

// Creates and makes the browser download a PNG image
function exportPNG(editor) {
  try {
    const raw = editor.session.getValue();
    const dom = parseRackML(raw, {});
    const svg = buildSVG(dom, {});

    const canvas = document.createElement('canvas');
    canvas.width = svg.getAttribute('width');
    canvas.height = svg.getAttribute('height');

    const ctx    = canvas.getContext('2d');

    const image = new Image();
    const blob  = new Blob([svg.outerHTML], {type: 'image/svg+xml;charset=utf-8'});
    const url   = URL.createObjectURL(blob);

    image.onload = function() {
      ctx.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);

      const imageURL = canvas.toDataURL('image/png');
      downloadFile(imageURL, 'rack.png');
    };

    image.onerror = function(ev) {
      console.error('cant load blob image');
    };

    image.src = url;
  } catch(err) { console.error(err) }
}

// Force the browser to download a file
function downloadFile(url, filename) {
  const ev = new MouseEvent('click', {
    view: window,
    bubbles: false,
    cancelable: true,
  });

  const a  = document.createElement('a');
  a.setAttribute('download', filename);
  a.setAttribute('href', url);
  a.setAttribute('target', '_blank');

  a.dispatchEvent(ev);
}

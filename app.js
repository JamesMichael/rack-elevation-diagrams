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
        const rackHeight = rack.getAttribute('height') || DEFAULT_RACK_HEIGHT_UNITS;
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
                filter: brightness(80%);
            }
        `)
    );

    const baseHREF = racks.getAttribute('base');

    let xOffset = margin;
    for (const rack of racks.children) {
        const rackHeight = rack.getAttribute('height') || DEFAULT_RACK_HEIGHT_UNITS;

        const dom = drawRack(rack, {
            baseHREF:   baseHREF,
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

    const pos = rackBottomY - ((at+height) * params.unitHeight);
    dom.appendChild(
      createSVGElement('g', {
        transform: `translate(0, ${pos})`,
      }, drawRackDevice(node, {
        height: height * params.unitHeight,
        width: params.rackWidth,
      })),
    );

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
  } catch(err) { console.error(err) }
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

// Draw a single rack entry at 0,0 with the given width and height in pixels
function drawRackDevice(node, params) {
  const {
    height,
    width,
  } = params;

  let color = 'white';
  color = DEFAULT_COLORS[ node.tagName ] || 'white';
  if (node.getAttribute('color')) {
    color = node.getAttribute('color');
  }

  let container = document.createDocumentFragment();
  container.appendChild(
    createSVGElement('rect', {
      x:      0,
      y:      0,
      width:  width,
      height: height,
      fill:   color,
      stroke: 'black',
    }),
  );

  const text = document.createTextNode(node.textContent);
  container.appendChild(
    createSVGElement('text', {
      x:                    width / 2,
      y:                    height / 2,
      'text-anchor':       'middle',
      'dominant-baseline': 'central',
      'font-family':       'sans-serif',
    }, node.textContent),
  );

  let icon;
  switch (node.tagName) {
    case 'cables':
      icon = symbolCables();
      break;
    case 'firewall':
      icon = symbolFirewall();
      break;
    case 'patch':
      icon = symbolPatchPanel();
      break;
    case 'pdu':
      icon = symbolPDU();
      break;
    case 'san':
      icon = symbolSAN();
      break;
    case 'server':
      icon = symbolServer();
      break;
    case 'switch':
      icon = symbolSwitch();
      break;
    case 'ups':
      icon = symbolUPS();
      break;
  }
  if (icon) {
    container.appendChild(icon);
  }

  const link = node.getAttribute('href');
  if (link) {
    const url = params.baseHREF ? new URL(link, params.baseHREF) : link;
    container = createSVGElement('a', {
      href: url,
    }, container);
  }

  return container;
}

function symbolCables() {
  return createSVGElement('path', {
    d: `
      M 10 7
      l -5 5
      l 5 5

      m 3 -5
      a 1,1 0 1,1 -2,0
      a 1,1 0 1,1 2,0

      m 5 0
      a 1,1 0 1,1 -2,0
      a 1,1 0 1,1 2,0

      m 5 0
      a 1,1 0 1,1 -2,0
      a 1,1 0 1,1 2,0

      m 1 -5
      l 5 5
      l -5 5
    `,
    fill: 'none',
    stroke: 'black',
    'stroke-width': 2,
  });
}

function symbolFirewall() {
  return createSVGElement('path', {
    d: `
      M 7 7
      h 15
      v 12
      h -15
      z

      m 0 4
      h 15

      m 0 4
      h -15

      M 7 7
      m 4 0
      v 4

      m 7 0
      v -4

      m -4 4
      v 4

      m -3 0
      v 4

      m 7 0
      v -4
    `,
    fill: 'none',
    stroke: 'black',
    'stroke-width': 2,
  });
}

function symbolPatchPanel() {
  return createSVGElement('g', {},
    createSVGElement('rect', {
      width: 4,
      height: 4,
      x: 7,
      y: 7,
    }),
    createSVGElement('rect', {
      width: 4,
      height: 4,
      x: 14,
      y: 7,
    }),
    createSVGElement('rect', {
      width: 4,
      height: 4,
      x: 21,
      y: 7,
    }),
    createSVGElement('rect', {
      width: 4,
      height: 4,
      x: 28,
      y: 7,
    }),
    createSVGElement('rect', {
      width: 4,
      height: 4,
      x: 7,
      y: 14,
    }),
    createSVGElement('rect', {
      width: 4,
      height: 4,
      x: 14,
      y: 14,
    }),
    createSVGElement('rect', {
      width: 4,
      height: 4,
      x: 21,
      y: 14,
    }),
    createSVGElement('rect', {
      width: 4,
      height: 4,
      x: 28,
      y: 14,
    }),
  );
}

function symbolPDU() {
  return createSVGElement('path', {
    d: `
      M 14 7
      v 7
      m 3 -5
      a 6 6 240 1 1 -5 0
    `,
    stroke: 'black',
    fill: 'none',
    'stroke-width': 2,
    'stroke-linecap': 'round',
  });
}

function symbolSAN() {
  return createSVGElement('path', {
    d: `
      M 7 7
      v 18
      h 5
      v -18
      h -5

      m 7 0
      v 18
      h 5
      v -18
      h -5

      m 7 0
      v 18
      h 5
      v -18
      h -5
    `,
    stroke: 'none',
    fill: 'black',
    'fill-rule': 'evenodd',
  });
}

function symbolServer() {
  return createSVGElement('path', {
    d: `
      M 7 7
      h 20
      v 7
      h -20
      v -7

      m 0 8
      h 20
      v 7
      h -20
      v -7

      M 25 10
      a 2,2 0 1,1 -4,0
      a 2,2 0 1,1 4,0

      M 25 18
      a 2,2 0 1,1 -4,0
      a 2,2 0 1,1 4,0
    `,
    stroke: 'none',
    fill: 'black',
    'fill-rule': 'evenodd',
  });
}

function symbolSwitch() {
  return createSVGElement('path', {
    d: `
      M 15 5
      h 4
      v -2.5
      l 4 4
      l -4 4
      v -2.5
      h -4

      m -2 0
      h -4
      v -2.5
      l -4 4
      l 4 4
      v -2.5
      h 4

      m 2 3
      h 4
      v -2.5
      l 4 4
      l -4 4
      v -2.5
      h -4

      m -2 1
      h -4
      v -2.5
      l -4 4
      l 4 4
      v -2.5
      h 4
    `,
  });
}

function symbolUPS() {
  return createSVGElement('path', {
    d: `
      M 12 7
      h 6
      l -3 5
      h 3
      l -8 10
      l 2 -7
      h -3
    `,
    fill: 'black',
    stroke: 'none',
  });
}

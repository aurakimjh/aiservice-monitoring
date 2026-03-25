package main

// Phase 35-3: Brendan Gregg Flamegraph SVG generation in Go.
//
// Generates interactive SVG flamegraphs with:
//   - Frame rectangles with proportional widths
//   - Text labels (truncated to fit)
//   - Hover tooltip: function name + percentage + sample count
//   - Click-to-zoom JavaScript
//   - Search JavaScript with highlighting
//   - Reset button
//
// Color schemes:
//   - on-CPU:  warm colors (orange/yellow gradient)
//   - off-CPU: cool colors (blue gradient)
//   - memory:  green gradient
//   - diff:    red (increase) / blue (decrease)

import (
	"bytes"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/profiling"
)

const (
	svgFrameHeight = 16
	svgFontSize    = 11
	svgTopMargin   = 60
	svgBottomPad   = 40
	svgLeftPad     = 10
	svgRightPad    = 10
	svgMinWidth    = 0.1 // minimum frame width in %
)

// svgFrame represents a flattened frame for SVG rendering.
type svgFrame struct {
	Name      string
	FullName  string
	Value     int64
	SelfValue int64
	Depth     int
	X         float64 // 0.0 – 1.0 relative position
	W         float64 // 0.0 – 1.0 relative width
}

// GenerateFlamegraphSVG converts a FlameGraphNode tree to an interactive SVG.
func GenerateFlamegraphSVG(root *profiling.FlameGraphNode, profileType string, width int, title string) []byte {
	if root == nil {
		return []byte("<svg></svg>")
	}
	if width <= 0 {
		width = 1200
	}

	totalValue := root.Value
	if totalValue <= 0 {
		totalValue = 1
	}

	// Flatten tree to frame list
	frames := flattenNode(root, 0, 0.0, float64(totalValue))
	maxDepth := 0
	for _, f := range frames {
		if f.Depth > maxDepth {
			maxDepth = f.Depth
		}
	}

	svgHeight := svgTopMargin + (maxDepth+1)*svgFrameHeight + svgBottomPad
	drawWidth := float64(width - svgLeftPad - svgRightPad)

	var buf bytes.Buffer

	// SVG header
	fmt.Fprintf(&buf, `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg1.1.dtd">
<svg version="1.1" width="%d" height="%d" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs>
  <linearGradient id="bg" y1="0" y2="1" x1="0" x2="0">
    <stop stop-color="#1a1a2e" offset="5%%"/>
    <stop stop-color="#16213e" offset="95%%"/>
  </linearGradient>
</defs>
<style>
  .frame:hover rect { opacity: 0.8; stroke: #fff; stroke-width: 0.5; }
  .frame text { font-family: 'Consolas', 'Monaco', monospace; font-size: %dpx; fill: #fff; pointer-events: none; }
  .frame rect { rx: 1; }
  .title { font-family: 'Segoe UI', sans-serif; font-size: 16px; fill: #e0e0e0; }
  .subtitle { font-family: 'Segoe UI', sans-serif; font-size: 11px; fill: #888; }
  .search-match rect { stroke: #ffff00; stroke-width: 1.5; }
  #tooltip { font-family: 'Consolas', monospace; font-size: 11px; fill: #e0e0e0; }
  .btn { cursor: pointer; }
  .btn rect { fill: #333; rx: 3; }
  .btn:hover rect { fill: #555; }
  .btn text { font-size: 11px; fill: #ccc; }
</style>
`, width, svgHeight, svgFontSize)

	// Background
	fmt.Fprintf(&buf, `<rect x="0" y="0" width="%d" height="%d" fill="url(#bg)"/>`, width, svgHeight)

	// Title
	fmt.Fprintf(&buf, `<text x="%d" y="24" class="title">%s</text>`, svgLeftPad, escSVG(title))
	fmt.Fprintf(&buf, `<text x="%d" y="40" class="subtitle">Samples: %s  |  Type: %s  |  Click to zoom, Esc to reset</text>`,
		svgLeftPad, formatCount(totalValue), strings.ToUpper(profileType))

	// Search input placeholder
	fmt.Fprintf(&buf, `<g class="btn" onclick="search_prompt()"><rect x="%d" y="8" width="80" height="22"/><text x="%d" y="23">Search</text></g>`,
		width-svgRightPad-90, width-svgRightPad-82)

	// Reset button
	fmt.Fprintf(&buf, `<g class="btn" onclick="reset_zoom()"><rect x="%d" y="8" width="60" height="22"/><text x="%d" y="23">Reset</text></g>`,
		width-svgRightPad-160, width-svgRightPad-152)

	// Tooltip
	buf.WriteString(`<text id="tooltip" x="10" y="0" visibility="hidden"> </text>`)

	// Render frames (bottom-up: depth 0 at bottom)
	for _, f := range frames {
		if f.Depth == 0 {
			continue // skip root
		}
		x := svgLeftPad + f.X*drawWidth
		y := float64(svgHeight-svgBottomPad) - float64(f.Depth)*float64(svgFrameHeight)
		w := f.W * drawWidth

		if w < 0.5 {
			continue
		}

		pct := 100.0 * float64(f.Value) / float64(totalValue)
		selfPct := 100.0 * float64(f.SelfValue) / float64(totalValue)
		color := frameColor(profileType, pct, selfPct, f.Name)

		// Truncate label to fit
		maxChars := int(w / 6.5)
		label := f.Name
		if len(label) > maxChars {
			if maxChars > 3 {
				label = label[:maxChars-2] + ".."
			} else {
				label = ""
			}
		}

		fmt.Fprintf(&buf, `<g class="frame" onmouseover="s('%s',%.1f,%d,%.1f)" onmouseout="c()" onclick="zoom(this)">`,
			escSVGAttr(f.FullName), pct, f.Value, selfPct)
		fmt.Fprintf(&buf, `<title>%s (%s, %.1f%%, self: %.1f%%)</title>`,
			escSVG(f.FullName), formatCount(f.Value), pct, selfPct)
		fmt.Fprintf(&buf, `<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>`,
			x, y, w, float64(svgFrameHeight)-1, color)
		if label != "" && w > 20 {
			fmt.Fprintf(&buf, `<text x="%.1f" y="%.1f">%s</text>`,
				x+2, y+float64(svgFrameHeight)-4, escSVG(label))
		}
		buf.WriteString("</g>\n")
	}

	// JavaScript for interactivity
	buf.WriteString(flamegraphJS())

	buf.WriteString("</svg>\n")
	return buf.Bytes()
}

// flattenNode flattens the tree into an array of svgFrames.
func flattenNode(node *profiling.FlameGraphNode, depth int, x float64, totalValue float64) []svgFrame {
	if totalValue <= 0 {
		totalValue = 1
	}
	w := float64(node.Value) / totalValue

	frames := []svgFrame{{
		Name:      node.Name,
		FullName:  node.FullName,
		Value:     node.Value,
		SelfValue: node.SelfValue,
		Depth:     depth,
		X:         x,
		W:         w,
	}}

	// Sort children by value descending for consistent layout
	children := make([]*profiling.FlameGraphNode, len(node.Children))
	copy(children, node.Children)
	sort.Slice(children, func(i, j int) bool {
		return children[i].Value > children[j].Value
	})

	childX := x
	for _, child := range children {
		childFrames := flattenNode(child, depth+1, childX, totalValue)
		frames = append(frames, childFrames...)
		childX += float64(child.Value) / totalValue
	}

	return frames
}

// frameColor returns an SVG fill color based on profile type and metrics.
func frameColor(profileType string, pct, selfPct float64, name string) string {
	// Kernel frames get a special color
	if strings.HasPrefix(name, "k:") || strings.Contains(name, "kthread") ||
		strings.Contains(name, "entry_SYSCALL") || strings.Contains(name, "do_syscall") ||
		strings.Contains(name, "io_schedule") || strings.Contains(name, "swapper") ||
		strings.Contains(name, "cpuidle") || strings.Contains(name, "do_idle") {
		return "#4a5568" // gray for kernel
	}

	switch profileType {
	case "offcpu":
		// Cool colors (blue gradient)
		intensity := math.Min(selfPct/15.0, 1.0)
		r := int(30 + 40*intensity)
		g := int(100 + 80*(1-intensity))
		b := int(180 + 75*intensity)
		return fmt.Sprintf("rgb(%d,%d,%d)", r, g, b)

	case "memory":
		// Green gradient
		intensity := math.Min(selfPct/15.0, 1.0)
		r := int(40 + 60*intensity)
		g := int(160 + 80*(1-intensity))
		b := int(60 + 40*intensity)
		return fmt.Sprintf("rgb(%d,%d,%d)", r, g, b)

	default: // cpu — warm colors (orange/yellow gradient)
		intensity := math.Min(selfPct/15.0, 1.0)
		r := int(200 + 55*intensity)
		g := int(120 + 80*(1-intensity))
		b := int(30 + 50*(1-intensity))
		return fmt.Sprintf("rgb(%d,%d,%d)", r, g, b)
	}
}

// flamegraphJS returns the embedded JavaScript for SVG interactivity.
func flamegraphJS() string {
	return `<script type="text/ecmascript"><![CDATA[
var tooltip = document.getElementById("tooltip");
function s(name, pct, count, selfPct) {
  tooltip.textContent = name + "  (" + pct.toFixed(1) + "%, " + count + " samples, self: " + selfPct.toFixed(1) + "%)";
  tooltip.setAttribute("y", "56");
  tooltip.setAttribute("visibility", "visible");
}
function c() {
  tooltip.setAttribute("visibility", "hidden");
}
function zoom(el) {
  var rect = el.querySelector("rect");
  if (!rect) return;
  var x = parseFloat(rect.getAttribute("x"));
  var w = parseFloat(rect.getAttribute("width"));
  if (w < 1) return;
  var svg = document.querySelector("svg");
  var svgW = parseFloat(svg.getAttribute("width"));
  var scale = svgW / w;
  var tx = -x * scale;
  // Apply transform to all .frame groups
  var frames = document.querySelectorAll(".frame");
  frames.forEach(function(f) {
    var r = f.querySelector("rect");
    if (r) {
      var fx = parseFloat(r.getAttribute("x"));
      var fw = parseFloat(r.getAttribute("width"));
      var nx = fx * scale + tx;
      var nw = fw * scale;
      r.setAttribute("data-ox", r.getAttribute("x"));
      r.setAttribute("data-ow", r.getAttribute("width"));
      r.setAttribute("x", nx);
      r.setAttribute("width", nw);
      var t = f.querySelector("text:not(:first-child)");
      if (!t) t = f.querySelector("text");
      if (t && t !== tooltip) {
        t.setAttribute("data-ox", t.getAttribute("x"));
        t.setAttribute("x", nx + 2);
      }
    }
  });
}
function reset_zoom() {
  var frames = document.querySelectorAll(".frame");
  frames.forEach(function(f) {
    var r = f.querySelector("rect");
    if (r && r.getAttribute("data-ox")) {
      r.setAttribute("x", r.getAttribute("data-ox"));
      r.setAttribute("width", r.getAttribute("data-ow"));
      var t = f.querySelector("text");
      if (t && t.getAttribute("data-ox")) {
        t.setAttribute("x", t.getAttribute("data-ox"));
      }
    }
  });
}
function search_prompt() {
  var term = prompt("Search function name:");
  if (!term) { reset_search(); return; }
  term = term.toLowerCase();
  var frames = document.querySelectorAll(".frame");
  frames.forEach(function(f) {
    var title = f.querySelector("title");
    if (title && title.textContent.toLowerCase().indexOf(term) >= 0) {
      f.classList.add("search-match");
    } else {
      f.classList.remove("search-match");
      f.querySelector("rect").style.opacity = "0.4";
    }
  });
}
function reset_search() {
  var frames = document.querySelectorAll(".frame");
  frames.forEach(function(f) {
    f.classList.remove("search-match");
    f.querySelector("rect").style.opacity = "";
  });
}
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") { reset_zoom(); reset_search(); }
});
]]></script>
`
}

// ── SVG helpers ─────────────────────────────────────────────────────────

func escSVG(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

func escSVGAttr(s string) string {
	s = escSVG(s)
	s = strings.ReplaceAll(s, "'", "&apos;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}

func formatCount(n int64) string {
	if n >= 1_000_000 {
		return fmt.Sprintf("%.1fM", float64(n)/1_000_000)
	}
	if n >= 1_000 {
		return fmt.Sprintf("%.1fK", float64(n)/1_000)
	}
	return fmt.Sprintf("%d", n)
}

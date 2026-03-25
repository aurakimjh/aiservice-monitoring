package main

// Phase 35-3: Differential flamegraph SVG generation.
//
// Generates diff flamegraphs where:
//   - Red frames = regression (target > base)
//   - Blue frames = improvement (target < base)
//   - Neutral = unchanged
//
// Sample counts are normalized before comparison.

import (
	"bytes"
	"fmt"
	"math"
	"sort"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/profiling"
)

// diffFrame represents a flattened diff frame for SVG rendering.
type diffFrame struct {
	Name        string
	FullName    string
	BaseValue   int64
	TargetValue int64
	Delta       int64
	Depth       int
	X           float64
	W           float64
}

// GenerateDiffFlamegraphSVG generates a differential flamegraph SVG.
func GenerateDiffFlamegraphSVG(root *profiling.FlameGraphDiffNode, width int, title string) []byte {
	if root == nil {
		return []byte("<svg></svg>")
	}
	if width <= 0 {
		width = 1200
	}

	totalValue := int64(math.Max(float64(root.BaseValue), float64(root.TargetValue)))
	if totalValue <= 0 {
		totalValue = 1
	}

	frames := flattenDiffNode(root, 0, 0.0, float64(totalValue))
	maxDepth := 0
	maxDelta := int64(0)
	for _, f := range frames {
		if f.Depth > maxDepth {
			maxDepth = f.Depth
		}
		absDelta := f.Delta
		if absDelta < 0 {
			absDelta = -absDelta
		}
		if absDelta > maxDelta {
			maxDelta = absDelta
		}
	}

	svgHeight := svgTopMargin + (maxDepth+1)*svgFrameHeight + svgBottomPad
	drawWidth := float64(width - svgLeftPad - svgRightPad)

	var buf bytes.Buffer

	// SVG header
	fmt.Fprintf(&buf, `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg1.1.dtd">
<svg version="1.1" width="%d" height="%d" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="bg" y1="0" y2="1" x1="0" x2="0">
    <stop stop-color="#1a1a2e" offset="5%%"/>
    <stop stop-color="#16213e" offset="95%%"/>
  </linearGradient>
</defs>
<style>
  .frame:hover rect { opacity: 0.8; stroke: #fff; stroke-width: 0.5; }
  .frame text { font-family: 'Consolas', monospace; font-size: %dpx; fill: #fff; pointer-events: none; }
  .title { font-family: 'Segoe UI', sans-serif; font-size: 16px; fill: #e0e0e0; }
  .subtitle { font-family: 'Segoe UI', sans-serif; font-size: 11px; fill: #888; }
  .legend { font-family: 'Segoe UI', sans-serif; font-size: 11px; }
</style>
`, width, svgHeight, svgFontSize)

	// Background
	fmt.Fprintf(&buf, `<rect x="0" y="0" width="%d" height="%d" fill="url(#bg)"/>`, width, svgHeight)

	// Title
	fmt.Fprintf(&buf, `<text x="%d" y="24" class="title">%s</text>`, svgLeftPad, escSVG(title))
	fmt.Fprintf(&buf, `<text x="%d" y="40" class="subtitle">Differential view: Red = regression, Blue = improvement</text>`, svgLeftPad)

	// Legend
	fmt.Fprintf(&buf, `<rect x="%d" y="10" width="12" height="12" fill="#e53e3e" rx="2"/>`, width-200)
	fmt.Fprintf(&buf, `<text x="%d" y="21" class="legend" fill="#e53e3e">Regression</text>`, width-184)
	fmt.Fprintf(&buf, `<rect x="%d" y="10" width="12" height="12" fill="#3182ce" rx="2"/>`, width-110)
	fmt.Fprintf(&buf, `<text x="%d" y="21" class="legend" fill="#3182ce">Improvement</text>`, width-94)

	// Render frames
	for _, f := range frames {
		if f.Depth == 0 {
			continue
		}
		x := float64(svgLeftPad) + f.X*drawWidth
		y := float64(svgHeight-svgBottomPad) - float64(f.Depth)*float64(svgFrameHeight)
		w := f.W * drawWidth

		if w < 0.5 {
			continue
		}

		color := diffColor(f.Delta, maxDelta)

		maxChars := int(w / 6.5)
		label := f.Name
		if len(label) > maxChars {
			if maxChars > 3 {
				label = label[:maxChars-2] + ".."
			} else {
				label = ""
			}
		}

		deltaStr := fmt.Sprintf("%+d", f.Delta)
		if f.Delta > 0 {
			deltaStr = "+" + formatCount(f.Delta)
		} else if f.Delta < 0 {
			deltaStr = "-" + formatCount(-f.Delta)
		}

		fmt.Fprintf(&buf, `<g class="frame">`)
		fmt.Fprintf(&buf, `<title>%s (base: %s, target: %s, delta: %s)</title>`,
			escSVG(f.FullName), formatCount(f.BaseValue), formatCount(f.TargetValue), deltaStr)
		fmt.Fprintf(&buf, `<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s" rx="1"/>`,
			x, y, w, float64(svgFrameHeight)-1, color)
		if label != "" && w > 20 {
			fmt.Fprintf(&buf, `<text x="%.1f" y="%.1f">%s</text>`,
				x+2, y+float64(svgFrameHeight)-4, escSVG(label))
		}
		buf.WriteString("</g>\n")
	}

	buf.WriteString("</svg>\n")
	return buf.Bytes()
}

// flattenDiffNode flattens a diff tree into an array of diffFrames.
func flattenDiffNode(node *profiling.FlameGraphDiffNode, depth int, x float64, totalValue float64) []diffFrame {
	if totalValue <= 0 {
		totalValue = 1
	}
	maxVal := math.Max(float64(node.BaseValue), float64(node.TargetValue))
	w := maxVal / totalValue

	frames := []diffFrame{{
		Name:        node.Name,
		FullName:    node.FullName,
		BaseValue:   node.BaseValue,
		TargetValue: node.TargetValue,
		Delta:       node.Delta,
		Depth:       depth,
		X:           x,
		W:           w,
	}}

	children := make([]*profiling.FlameGraphDiffNode, len(node.Children))
	copy(children, node.Children)
	sort.Slice(children, func(i, j int) bool {
		mi := math.Max(float64(children[i].BaseValue), float64(children[i].TargetValue))
		mj := math.Max(float64(children[j].BaseValue), float64(children[j].TargetValue))
		return mi > mj
	})

	childX := x
	for _, child := range children {
		childFrames := flattenDiffNode(child, depth+1, childX, totalValue)
		frames = append(frames, childFrames...)
		childMax := math.Max(float64(child.BaseValue), float64(child.TargetValue))
		childX += childMax / totalValue
	}

	return frames
}

// diffColor returns an SVG fill color based on delta direction and magnitude.
func diffColor(delta, maxDelta int64) string {
	if maxDelta == 0 {
		return "#4a6fa5" // neutral blue
	}

	ratio := float64(delta) / float64(maxDelta)

	if ratio > 0.05 {
		// Red for regression (target > base)
		intensity := math.Min(math.Abs(ratio), 1.0)
		r := int(120 + 135*intensity)
		g := int(60 * (1 - intensity))
		b := int(50 * (1 - intensity))
		return fmt.Sprintf("rgb(%d,%d,%d)", r, g, b)
	}
	if ratio < -0.05 {
		// Blue for improvement (target < base)
		intensity := math.Min(math.Abs(ratio), 1.0)
		r := int(40 * (1 - intensity))
		g := int(80 + 50*intensity)
		b := int(140 + 115*intensity)
		return fmt.Sprintf("rgb(%d,%d,%d)", r, g, b)
	}

	// Neutral
	return "#4a6fa5"
}

package profiling

import (
	"bufio"
	"bytes"
	"sort"
	"strconv"
	"strings"
)

// FlameGraphNode represents a node in the flame graph tree.
type FlameGraphNode struct {
	Name      string            `json:"name"`
	FullName  string            `json:"fullName"`
	Value     int64             `json:"value"`     // total samples (inclusive)
	SelfValue int64             `json:"selfValue"` // self samples (exclusive)
	Children  []*FlameGraphNode `json:"children"`
}

// FlameGraphData is the complete flame graph structure.
type FlameGraphData struct {
	ProfileID    string          `json:"profileId"`
	ProfileType  string          `json:"profileType"`
	Language     string          `json:"language"`
	ServiceName  string          `json:"serviceName"`
	TotalSamples int64           `json:"totalSamples"`
	DurationSec  int             `json:"durationSec"`
	Root         *FlameGraphNode `json:"root"`
}

// FlameGraphDiffNode represents a diff between two profiles.
type FlameGraphDiffNode struct {
	Name        string                `json:"name"`
	FullName    string                `json:"fullName"`
	BaseValue   int64                 `json:"baseValue"`
	TargetValue int64                 `json:"targetValue"`
	Delta       int64                 `json:"delta"`
	Children    []*FlameGraphDiffNode `json:"children"`
}

// ParseCollapsedStacks parses collapsed stack format into a flame graph tree.
// Format: "func1;func2;func3 count\n"
func ParseCollapsedStacks(data []byte) *FlameGraphNode {
	root := &FlameGraphNode{Name: "root", FullName: "root"}

	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Split "stack count" by last space
		lastSpace := strings.LastIndex(line, " ")
		if lastSpace < 0 {
			continue
		}
		stack := line[:lastSpace]
		countStr := strings.TrimSpace(line[lastSpace+1:])
		count, err := strconv.ParseInt(countStr, 10, 64)
		if err != nil || count <= 0 {
			continue
		}

		frames := strings.Split(stack, ";")
		addStack(root, frames, count)
	}

	computeValues(root)
	return root
}

// addStack adds a single stack trace to the tree.
func addStack(node *FlameGraphNode, frames []string, count int64) {
	current := node
	for _, frame := range frames {
		frame = strings.TrimSpace(frame)
		if frame == "" {
			continue
		}

		var child *FlameGraphNode
		for _, c := range current.Children {
			if c.Name == frame {
				child = c
				break
			}
		}

		if child == nil {
			child = &FlameGraphNode{
				Name:     frame,
				FullName: frame,
			}
			current.Children = append(current.Children, child)
		}
		current = child
	}
	// Leaf node gets the sample count
	current.SelfValue += count
}

// computeValues calculates inclusive values (self + children) for all nodes.
func computeValues(node *FlameGraphNode) int64 {
	total := node.SelfValue
	for _, child := range node.Children {
		total += computeValues(child)
	}
	node.Value = total
	// Sort children by value descending for consistent rendering
	sort.Slice(node.Children, func(i, j int) bool {
		return node.Children[i].Value > node.Children[j].Value
	})
	return total
}

// DiffFlameGraphs computes the diff between two flame graph trees.
func DiffFlameGraphs(base, target *FlameGraphNode) *FlameGraphDiffNode {
	if base == nil && target == nil {
		return nil
	}

	diff := &FlameGraphDiffNode{}

	if base != nil {
		diff.Name = base.Name
		diff.FullName = base.FullName
		diff.BaseValue = base.Value
	}
	if target != nil {
		diff.Name = target.Name
		diff.FullName = target.FullName
		diff.TargetValue = target.Value
	}
	diff.Delta = diff.TargetValue - diff.BaseValue

	// Build maps for child matching
	baseChildren := make(map[string]*FlameGraphNode)
	if base != nil {
		for _, c := range base.Children {
			baseChildren[c.Name] = c
		}
	}

	targetChildren := make(map[string]*FlameGraphNode)
	if target != nil {
		for _, c := range target.Children {
			targetChildren[c.Name] = c
		}
	}

	// Merge children from both trees
	seen := make(map[string]bool)

	if base != nil {
		for _, bc := range base.Children {
			seen[bc.Name] = true
			tc := targetChildren[bc.Name]
			diff.Children = append(diff.Children, DiffFlameGraphs(bc, tc))
		}
	}

	if target != nil {
		for _, tc := range target.Children {
			if !seen[tc.Name] {
				diff.Children = append(diff.Children, DiffFlameGraphs(nil, tc))
			}
		}
	}

	// Sort by absolute delta descending
	sort.Slice(diff.Children, func(i, j int) bool {
		ai := diff.Children[i].Delta
		aj := diff.Children[j].Delta
		if ai < 0 {
			ai = -ai
		}
		if aj < 0 {
			aj = -aj
		}
		return ai > aj
	})

	return diff
}

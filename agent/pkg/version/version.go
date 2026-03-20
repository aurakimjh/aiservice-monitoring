package version

import "fmt"

// Build-time variables (set via -ldflags)
var (
	Version   = "0.1.0-dev"
	GitCommit = "unknown"
	BuildDate = "unknown"
	GoVersion = "unknown"
)

func Full() string {
	return fmt.Sprintf("aitop-agent %s (commit: %s, built: %s, go: %s)", Version, GitCommit, BuildDate, GoVersion)
}

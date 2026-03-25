//go:build windows

package attach

// sendSIGUSR1 is a no-op on Windows — node.exe must be started with --inspect.
func sendSIGUSR1(_ int) error {
	return nil
}

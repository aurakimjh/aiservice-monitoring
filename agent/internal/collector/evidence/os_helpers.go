package evidence

import "os"

// osFile wraps *os.File to satisfy the dirFile interface used by cross_analysis.go.
type osFile struct{ f *os.File }

func (o *osFile) Close() error { return o.f.Close() }
func (o *osFile) ReadDir(n int) ([]dirEntry, error) {
	entries, err := o.f.ReadDir(n)
	if err != nil {
		return nil, err
	}
	out := make([]dirEntry, len(entries))
	for i, e := range entries {
		out[i] = e
	}
	return out, nil
}

// osOpenDir opens a directory path for ReadDir operations.
func osOpenDir(path string) (dirFile, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	return &osFile{f: f}, nil
}

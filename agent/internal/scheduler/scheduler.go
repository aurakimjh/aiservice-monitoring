// Package scheduler provides cron-expression-based job scheduling with
// immediate-trigger support for the AITOP Agent collection pipeline.
package scheduler

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Job is a named, cron-scheduled task.
type Job struct {
	ID      string
	Cron    string
	Handler func(ctx context.Context)
	sched   *cronSched
}

// Scheduler manages cron-based job execution with optional immediate triggers.
type Scheduler struct {
	mu      sync.RWMutex
	jobs    map[string]*Job
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	trigger chan string
	logger  *slog.Logger
}

// New creates a new Scheduler.
func New(logger *slog.Logger) *Scheduler {
	return &Scheduler{
		jobs:    make(map[string]*Job),
		trigger: make(chan string, 32),
		logger:  logger,
	}
}

// Register adds a cron job. expr may be 5-field (min hour dom month dow)
// or 6-field (sec min hour dom month dow). Returns an error if the expression
// cannot be parsed.
func (s *Scheduler) Register(id, expr string, handler func(ctx context.Context)) error {
	sc, err := parseCron(expr)
	if err != nil {
		return fmt.Errorf("scheduler: invalid cron %q for job %q: %w", expr, id, err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jobs[id] = &Job{ID: id, Cron: expr, Handler: handler, sched: sc}
	s.logger.Info("scheduler: job registered", "id", id, "cron", expr)
	return nil
}

// Trigger queues an immediate (out-of-schedule) execution of the named job.
// Silently discards the request if the internal queue is full.
func (s *Scheduler) Trigger(jobID string) {
	select {
	case s.trigger <- jobID:
		s.logger.Info("scheduler: job triggered immediately", "id", jobID)
	default:
		s.logger.Warn("scheduler: trigger queue full, request dropped", "id", jobID)
	}
}

// Start begins scheduling all registered jobs. It runs until ctx is cancelled
// or Stop is called.
func (s *Scheduler) Start(parent context.Context) {
	s.mu.Lock()
	s.ctx, s.cancel = context.WithCancel(parent)
	jobs := make([]*Job, 0, len(s.jobs))
	for _, j := range s.jobs {
		jobs = append(jobs, j)
	}
	s.mu.Unlock()

	for _, j := range jobs {
		s.wg.Add(1)
		go s.loop(j)
	}

	// Immediate-trigger dispatcher goroutine.
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		for {
			select {
			case <-s.ctx.Done():
				return
			case id := <-s.trigger:
				s.mu.RLock()
				j, ok := s.jobs[id]
				s.mu.RUnlock()
				if !ok {
					s.logger.Warn("scheduler: unknown job in trigger", "id", id)
					continue
				}
				s.wg.Add(1)
				go func(job *Job) {
					defer s.wg.Done()
					job.Handler(s.ctx)
				}(j)
			}
		}
	}()
}

// Stop cancels the scheduling context and waits for all running jobs to finish.
func (s *Scheduler) Stop() {
	if s.cancel != nil {
		s.cancel()
	}
	s.wg.Wait()
	s.logger.Info("scheduler: all jobs stopped")
}

// Jobs returns a snapshot of registered job IDs.
func (s *Scheduler) Jobs() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ids := make([]string, 0, len(s.jobs))
	for id := range s.jobs {
		ids = append(ids, id)
	}
	return ids
}

func (s *Scheduler) loop(j *Job) {
	defer s.wg.Done()
	for {
		next := j.sched.next(time.Now())
		select {
		case <-s.ctx.Done():
			return
		case <-time.After(time.Until(next)):
			s.logger.Info("scheduler: executing job", "id", j.ID)
			j.Handler(s.ctx)
		}
	}
}

// ─── cron expression parser ────────────────────────────────────────────────────

type cronSched struct {
	secs       []bool // [0..59]
	minutes    []bool // [0..59]
	hours      []bool // [0..23]
	days       []bool // [1..31]
	months     []bool // [1..12]
	weekdays   []bool // [0..6] Sunday=0
	hasSeconds bool
}

// next returns the earliest trigger time strictly after t.
func (c *cronSched) next(t time.Time) time.Time {
	if c.hasSeconds {
		t = t.Truncate(time.Second).Add(time.Second)
	} else {
		t = t.Truncate(time.Minute).Add(time.Minute)
	}

	limit := t.Add(2 * 366 * 24 * time.Hour)
	for t.Before(limit) {
		if !c.months[int(t.Month())] {
			// Advance to 1st of next month.
			t = time.Date(t.Year(), t.Month()+1, 1, 0, 0, 0, 0, t.Location())
			continue
		}
		if !c.days[t.Day()] || !c.weekdays[int(t.Weekday())] {
			// Advance to next day.
			t = time.Date(t.Year(), t.Month(), t.Day()+1, 0, 0, 0, 0, t.Location())
			continue
		}
		if !c.hours[t.Hour()] {
			// Advance to next hour.
			t = time.Date(t.Year(), t.Month(), t.Day(), t.Hour()+1, 0, 0, 0, t.Location())
			continue
		}
		if !c.minutes[t.Minute()] {
			t = t.Truncate(time.Minute).Add(time.Minute)
			continue
		}
		if c.hasSeconds && !c.secs[t.Second()] {
			t = t.Truncate(time.Second).Add(time.Second)
			continue
		}
		return t
	}
	return limit
}

// parseCron parses a 5-field (min hour dom month dow) or 6-field
// (sec min hour dom month dow) cron expression.
func parseCron(expr string) (*cronSched, error) {
	f := strings.Fields(expr)
	switch len(f) {
	case 5:
		// Standard 5-field: treat seconds as always-0.
		return parseCronFields("0", f[0], f[1], f[2], f[3], f[4], false)
	case 6:
		return parseCronFields(f[0], f[1], f[2], f[3], f[4], f[5], true)
	default:
		return nil, fmt.Errorf("expected 5 or 6 fields, got %d", len(f))
	}
}

func parseCronFields(sec, min, hour, dom, month, dow string, hasSeconds bool) (*cronSched, error) {
	sc := &cronSched{
		secs:       make([]bool, 60),
		minutes:    make([]bool, 60),
		hours:      make([]bool, 24),
		days:       make([]bool, 32),
		months:     make([]bool, 13),
		weekdays:   make([]bool, 7),
		hasSeconds: hasSeconds,
	}
	if err := parseField(sec, 0, 59, sc.secs); err != nil {
		return nil, fmt.Errorf("second field: %w", err)
	}
	if err := parseField(min, 0, 59, sc.minutes); err != nil {
		return nil, fmt.Errorf("minute field: %w", err)
	}
	if err := parseField(hour, 0, 23, sc.hours); err != nil {
		return nil, fmt.Errorf("hour field: %w", err)
	}
	if err := parseField(dom, 1, 31, sc.days); err != nil {
		return nil, fmt.Errorf("day-of-month field: %w", err)
	}
	if err := parseField(month, 1, 12, sc.months); err != nil {
		return nil, fmt.Errorf("month field: %w", err)
	}
	if err := parseField(dow, 0, 6, sc.weekdays); err != nil {
		return nil, fmt.Errorf("day-of-week field: %w", err)
	}
	return sc, nil
}

// parseField parses a single cron field that may contain comma-separated parts.
func parseField(field string, lo, hi int, bits []bool) error {
	for _, part := range strings.Split(field, ",") {
		if err := parsePart(part, lo, hi, bits); err != nil {
			return err
		}
	}
	return nil
}

// parsePart handles: *, N, N-M, */step, N-M/step.
func parsePart(part string, lo, hi int, bits []bool) error {
	step := 1
	if idx := strings.IndexByte(part, '/'); idx >= 0 {
		v, err := strconv.Atoi(part[idx+1:])
		if err != nil || v <= 0 {
			return fmt.Errorf("invalid step in %q", part)
		}
		step = v
		part = part[:idx]
	}

	var a, b int
	switch {
	case part == "*":
		a, b = lo, hi
	case strings.IndexByte(part, '-') >= 0:
		idx := strings.IndexByte(part, '-')
		x, err1 := strconv.Atoi(part[:idx])
		y, err2 := strconv.Atoi(part[idx+1:])
		if err1 != nil || err2 != nil {
			return fmt.Errorf("invalid range in %q", part)
		}
		a, b = x, y
	default:
		v, err := strconv.Atoi(part)
		if err != nil {
			return fmt.Errorf("invalid value %q", part)
		}
		a, b = v, v
	}

	if a < lo || b > hi || a > b {
		return fmt.Errorf("value out of range [%d..%d] in %q", lo, hi, part)
	}
	for i := a; i <= b; i += step {
		bits[i] = true
	}
	return nil
}

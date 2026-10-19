// Package ratelimit provides small in-memory limiters for a single gateway process.
package ratelimit

import (
	"sync"
	"time"
)

// Window counts events per key in fixed windows. A nil Window or a limit <= 0 never limits.
type Window struct {
	mu        sync.Mutex
	limit     int
	period    time.Duration
	now       func() time.Time
	buckets   map[string]*window
	lastSweep time.Time
}

type window struct {
	start time.Time
	count int
}

func NewWindow(limit int, period time.Duration) *Window {
	return &Window{limit: limit, period: period, now: time.Now, buckets: make(map[string]*window)}
}

// Allow records one event for key and reports whether it is within the limit.
func (w *Window) Allow(key string) bool {
	if w == nil || w.limit <= 0 {
		return true
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	b := w.current(key)
	if b.count >= w.limit {
		return false
	}
	b.count++
	return true
}

// Exceeded reports whether key has used its whole limit, without recording an event.
func (w *Window) Exceeded(key string) bool {
	if w == nil || w.limit <= 0 {
		return false
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	b, ok := w.buckets[key]
	return ok && w.now().Sub(b.start) < w.period && b.count >= w.limit
}

func (w *Window) current(key string) *window {
	now := w.now()
	if now.Sub(w.lastSweep) >= w.period {
		for k, b := range w.buckets {
			if now.Sub(b.start) >= w.period {
				delete(w.buckets, k)
			}
		}
		w.lastSweep = now
	}
	b, ok := w.buckets[key]
	if !ok || now.Sub(b.start) >= w.period {
		b = &window{start: now}
		w.buckets[key] = b
	}
	return b
}

// Concurrency caps in-flight work per key. A nil Concurrency or a limit <= 0 never limits.
type Concurrency struct {
	mu     sync.Mutex
	limit  int
	active map[string]int
}

func NewConcurrency(limit int) *Concurrency {
	return &Concurrency{limit: limit, active: make(map[string]int)}
}

// Acquire reserves a slot for key; call release exactly when the work ends (it is idempotent).
func (c *Concurrency) Acquire(key string) (release func(), ok bool) {
	if c == nil || c.limit <= 0 {
		return func() {}, true
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.active[key] >= c.limit {
		return func() {}, false
	}
	c.active[key]++
	var once sync.Once
	return func() {
		once.Do(func() {
			c.mu.Lock()
			defer c.mu.Unlock()
			if c.active[key] <= 1 {
				delete(c.active, key)
			} else {
				c.active[key]--
			}
		})
	}, true
}

// Package admission coordinates inference requests with planned machine shutdown.
package admission

import (
	"context"
	"sync"
)

// Gate atomically admits and tracks requests. Its zero value starts open.
type Gate struct {
	mu      sync.Mutex
	active  int
	closed  bool
	reason  string
	changed chan struct{}
}

func New() *Gate { return &Gate{} }

// Enter returns an idempotent release function; call it after the response stream ends.
func (g *Gate) Enter() (release func(), ok bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.closed {
		return nil, false
	}
	g.active++
	var once sync.Once
	return func() {
		once.Do(func() {
			g.mu.Lock()
			defer g.mu.Unlock()
			g.active--
			g.notifyLocked()
		})
	}, true
}

// Close blocks new requests without cancelling those already admitted.
func (g *Gate) Close(reason string) {
	if reason == "" {
		reason = "Spark is shutting down. Please try again when it is ready."
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	g.closed = true
	g.reason = reason
}

func (g *Gate) Open() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.closed = false
	g.reason = ""
}

// Snapshot returns the active count and blocking reason (empty when open).
func (g *Gate) Snapshot() (active int, reason string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.active, g.reason
}

// Wait drains active requests; keep admission closed when authorizing shutdown.
func (g *Gate) Wait(ctx context.Context) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		g.mu.Lock()
		if g.active == 0 {
			g.mu.Unlock()
			return nil
		}
		if g.changed == nil {
			g.changed = make(chan struct{})
		}
		changed := g.changed
		g.mu.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-changed:
		}
	}
}

func (g *Gate) notifyLocked() {
	if g.changed != nil {
		close(g.changed)
		g.changed = nil
	}
}
